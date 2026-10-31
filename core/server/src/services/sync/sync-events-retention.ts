/**
 * sync_events retention (OS-162 / audit #9).
 *
 * Single place to change the window — {@link SYNC_EVENTS_RETENTION_DAYS}.
 * Deletes only events that are both older than the window and already
 * processed by every sync_events consumer. Events still waiting to be
 * replicated or retried are never deleted, regardless of age.
 */

import { lt, sql } from "drizzle-orm";

import { db } from "../../db/index.js";
import {
  coreSyncEventReplicationState,
  syncEvents,
} from "../../db/schema.js";
import { appendOpsLog } from "../../lib/ops-log-buffer.js";
import { getCoreReplicationConfig } from "../core-replication/config.js";

/**
 * Retention window for processed sync_events. Change this number only —
 * Remon adjusts retention here.
 */
export const SYNC_EVENTS_RETENTION_DAYS = 30;

/** Max rows deleted per prune tick (keeps each tick short). */
export const SYNC_EVENTS_PRUNE_BATCH_SIZE = 5_000;

const DEFAULT_PRUNE_INTERVAL_MS = 60 * 60 * 1000; // hourly

export function syncEventsRetentionCutoff(
  now: Date = new Date(),
  retentionDays: number = SYNC_EVENTS_RETENTION_DAYS,
): Date {
  const days = Math.max(1, Math.trunc(retentionDays));
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Cloud leaders serve the ordered sync_events feed to the peer. On that role,
 * an event is processed only once the peer has advanced past its cursor
 * (`peer_after_cursor`). Other roles do not serve the feed, so age alone
 * means processed (nothing is waiting on this core's log).
 */
export function syncEventsFeedRequiresPeerCursor(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return getCoreReplicationConfig(env)?.role === "cloud";
}

/**
 * Record that a feed consumer has already applied every event with
 * `cursor <= afterCursor` (the `after` query param on the feed).
 */
export async function recordSyncEventFeedConsumerCursor(
  workspaceId: string,
  afterCursor: number,
): Promise<void> {
  if (!Number.isFinite(afterCursor) || afterCursor < 0) return;
  const cursor = Math.trunc(afterCursor);

  await db
    .insert(coreSyncEventReplicationState)
    .values({
      workspaceId,
      afterCursor: 0,
      peerAfterCursor: cursor,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: coreSyncEventReplicationState.workspaceId,
      set: {
        peerAfterCursor: sql`GREATEST(${coreSyncEventReplicationState.peerAfterCursor}, ${cursor})`,
        updatedAt: new Date(),
      },
    });
}

export type PruneSyncEventsResult = {
  deleted: number;
  cutoff: string;
  peerGated: boolean;
};

function deletedCountFromExecute(result: unknown): number {
  if (Array.isArray(result)) return result.length;
  if (
    result &&
    typeof result === "object" &&
    "count" in result &&
    typeof (result as { count: unknown }).count === "number"
  ) {
    return (result as { count: number }).count;
  }
  if (
    result &&
    typeof result === "object" &&
    "rowCount" in result &&
    typeof (result as { rowCount: unknown }).rowCount === "number"
  ) {
    return (result as { rowCount: number }).rowCount;
  }
  return 0;
}

/**
 * Delete processed sync_events older than {@link SYNC_EVENTS_RETENTION_DAYS}.
 * Never deletes events above the peer consumer watermark on cloud leaders.
 */
export async function pruneProcessedSyncEvents(
  options: {
    now?: Date;
    batchSize?: number;
    retentionDays?: number;
  } = {},
): Promise<PruneSyncEventsResult> {
  const retentionDays = options.retentionDays ?? SYNC_EVENTS_RETENTION_DAYS;
  const cutoff = syncEventsRetentionCutoff(options.now, retentionDays);
  const cutoffIso = cutoff.toISOString();
  const batchSize = Math.min(
    Math.max(1, options.batchSize ?? SYNC_EVENTS_PRUNE_BATCH_SIZE),
    50_000,
  );
  const peerGated = syncEventsFeedRequiresPeerCursor();

  let deleted = 0;

  if (peerGated) {
    // Cloud leader: only rows the peer has already consumed (cursor <= peer_after_cursor).
    const result = await db.execute(sql`
      WITH doomed AS (
        SELECT se.cursor
        FROM sync_events se
        INNER JOIN core_sync_event_replication_state st
          ON st.workspace_id = se.workspace_id
        WHERE se.created_at < ${cutoffIso}::timestamptz
          AND st.peer_after_cursor > 0
          AND se.cursor <= st.peer_after_cursor
        ORDER BY se.cursor
        LIMIT ${batchSize}
      )
      DELETE FROM sync_events se
      USING doomed
      WHERE se.cursor = doomed.cursor
      RETURNING se.cursor
    `);
    deleted = deletedCountFromExecute(result);
  } else {
    // Local / no replication: this core's sync_events log is not the peer feed.
    const result = await db.execute(sql`
      WITH doomed AS (
        SELECT cursor
        FROM sync_events
        WHERE created_at < ${cutoffIso}::timestamptz
        ORDER BY cursor
        LIMIT ${batchSize}
      )
      DELETE FROM sync_events se
      USING doomed
      WHERE se.cursor = doomed.cursor
      RETURNING se.cursor
    `);
    deleted = deletedCountFromExecute(result);
  }

  if (deleted > 0) {
    appendOpsLog(
      "info",
      "sync_events prune",
      `deleted=${deleted} cutoff=${cutoff.toISOString()} peerGated=${peerGated} retentionDays=${retentionDays}`,
    );
  }

  return {
    deleted,
    cutoff: cutoff.toISOString(),
    peerGated,
  };
}

/** Count how many rows would be eligible (read-only helper for ops/tests). */
export async function countPrunableSyncEvents(
  options: { now?: Date; retentionDays?: number } = {},
): Promise<number> {
  const retentionDays = options.retentionDays ?? SYNC_EVENTS_RETENTION_DAYS;
  const cutoff = syncEventsRetentionCutoff(options.now, retentionDays);
  const peerGated = syncEventsFeedRequiresPeerCursor();

  if (peerGated) {
    const cutoffIso = cutoff.toISOString();
    const result = await db.execute(sql`
      SELECT count(*)::int AS n
      FROM sync_events se
      INNER JOIN core_sync_event_replication_state st
        ON st.workspace_id = se.workspace_id
      WHERE se.created_at < ${cutoffIso}::timestamptz
        AND st.peer_after_cursor > 0
        AND se.cursor <= st.peer_after_cursor
    `);
    const rows = Array.isArray(result)
      ? result
      : ((result as { rows?: Array<{ n: number }> }).rows ?? []);
    return Number((rows[0] as { n?: number } | undefined)?.n ?? 0);
  }

  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(syncEvents)
    .where(lt(syncEvents.createdAt, cutoff));
  return Number(row?.n ?? 0);
}

let pruneTimer: ReturnType<typeof setInterval> | null = null;

export function startSyncEventsRetentionPruner(
  intervalMs = DEFAULT_PRUNE_INTERVAL_MS,
): void {
  if (pruneTimer) return;
  const tick = () => {
    void pruneProcessedSyncEvents().catch((error) => {
      console.error("sync_events prune failed", error);
      appendOpsLog(
        "error",
        "sync_events prune failed",
        error instanceof Error ? error.message : String(error),
      );
    });
  };
  tick();
  pruneTimer = setInterval(tick, intervalMs);
  appendOpsLog(
    "info",
    "sync_events retention pruner started",
    `retentionDays=${SYNC_EVENTS_RETENTION_DAYS} intervalMs=${intervalMs}`,
  );
}

export function stopSyncEventsRetentionPruner(): void {
  if (pruneTimer) {
    clearInterval(pruneTimer);
    pruneTimer = null;
  }
}
