/**
 * OS-163: when the peer sync_events feed returns `resync_needed` (cursor behind
 * a retention gap), reset the pull cursor and reload table snapshots instead of
 * silently going stale.
 */

import { db } from "../../db/index.js";
import { coreSyncEventReplicationState } from "../../db/schema.js";
import { appendOpsLog } from "../../lib/ops-log-buffer.js";
import { bootstrapTableFromPeer } from "./apply.js";
import { getCoreReplicationConfig } from "./config.js";
import { BOOTSTRAP_TABLES } from "./constants.js";
import { listActiveBootstrapTables } from "./fetch.js";
import { tableExists } from "./cursors.js";
import type { ReplicationChange } from "./types.js";

export type SyncEventResyncStatus =
  | "idle"
  | "needed"
  | "bootstrapping"
  | "failed";

export type SyncEventResyncState = {
  workspaceId: string;
  status: SyncEventResyncStatus;
  needed: boolean;
  message: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

type ResyncEntry = {
  status: SyncEventResyncStatus;
  message: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** In-flight promise so concurrent pulls share one bootstrap. */
  running: Promise<void> | null;
};

const byWorkspace = new Map<string, ResyncEntry>();

function entryFor(workspaceId: string): ResyncEntry {
  let entry = byWorkspace.get(workspaceId);
  if (!entry) {
    entry = {
      status: "idle",
      message: null,
      startedAt: null,
      finishedAt: null,
      running: null,
    };
    byWorkspace.set(workspaceId, entry);
  }
  return entry;
}

export function getSyncEventResyncState(
  workspaceId: string,
): SyncEventResyncState {
  const entry = entryFor(workspaceId);
  return {
    workspaceId,
    status: entry.status,
    needed: entry.status === "needed" || entry.status === "bootstrapping" || entry.status === "failed",
    message: entry.message,
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt,
  };
}

/** Aggregate across configured workspaces for ops sync-health. */
export function getAnySyncEventResyncState(
  workspaceIds: string[],
): SyncEventResyncState | null {
  if (workspaceIds.length === 0) return null;
  let preferred: SyncEventResyncState | null = null;
  for (const workspaceId of workspaceIds) {
    const state = getSyncEventResyncState(workspaceId);
    if (state.status === "idle") continue;
    if (
      !preferred ||
      rankStatus(state.status) > rankStatus(preferred.status)
    ) {
      preferred = state;
    }
  }
  return preferred;
}

function rankStatus(status: SyncEventResyncStatus): number {
  switch (status) {
    case "failed":
      return 3;
    case "bootstrapping":
      return 2;
    case "needed":
      return 1;
    default:
      return 0;
  }
}

export function resetSyncEventResyncStateForTests(): void {
  byWorkspace.clear();
}

/**
 * Force the ordered pull cursor to `afterCursor` even when decreasing
 * (normal {@link setSyncEventPullCursor} only advances).
 */
export async function forceSetSyncEventPullCursor(
  workspaceId: string,
  afterCursor: number,
): Promise<void> {
  const next = Math.max(0, Math.floor(afterCursor));
  await db
    .insert(coreSyncEventReplicationState)
    .values({
      workspaceId,
      afterCursor: next,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: coreSyncEventReplicationState.workspaceId,
      set: {
        afterCursor: next,
        updatedAt: new Date(),
      },
    });
}

async function fetchPeerBootstrapRows(
  table: string,
): Promise<ReplicationChange[]> {
  const config = getCoreReplicationConfig();
  if (!config) return [];
  if (!(await tableExists(table))) return [];

  const url = new URL(`${config.peerUrl}/internal/core-replication/bootstrap`);
  url.searchParams.set("table", table);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.secret}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `bootstrap fetch ${table} failed (${response.status}): ${body}`,
      );
    }
    const payload = (await response.json()) as { changes: ReplicationChange[] };
    return payload.changes ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

async function runTableBootstrap(workspaceId: string): Promise<void> {
  const activeTables = await listActiveBootstrapTables();
  const ordered = BOOTSTRAP_TABLES.filter((table) =>
    activeTables.includes(table),
  );
  for (const table of ordered) {
    const changes = await fetchPeerBootstrapRows(table);
    if (changes.length === 0) continue;
    // Pull-only: never advance push watermarks during a resync, or unpushed
    // local rows would be skipped by the cursor path.
    await bootstrapTableFromPeer(table, changes, {
      cursorDirections: ["pull"],
    });
    appendOpsLog(
      "info",
      "core sync-events resync bootstrap",
      `workspace=${workspaceId} table=${table} rows=${changes.length}`,
    );
  }
}

export type BeginSyncEventResyncOptions = {
  /**
   * Peer `last_sync_id` captured *before* the reload. After bootstrap the
   * ordered pull cursor is set to this tip (not 0) so a multi-page catch-up
   * does not re-trigger resync against a large backlog.
   */
  peerLastSyncId?: number | null;
};

/**
 * Mark resync needed, reload table snapshots (pull cursors only), then set the
 * ordered sync-event pull cursor to the peer tip captured before reload.
 * Concurrent calls coalesce onto one in-flight run.
 */
export function beginSyncEventResync(
  workspaceId: string,
  options: BeginSyncEventResyncOptions = {},
): Promise<void> {
  const entry = entryFor(workspaceId);
  if (entry.running) return entry.running;

  const capturedTip =
    typeof options.peerLastSyncId === "number" &&
    Number.isFinite(options.peerLastSyncId) &&
    options.peerLastSyncId > 0
      ? Math.floor(options.peerLastSyncId)
      : null;

  entry.status = "bootstrapping";
  entry.message = "Peer sync log has a gap — reloading snapshot from peer";
  entry.startedAt = new Date().toISOString();
  entry.finishedAt = null;

  const run = (async () => {
    try {
      appendOpsLog(
        "warn",
        "core sync-events resync started",
        `workspace=${workspaceId} bootstrapping tables (pull cursors only); sync-event cursor will be set to ${capturedTip ?? "unchanged"}`,
      );
      await runTableBootstrap(workspaceId);
      if (capturedTip != null) {
        await forceSetSyncEventPullCursor(workspaceId, capturedTip);
      }
      entry.status = "idle";
      entry.message = null;
      entry.finishedAt = new Date().toISOString();
      appendOpsLog(
        "info",
        "core sync-events resync finished",
        `workspace=${workspaceId} after_cursor=${capturedTip ?? "unchanged"}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      entry.status = "failed";
      entry.message = message;
      entry.finishedAt = new Date().toISOString();
      appendOpsLog(
        "error",
        "core sync-events resync failed",
        `workspace=${workspaceId}: ${message}`,
      );
    } finally {
      entry.running = null;
    }
  })();

  entry.running = run;
  return run;
}

/** Mark needed without starting bootstrap (tests / surface-before-run). */
export function markSyncEventResyncNeeded(
  workspaceId: string,
  message = "Peer sync log has a gap — full resync required",
): void {
  const entry = entryFor(workspaceId);
  if (entry.status === "bootstrapping") return;
  entry.status = "needed";
  entry.message = message;
  entry.startedAt = entry.startedAt ?? new Date().toISOString();
  entry.finishedAt = null;
}

export async function clearSyncEventResyncAfterAck(
  workspaceId: string,
): Promise<void> {
  const entry = entryFor(workspaceId);
  if (entry.running) await entry.running;
  byWorkspace.delete(workspaceId);
  // Ensure row exists for workspace lookups after clear.
  entryFor(workspaceId);
}
