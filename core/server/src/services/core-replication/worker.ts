import { appendOpsLog } from "../../lib/ops-log-buffer.js";
import {
  getCoreReplicationConfig,
  resolveReplicationIntervalMs,
} from "./config.js";
import { applyRemoteChanges } from "./apply.js";
import {
  fetchLocalChanges,
  listActiveReplicatedTables,
} from "./fetch.js";
import { getReplicationCursor, setReplicationCursor } from "./cursors.js";
import { getChangesSince } from "./sync.js";
import type { ReplicatedTable } from "./constants.js";
import type { ReplicationApplyRequest, ReplicationChangesResponse } from "./types.js";
import { pullPeerSyncEvents } from "./sync-event-replication.js";
import { syncVaultWithPeer } from "./vault-replication.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const PAGE_SIZE = 100;

function replicationHeaders(secret: string): HeadersInit {
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
}

export async function pullTable(table: ReplicatedTable) {
  const config = getCoreReplicationConfig();
  if (!config) return;

  // Pull watermark is independent of push — advancing peer tip must not
  // skip local rows that are still older than the peer tip.
  let cursor = await getReplicationCursor(table, "pull");
  let appliedTotal = 0;
  let skippedTotal = 0;

  for (;;) {
    const url = new URL(`${config.peerUrl}/internal/core-replication/changes`);
    url.searchParams.set("table", table);
    url.searchParams.set("since", cursor.updatedAt);
    url.searchParams.set("since_id", cursor.rowId);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: replicationHeaders(config.secret),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`pull ${table} failed (${response.status}): ${body}`);
      }

      const payload = (await response.json()) as ReplicationChangesResponse;
      if (payload.changes.length === 0) {
        break;
      }

      const result = await applyRemoteChanges(table, payload.changes);
      await setReplicationCursor(table, payload.cursor, "pull");
      cursor = payload.cursor;
      appliedTotal += result.applied;
      skippedTotal += result.skipped;

      if (payload.changes.length < PAGE_SIZE) {
        break;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  if (appliedTotal > 0 || skippedTotal > 0) {
    appendOpsLog(
      "info",
      `core replication pull ${table}`,
      `${appliedTotal} applied, ${skippedTotal} skipped (${config.role})`,
    );
  }
}

export async function pushTable(table: ReplicatedTable) {
  const config = getCoreReplicationConfig();
  if (!config) return;

  let cursor = await getReplicationCursor(table, "push");
  let pushed = 0;

  for (;;) {
    const { changes, cursor: nextCursor } = await fetchLocalChanges(table, cursor);
    if (changes.length === 0) {
      break;
    }

    const body: ReplicationApplyRequest = { table, changes };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(
        `${config.peerUrl}/internal/core-replication/apply`,
        {
          method: "POST",
          headers: replicationHeaders(config.secret),
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`push ${table} failed (${response.status}): ${text}`);
      }

      pushed += changes.length;
      cursor = nextCursor;
      await setReplicationCursor(table, cursor, "push");

      if (changes.length < PAGE_SIZE) {
        break;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  if (pushed > 0) {
    appendOpsLog(
      "info",
      `core replication push ${table}`,
      `${pushed} rows (${config.role})`,
    );
  }
}

export async function runCoreReplicationTick(): Promise<void> {
  const config = getCoreReplicationConfig();
  if (!config) return;

  // Linear-shaped: local-core applies peer sync_events in cursor order before
  // table LWW catch-up. Cloud is the leader clock; do not pull this feed as cloud.
  try {
    await pullPeerSyncEvents();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`core replication failed on sync-events: ${message}`, {
      cause: error,
    });
  }

  // Per-table isolation: one peer schema lag / apply 500 must not stall every
  // later table (e.g. workspace_integration_secrets blocking api_keys).
  const tables = await listActiveReplicatedTables();
  const tableErrors: string[] = [];
  for (const table of tables) {
    // Pull and push are independent: inbound soft-unique/FK conflicts must not
    // block local→peer catch-up (and vice versa).
    try {
      await pullTable(table);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      tableErrors.push(`${table} pull: ${message}`);
      appendOpsLog(
        "error",
        `core replication failed on table ${table} (pull)`,
        message,
      );
      console.error(`core replication failed on table ${table} (pull)`, error);
    }
    try {
      await pushTable(table);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      tableErrors.push(`${table} push: ${message}`);
      appendOpsLog(
        "error",
        `core replication failed on table ${table} (push)`,
        message,
      );
      console.error(`core replication failed on table ${table} (push)`, error);
    }
  }
  if (tableErrors.length > 0) {
    throw new Error(
      `core replication failed on ${tableErrors.length} table(s): ${tableErrors.join("; ")}`,
    );
  }

  if (config.role === "local") {
    try {
      await syncVaultWithPeer();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`core replication failed on vault: ${message}`, {
        cause: error,
      });
    }
  }
}

let workerTimer: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;

export function startCoreReplicationWorker(intervalMs?: number): void {
  if (workerTimer || !getCoreReplicationConfig()) {
    return;
  }

  const resolvedIntervalMs = intervalMs ?? resolveReplicationIntervalMs();

  const tick = () => {
    if (tickInFlight) {
      return;
    }
    tickInFlight = true;
    void runCoreReplicationTick()
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error("core replication tick failed", error);
        appendOpsLog("error", "core replication tick failed", message);
      })
      .finally(() => {
        tickInFlight = false;
      });
  };

  tick();
  workerTimer = setInterval(tick, resolvedIntervalMs);
  appendOpsLog(
    "info",
    "core replication worker started",
    `interval=${resolvedIntervalMs}ms`,
  );
}

export function stopCoreReplicationWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}

export { getChangesSince, applyRemoteChanges };

/**
 * After local_fallback (or any write that did not go through the leader clock),
 * push the affected tables to the peer immediately instead of waiting for the
 * periodic tick. Fire-and-forget; peer offline → next tick retries.
 */
export function scheduleTableReplicationPush(
  tables: readonly ReplicatedTable[],
  reason = "entity-write",
): void {
  if (tables.length === 0 || !getCoreReplicationConfig()) return;

  void (async () => {
    for (const table of tables) {
      try {
        await pushTable(table);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendOpsLog(
          "warn",
          `core replication immediate push failed (${reason})`,
          `${table}: ${message}`,
        );
      }
    }
  })();
}

/**
 * Peer wake path: pull specific tables from the other core so metadata writes
 * (CRM groups, contacts, …) land without waiting for the 15s tick.
 */
export function scheduleTableReplicationPull(
  tables: readonly ReplicatedTable[],
  reason = "nudge",
): void {
  if (tables.length === 0 || !getCoreReplicationConfig()) return;

  void (async () => {
    for (const table of tables) {
      try {
        await pullTable(table);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendOpsLog(
          "warn",
          `core replication immediate pull failed (${reason})`,
          `${table}: ${message}`,
        );
      }
    }
  })();
}
