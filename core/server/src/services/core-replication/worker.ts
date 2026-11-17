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
import {
  CURSOR_HOLD_MAX_ATTEMPTS,
  decidePullForPeerTip,
  evaluateCursorHold,
  peerTipHasChanges,
  type CursorHoldDecision,
} from "./cursor-order.js";
import { runReplicationReconcile } from "./reconcile.js";
import { getChangesSince } from "./sync.js";
import type { ReplicatedTable } from "./constants.js";
import type {
  ReplicationApplyRequest,
  ReplicationApplyResponse,
  ReplicationChangesResponse,
  ReplicationCursor,
  ReplicationSyncStateResponse,
} from "./types.js";
import { pullPeerSyncEvents } from "./sync-event-replication.js";
import { syncVaultWithPeer } from "./vault-replication.js";
import { checkPeerBuildVersion } from "./peer-version.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const PAGE_SIZE = 100;

/**
 * In-process fallback for hold attempts when the apply result does not carry
 * dead-letter attempts (older peer on push, or dead-letter write failed).
 * Counts consecutive ticks a row kept failing on a held page.
 */
const holdCounts = new Map<string, number>();

function holdKey(table: string, direction: "pull" | "push", id: string): string {
  return `${table}:${direction}:${id}`;
}

function clearHoldCounts(table: string, direction: "pull" | "push"): void {
  const prefix = `${table}:${direction}:`;
  for (const key of holdCounts.keys()) {
    if (key.startsWith(prefix)) holdCounts.delete(key);
  }
}

/**
 * Decide whether a page with failures may advance the cursor, and ops-log the
 * outcome: warn while holding, warn (with row ids) when advancing past rows
 * whose bounded hold is exhausted. Returns the decision; callers advance iff
 * `advance`.
 */
function decideCursorHold(
  table: string,
  direction: "pull" | "push",
  result: {
    failed: readonly {
      id: string;
      attempts?: number;
      deadLetterRecorded?: boolean;
    }[];
  },
): CursorHoldDecision {
  if (result.failed.length === 0) {
    clearHoldCounts(table, direction);
    return { advance: true, holding: [], exhausted: [] };
  }
  for (const failed of result.failed) {
    // Unrecorded failures must not accrue toward the in-process exhaust budget.
    if (failed.deadLetterRecorded === false) continue;
    const key = holdKey(table, direction, failed.id);
    holdCounts.set(key, (holdCounts.get(key) ?? 0) + 1);
  }
  const decision = evaluateCursorHold(result, {
    attemptsFor: (failed) => {
      if (failed.deadLetterRecorded === false) return 0;
      return holdCounts.get(holdKey(table, direction, String(failed.id ?? "?")));
    },
  });
  const fmt = (rows: { id: string; attempts?: number }[]) =>
    rows.map((row) => `${row.id}(${row.attempts ?? 0})`).join(", ");
  const unrecorded = decision.holding.filter(
    (row) => row.deadLetterRecorded === false,
  );
  if (unrecorded.length > 0) {
    appendOpsLog(
      "error",
      `core replication ${direction} ${table} holding cursor (no dead letter)`,
      `${unrecorded.length} failed row(s) with no durable dead letter — cursor held until record succeeds: ${fmt(unrecorded)}`,
    );
  }
  if (!decision.advance) {
    appendOpsLog(
      "warn",
      `core replication ${direction} ${table} holding cursor`,
      `${decision.holding.length} failed row(s) within hold budget (max ${CURSOR_HOLD_MAX_ATTEMPTS} attempts): ${fmt(decision.holding)}`,
    );
  } else {
    appendOpsLog(
      "warn",
      `core replication ${direction} ${table} advancing past exhausted hold`,
      `${decision.exhausted.length} row(s) stay dead-lettered after ${CURSOR_HOLD_MAX_ATTEMPTS} attempts: ${fmt(decision.exhausted)}`,
    );
    clearHoldCounts(table, direction);
  }
  return decision;
}

export function resetReplicationWorkerStateForTests(): void {
  resetEmptyPullStateForTests();
  holdCounts.clear();
}

export { decidePullForPeerTip, peerTipHasChanges };

function replicationHeaders(secret: string): HeadersInit {
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
}

/**
 * Fetch peer tip watermarks in one request. Returns null when the peer does
 * not yet expose /sync-state (older build) so callers fall back to per-table
 * /changes polls.
 */
export async function fetchPeerSyncState(
  signal?: AbortSignal,
): Promise<Map<ReplicatedTable, ReplicationCursor | null> | null> {
  const config = getCoreReplicationConfig();
  if (!config) return null;

  const response = await fetch(
    `${config.peerUrl}/internal/core-replication/sync-state`,
    {
      method: "GET",
      headers: replicationHeaders(config.secret),
      signal,
    },
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`sync-state failed (${response.status}): ${body}`);
  }
  const payload = (await response.json()) as ReplicationSyncStateResponse;
  const tips = new Map<ReplicatedTable, ReplicationCursor | null>();
  for (const entry of payload.tips ?? []) {
    tips.set(entry.table as ReplicatedTable, entry.tip);
  }
  return tips;
}

export async function pullTable(
  table: ReplicatedTable,
  options?: {
    peerTip?: ReplicationCursor | null;
    /** Test hooks — production callers omit these. */
    getCursor?: typeof getReplicationCursor;
    setCursor?: typeof setReplicationCursor;
    applyFn?: typeof applyRemoteChanges;
    fetchFn?: typeof fetch;
    nowMs?: number;
  },
) {
  const config = getCoreReplicationConfig();
  if (!config) return;

  const getCursor = options?.getCursor ?? getReplicationCursor;
  const setCursor = options?.setCursor ?? setReplicationCursor;
  const applyChanges = options?.applyFn ?? applyRemoteChanges;
  const fetchFn = options?.fetchFn ?? fetch;

  // Pull watermark is independent of push — advancing peer tip must not
  // skip local rows that are still older than the peer tip.
  let cursor = await getCursor(table, "pull");
  const nowMs = options?.nowMs ?? Date.now();
  const peerTipProvided = Boolean(options && "peerTip" in options);
  const decision = decidePullForPeerTip({
    peerTipProvided,
    peerTip: options?.peerTip,
    cursor,
    deferEmptyPull: shouldDeferEmptyPull(table, cursor, nowMs),
  });
  if (decision === "skip_quiet_tip" || decision === "defer_backoff") {
    // Quiet tip: do not grow empty-pull backoff. Defer: leave backoff as-is.
    return;
  }
  // Tip ahead (or no tip info past defer) → poll /changes.

  let appliedTotal = 0;
  let skippedTotal = 0;
  let failedTotal = 0;
  let held = false;
  let hadChanges = false;

  for (;;) {
    const url = new URL(`${config.peerUrl}/internal/core-replication/changes`);
    url.searchParams.set("table", table);
    url.searchParams.set("since", cursor.updatedAt);
    url.searchParams.set("since_id", cursor.rowId);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetchFn(url, {
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

      const result = await applyChanges(table, payload.changes, {
        direction: "pull",
      });
      appliedTotal += result.applied;
      skippedTotal += result.skipped;
      failedTotal += result.failed.length;
      if (!decideCursorHold(table, "pull", result).advance) {
        held = true;
        // Bounded hold: failed rows are dead-lettered, and we re-fetch this
        // page next tick (idempotent LWW upserts) for up to
        // CURSOR_HOLD_MAX_ATTEMPTS attempts per row. After that the cursor
        // advances past the permanent failure (dead letter stays open).
        break;
      }
      await setCursor(table, payload.cursor, "pull");
      cursor = payload.cursor;

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
      failedTotal > 0 ? "warn" : "info",
      `core replication pull ${table}`,
      `${appliedTotal} applied, ${skippedTotal} skipped, ${failedTotal} failed${
        held ? " (cursor held)" : ""
      } (${config.role})`,
    );
  }
}

export async function pushTable(
  table: ReplicatedTable,
  options?: {
    /** Test hooks — production callers omit these. */
    getCursor?: typeof getReplicationCursor;
    setCursor?: typeof setReplicationCursor;
    fetchLocal?: typeof fetchLocalChanges;
    fetchFn?: typeof fetch;
  },
) {
  const config = getCoreReplicationConfig();
  if (!config) return;

  const getCursor = options?.getCursor ?? getReplicationCursor;
  const setCursor = options?.setCursor ?? setReplicationCursor;
  const fetchLocal = options?.fetchLocal ?? fetchLocalChanges;
  const fetchFn = options?.fetchFn ?? fetch;

  let cursor = await getCursor(table, "push");
  let pushed = 0;
  let failedTotal = 0;
  let held = false;

  for (;;) {
    const { changes, cursor: nextCursor } = await fetchLocal(table, cursor);
    if (changes.length === 0) {
      break;
    }

    const body: ReplicationApplyRequest = { table, changes };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetchFn(
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
      const peerFailed = Array.isArray(result.failed) ? result.failed.length : 0;
      pushed += changes.length;
      failedTotal += peerFailed;
      if (
        !decideCursorHold(table, "push", {
          failed: Array.isArray(result.failed) ? result.failed : [],
        }).advance
      ) {
        held = true;
        // Bounded hold: the peer dead-letters failed rows and we re-send this
        // page next tick (idempotent) for up to CURSOR_HOLD_MAX_ATTEMPTS
        // attempts per row, then advance past the permanent failure.
        break;
      }
      cursor = nextCursor;
      await setCursor(table, cursor, "push");

      if (changes.length < PAGE_SIZE) {
        break;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  if (pushed > 0 || failedTotal > 0) {
    appendOpsLog(
      failedTotal > 0 ? "warn" : "info",
      `core replication push ${table}`,
      `${pushed} rows, ${failedTotal} peer-failed${
        held ? " (cursor held)" : ""
      } (${config.role})`,
    );
  }
}

/** Optional hooks so unit tests can drive the tick without a live peer/DB. */
export type CoreReplicationTickHooks = {
  checkPeerBuildVersion?: () => Promise<void>;
  pullPeerSyncEvents?: () => Promise<unknown>;
  listActiveReplicatedTables?: () => Promise<ReplicatedTable[]>;
  fetchPeerSyncState?: (
    signal?: AbortSignal,
  ) => Promise<Map<ReplicatedTable, ReplicationCursor | null> | null>;
  pullTable?: (
    table: ReplicatedTable,
    options?: { peerTip?: ReplicationCursor | null },
  ) => Promise<void>;
  pushTable?: (table: ReplicatedTable) => Promise<void>;
  retryDeadLetters?: () => Promise<{
    retried: number;
    resolved: number;
    failed: number;
  }>;
  runReconcile?: () => Promise<void>;
  syncVault?: () => Promise<unknown>;
};

export async function runCoreReplicationTick(
  hooks: CoreReplicationTickHooks = {},
): Promise<void> {
  const config = getCoreReplicationConfig();
  if (!config) return;

  const checkVersion = hooks.checkPeerBuildVersion ?? checkPeerBuildVersion;
  const pullEvents = hooks.pullPeerSyncEvents ?? pullPeerSyncEvents;
  const listTables =
    hooks.listActiveReplicatedTables ?? listActiveReplicatedTables;
  const fetchTips = hooks.fetchPeerSyncState ?? fetchPeerSyncState;
  const pull = hooks.pullTable ?? pullTable;
  const push = hooks.pushTable ?? pushTable;
  const retryDead =
    hooks.retryDeadLetters ??
    (() => retryReplicationDeadLetters(applyReplicationRow));
  const reconcile = hooks.runReconcile ?? runReplicationReconcile;
  const syncVault = hooks.syncVault ?? syncVaultWithPeer;

  // OS-61: compare /health commits with the peer once per distinct mismatch.
  try {
    await checkVersion();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendOpsLog("warn", "core replication version check failed", message);
  }

  // Linear-shaped: local-core applies peer sync_events in cursor order before
  // table LWW catch-up. Cloud is the leader clock; do not pull this feed as cloud.
  try {
    await pullEvents();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`core replication failed on sync-events: ${message}`, {
      cause: error,
    });
  }

  // Every active table each tick; empty-pull backoff defers quiet tables so we
  // do not permanently skip them (and do not need a round-robin batch).
  const tables = await listTables();

  // One sync-state round-trip when the peer supports it; otherwise per-table
  // /changes (older builds return 404).
  let peerTips: Map<ReplicatedTable, ReplicationCursor | null> | null = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      peerTips = await fetchTips(controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendOpsLog(
      "warn",
      "core replication sync-state failed; falling back to per-table pulls",
      message,
    );
  }

  const tableErrors: string[] = [];
  for (const table of tables) {
    // Pull and push are independent: inbound soft-unique/FK conflicts must not
    // block local→peer catch-up (and vice versa).
    try {
      if (peerTips?.has(table)) {
        await pull(table, { peerTip: peerTips.get(table) ?? null });
      } else {
        await pull(table);
      }
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
      await push(table);
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
    const dead = await retryDead();
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
    await reconcile();
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
      await syncVault();
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
