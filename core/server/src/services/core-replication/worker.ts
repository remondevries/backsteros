import { appendOpsLog } from "../../lib/ops-log-buffer.js";
import {
  getCoreReplicationConfig,
  resolveReplicationIntervalMs,
} from "./config.js";
import { applyRemoteChanges, applyReplicationRow } from "./apply.js";
import {
  retryReplicationDeadLetters,
} from "./dead-letters.js";
import {
  notePullOutcome,
  resetEmptyPullStateForTests,
  shouldDeferEmptyPull,
} from "./empty-pull-backoff.js";
import {
  fetchLocalChanges,
  listActiveReplicatedTables,
} from "./fetch.js";
import { getReplicationCursor, setReplicationCursor } from "./cursors.js";
import { runReplicationReconcile } from "./reconcile.js";
import { getChangesSince } from "./sync.js";
import type { ReplicatedTable } from "./constants.js";
import type {
  ReplicationApplyRequest,
  ReplicationApplyResponse,
  ReplicationChangesResponse,
} from "./types.js";
import { pullPeerSyncEvents } from "./sync-event-replication.js";
import { syncVaultWithPeer } from "./vault-replication.js";
import { checkPeerBuildVersion } from "./peer-version.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const PAGE_SIZE = 100;

export function resetReplicationWorkerStateForTests(): void {
  resetEmptyPullStateForTests();
}

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
  const nowMs = Date.now();
  if (shouldDeferEmptyPull(table, cursor, nowMs)) {
    return;
  }
  let appliedTotal = 0;
  let skippedTotal = 0;
  let failedTotal = 0;
  let hadChanges = false;

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
      hadChanges = true;

      const result = await applyRemoteChanges(table, payload.changes, {
        direction: "pull",
      });
      // Always advance past the page — failed rows are dead-lettered for retry.
      await setReplicationCursor(table, payload.cursor, "pull");
      cursor = payload.cursor;
      appliedTotal += result.applied;
      skippedTotal += result.skipped;
      failedTotal += result.failed.length;

      if (payload.changes.length < PAGE_SIZE) {
        break;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  notePullOutcome(table, cursor, hadChanges, Date.now());

  if (appliedTotal > 0 || skippedTotal > 0 || failedTotal > 0) {
    appendOpsLog(
      "info",
      `core replication pull ${table}`,
      `${appliedTotal} applied, ${skippedTotal} skipped, ${failedTotal} failed (${config.role})`,
    );
  }
}

export async function pushTable(table: ReplicatedTable) {
  const config = getCoreReplicationConfig();
  if (!config) return;

  let cursor = await getReplicationCursor(table, "push");
  let pushed = 0;
  let failedTotal = 0;

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

      const result = (await response.json()) as ReplicationApplyResponse;
      // Peer records dead letters for failed applies; we still advance so one
      // bad row cannot block the rest of the page forever.
      pushed += changes.length;
      failedTotal += Array.isArray(result.failed) ? result.failed.length : 0;
      cursor = nextCursor;
      await setReplicationCursor(table, cursor, "push");

      if (changes.length < PAGE_SIZE) {
        break;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  if (pushed > 0 || failedTotal > 0) {
    appendOpsLog(
      "info",
      `core replication push ${table}`,
      `${pushed} rows, ${failedTotal} peer-failed (${config.role})`,
    );
  }
}

export async function runCoreReplicationTick(): Promise<void> {
  const config = getCoreReplicationConfig();
  if (!config) return;

  // OS-61: compare /health commits with the peer once per distinct mismatch.
  try {
    await checkPeerBuildVersion();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendOpsLog("warn", "core replication version check failed", message);
  }

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

  // Every active table each tick; empty-pull backoff defers quiet tables so we
  // do not permanently skip them (and do not need a round-robin batch).
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

  try {
    const dead = await retryReplicationDeadLetters(applyReplicationRow);
    if (dead.retried > 0) {
      appendOpsLog(
        "info",
        "core replication dead letter retry",
        `${dead.retried} retried, ${dead.resolved} resolved, ${dead.failed} failed`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendOpsLog("error", "core replication dead letter retry failed", message);
    console.error("core replication dead letter retry failed", error);
  }

  try {
    await runReplicationReconcile();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendOpsLog("error", "core replication reconcile failed", message);
    console.error("core replication reconcile failed", error);
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
