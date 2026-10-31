/**
 * sync_events retention (OS-162 / audit #9).
 *
 * Retention window: env `SYNC_EVENTS_RETENTION_DAYS` (default
 * {@link SYNC_EVENTS_RETENTION_DAYS_DEFAULT} = 30).
 *
 * Deletes only events that are both older than the window and already
 * processed by feed consumers (`peer_after_cursor`). Events still waiting to
 * be replicated or retried are never deleted, regardless of age. Local-core
 * uses the same gate — no age-only deletes.
 */

import { asc, eq, sql } from "drizzle-orm";

import { db } from "../../db/index.js";
import {
  coreSyncEventReplicationState,
  syncEvents,
} from "../../db/schema.js";
import { appendOpsLog } from "../../lib/ops-log-buffer.js";

/** Default retention window (days). Override with SYNC_EVENTS_RETENTION_DAYS. */
export const SYNC_EVENTS_RETENTION_DAYS_DEFAULT = 30;

/**
 * @deprecated Prefer {@link resolveSyncEventsRetentionDays}; kept as the
 * numeric default for docs/tests.
 */
export const SYNC_EVENTS_RETENTION_DAYS = SYNC_EVENTS_RETENTION_DAYS_DEFAULT;

/** Max rows deleted per prune batch (keeps each statement short). */
export const SYNC_EVENTS_PRUNE_BATCH_SIZE = 5_000;

/** Max batches per prune tick (hourly job). */
export const SYNC_EVENTS_PRUNE_MAX_BATCHES = 20;

const DEFAULT_PRUNE_INTERVAL_MS = 60 * 60 * 1000; // hourly

/**
 * Resolve retention days from env, defaulting to 30.
 * Invalid / missing → {@link SYNC_EVENTS_RETENTION_DAYS_DEFAULT}.
 */
export function resolveSyncEventsRetentionDays(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.SYNC_EVENTS_RETENTION_DAYS?.trim();
  if (!raw) return SYNC_EVENTS_RETENTION_DAYS_DEFAULT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return SYNC_EVENTS_RETENTION_DAYS_DEFAULT;
  }
  return Math.min(parsed, 3650);
}

export function syncEventsRetentionCutoff(
  now: Date = new Date(),
  retentionDays: number = resolveSyncEventsRetentionDays(),
): Date {
  const days = Math.max(1, Math.trunc(retentionDays));
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * True when `afterCursor` is behind a gap in the remaining log (events between
 * after+1 and oldest-1 were pruned). Peer must full-resync, not continue.
 */
export function syncEventsCursorNeedsResync(
  afterCursor: number,
  oldestRemainingCursor: number | null,
): boolean {
  if (oldestRemainingCursor == null) return false;
  if (!Number.isFinite(afterCursor) || afterCursor < 0) return false;
  if (afterCursor <= 0) return false;
  return afterCursor + 1 < oldestRemainingCursor;
}

/**
 * Never trust a peer `after` past the newest event on this core.
 */
export function capPeerAfterCursor(
  requestedAfter: number,
  newestCursorOnCore: number,
): number {
  if (!Number.isFinite(requestedAfter) || requestedAfter < 0) return 0;
  if (!Number.isFinite(newestCursorOnCore) || newestCursorOnCore < 0) {
    return 0;
  }
  return Math.min(Math.trunc(requestedAfter), Math.trunc(newestCursorOnCore));
}

export async function getOldestSyncEventCursor(
  workspaceId: string,
): Promise<number | null> {
  const [row] = await db
    .select({ cursor: syncEvents.cursor })
    .from(syncEvents)
    .where(eq(syncEvents.workspaceId, workspaceId))
    .orderBy(asc(syncEvents.cursor))
    .limit(1);
  return row?.cursor ?? null;
}

/**
 * Advance the feed-consumer watermark only with a capped, contiguous after.
 * Callers must not invoke this when {@link syncEventsCursorNeedsResync} is true.
 */
export async function recordSyncEventFeedConsumerCursor(
  workspaceId: string,
  afterCursor: number,
  newestCursorOnCore: number,
): Promise<number> {
  const capped = capPeerAfterCursor(afterCursor, newestCursorOnCore);
  if (capped <= 0) return 0;

  await db
    .insert(coreSyncEventReplicationState)
    .values({
      workspaceId,
      afterCursor: 0,
      peerAfterCursor: capped,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: coreSyncEventReplicationState.workspaceId,
      set: {
        peerAfterCursor: sql`GREATEST(${coreSyncEventReplicationState.peerAfterCursor}, ${capped})`,
        updatedAt: new Date(),
      },
    });
  return capped;
}

export type PruneSyncEventsResult = {
  deleted: number;
  cutoff: string;
  batches: number;
  retentionDays: number;
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
 * One DELETE batch of processed (peer-confirmed) events older than retention.
 * Same gate on cloud and local — never age-only.
 */
async function pruneProcessedSyncEventsBatch(
  cutoffIso: string,
  batchSize: number,
): Promise<number> {
  const result = await db.execute(sql`
    WITH doomed AS (
      SELECT se.cursor
      FROM sync_events se
      INNER JOIN core_sync_event_replication_state st
        ON st.workspace_id = se.workspace_id
      WHERE se.created_at < ${cutoffIso}::timestamptz
        AND st.peer_after_cursor > 0
        AND se.cursor <= st.peer_after_cursor
      ORDER BY se.created_at, se.cursor
      LIMIT ${batchSize}
    )
    DELETE FROM sync_events se
    USING doomed
    WHERE se.cursor = doomed.cursor
    RETURNING se.cursor
  `);
  return deletedCountFromExecute(result);
}

/**
 * Delete processed sync_events older than the retention window, in batched
 * loops. Never deletes events above `peer_after_cursor` (still needed for
 * sync / retry), on either core role.
 */
export async function pruneProcessedSyncEvents(
  options: {
    now?: Date;
    batchSize?: number;
    retentionDays?: number;
    maxBatches?: number;
  } = {},
): Promise<PruneSyncEventsResult> {
  const retentionDays =
    options.retentionDays ?? resolveSyncEventsRetentionDays();
  const cutoff = syncEventsRetentionCutoff(options.now, retentionDays);
  const cutoffIso = cutoff.toISOString();
  const batchSize = Math.min(
    Math.max(1, options.batchSize ?? SYNC_EVENTS_PRUNE_BATCH_SIZE),
    50_000,
  );
  const maxBatches = Math.min(
    Math.max(1, options.maxBatches ?? SYNC_EVENTS_PRUNE_MAX_BATCHES),
    100,
  );

  let deleted = 0;
  let batches = 0;
  for (let i = 0; i < maxBatches; i++) {
    const n = await pruneProcessedSyncEventsBatch(cutoffIso, batchSize);
    batches += 1;
    deleted += n;
    if (n < batchSize) break;
  }

  if (deleted > 0) {
    appendOpsLog(
      "info",
      "sync_events prune",
      `deleted=${deleted} batches=${batches} cutoff=${cutoffIso} retentionDays=${retentionDays}`,
    );
  }

  return {
    deleted,
    cutoff: cutoffIso,
    batches,
    retentionDays,
  };
}

/** Count how many rows would be eligible (read-only helper for ops/tests). */
export async function countPrunableSyncEvents(
  options: { now?: Date; retentionDays?: number } = {},
): Promise<number> {
  const retentionDays =
    options.retentionDays ?? resolveSyncEventsRetentionDays();
  const cutoff = syncEventsRetentionCutoff(options.now, retentionDays);
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
  // Do not prune on start — wait for the interval (avoids surprise deletes).
  pruneTimer = setInterval(tick, intervalMs);
  appendOpsLog(
    "info",
    "sync_events retention pruner started",
    `retentionDays=${resolveSyncEventsRetentionDays()} intervalMs=${intervalMs}`,
  );
}

export function stopSyncEventsRetentionPruner(): void {
  if (pruneTimer) {
    clearInterval(pruneTimer);
    pruneTimer = null;
  }
}
