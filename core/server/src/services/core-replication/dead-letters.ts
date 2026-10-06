import { and, asc, eq, isNull, lt, lte, sql } from "drizzle-orm";

import { db } from "../../db/index.js";
import { replicationDeadLetters } from "../../db/schema.js";
import { newId } from "../../lib/crypto.js";
import { appendOpsLog } from "../../lib/ops-log-buffer.js";
import {
  DEAD_LETTER_MAX_ATTEMPTS,
  deadLetterBackoffMs,
  deadLetterMaxBackoffMs,
  errorCodeFromUnknown,
  errorMessageFromUnknown,
} from "./dead-letter-policy.js";
import type { KnownTable } from "./tables.js";
import { getTableSpec, rowIdFromPk } from "./tables.js";
import type {
  ReplicationApplyDirection,
  ReplicationApplyFailed,
  ReplicationRow,
} from "./types.js";

export {
  DEAD_LETTER_MAX_ATTEMPTS,
  deadLetterBackoffMs,
  errorCodeFromUnknown,
  errorMessageFromUnknown,
} from "./dead-letter-policy.js";

/**
 * Insert or refresh an open dead letter for a failed apply row.
 * Re-sighting the same open letter updates last_seen / payload / error but
 * does not bump attempts (attempts advance only on retryDeadLetters).
 */
export async function recordReplicationDeadLetter(input: {
  table: string;
  rowId: string;
  direction: ReplicationApplyDirection;
  errorCode: string;
  errorMessage: string;
  row: ReplicationRow;
}): Promise<void> {
  const now = new Date();
  const [existing] = await db
    .select()
    .from(replicationDeadLetters)
    .where(
      and(
        eq(replicationDeadLetters.tableName, input.table),
        eq(replicationDeadLetters.rowId, input.rowId),
        eq(replicationDeadLetters.direction, input.direction),
        isNull(replicationDeadLetters.resolvedAt),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(replicationDeadLetters)
      .set({
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        rowPayload: input.row,
        lastSeenAt: now,
      })
      .where(eq(replicationDeadLetters.id, existing.id));
    return;
  }

  await db.insert(replicationDeadLetters).values({
    id: newId(),
    tableName: input.table,
    rowId: input.rowId,
    direction: input.direction,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    rowPayload: input.row,
    attempts: 1,
    firstSeenAt: now,
    lastSeenAt: now,
    nextRetryAt: new Date(now.getTime() + deadLetterBackoffMs(1)),
    resolvedAt: null,
  });
}

export async function countOpenReplicationDeadLetters(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(replicationDeadLetters)
    .where(isNull(replicationDeadLetters.resolvedAt));
  return row?.count ?? 0;
}

export type OpenDeadLetterSummary = {
  id: string;
  tableName: string;
  rowId: string;
  direction: string;
  errorCode: string | null;
  errorMessage: string;
  attempts: number;
  firstSeenAt: string;
  lastSeenAt: string;
  nextRetryAt: string;
};

export async function listOpenReplicationDeadLetters(
  limit = 50,
): Promise<OpenDeadLetterSummary[]> {
  const rows = await db
    .select()
    .from(replicationDeadLetters)
    .where(isNull(replicationDeadLetters.resolvedAt))
    .orderBy(asc(replicationDeadLetters.lastSeenAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    tableName: row.tableName,
    rowId: row.rowId,
    direction: row.direction,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    attempts: row.attempts,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    nextRetryAt: row.nextRetryAt.toISOString(),
  }));
}

export function toApplyFailed(
  table: KnownTable,
  row: ReplicationRow,
  error: unknown,
): ReplicationApplyFailed {
  const spec = getTableSpec(table);
  const id = spec ? rowIdFromPk(row, spec.pk) : String(row.id ?? "?");
  return {
    id,
    code: errorCodeFromUnknown(error),
    message: errorMessageFromUnknown(error),
  };
}

type ApplyRowFn = (
  table: KnownTable,
  row: ReplicationRow,
) => Promise<"applied" | "skipped">;

type DeadLetterRow = typeof replicationDeadLetters.$inferSelect;

export type DeadLetterRetryResult =
  | { status: "resolved" }
  | { status: "failed" }
  | { status: "not_found" }
  | { status: "already_resolved" };

export type DeadLetterAckResult =
  | { status: "acknowledged" }
  | { status: "not_found" }
  | { status: "already_resolved" };

async function retryOpenDeadLetterRow(
  letter: DeadLetterRow,
  applyRow: ApplyRowFn,
  now: Date,
): Promise<"resolved" | "failed"> {
  const nextAttempts = letter.attempts + 1;
  try {
    const result = await applyRow(
      letter.tableName as KnownTable,
      letter.rowPayload,
    );
    if (result === "applied" || result === "skipped") {
      await db
        .update(replicationDeadLetters)
        .set({
          attempts: nextAttempts,
          lastSeenAt: now,
          resolvedAt: now,
        })
        .where(eq(replicationDeadLetters.id, letter.id));
      appendOpsLog(
        "info",
        "core replication dead letter resolved",
        `${letter.tableName} ${letter.rowId} (${letter.direction})`,
      );
      return "resolved";
    }
  } catch (error) {
    const code = errorCodeFromUnknown(error);
    const message = errorMessageFromUnknown(error);
    const giveUp = nextAttempts >= DEAD_LETTER_MAX_ATTEMPTS;
    await db
      .update(replicationDeadLetters)
      .set({
        attempts: nextAttempts,
        errorCode: code,
        errorMessage: message,
        lastSeenAt: now,
        nextRetryAt: giveUp
          ? new Date(now.getTime() + deadLetterMaxBackoffMs())
          : new Date(now.getTime() + deadLetterBackoffMs(nextAttempts)),
      })
      .where(eq(replicationDeadLetters.id, letter.id));
    if (giveUp) {
      appendOpsLog(
        "error",
        "core replication dead letter exhausted",
        `${letter.tableName} ${letter.rowId}: ${message}`,
      );
    }
    return "failed";
  }
  return "failed";
}

/**
 * Retry open dead letters whose next_retry_at is due.
 * `applyRow` is injected to avoid a circular import with apply.ts.
 */
export async function retryReplicationDeadLetters(
  applyRow: ApplyRowFn,
): Promise<{ retried: number; resolved: number; failed: number }> {
  const now = new Date();
  const due = await db
    .select()
    .from(replicationDeadLetters)
    .where(
      and(
        isNull(replicationDeadLetters.resolvedAt),
        lte(replicationDeadLetters.nextRetryAt, now),
        lt(replicationDeadLetters.attempts, DEAD_LETTER_MAX_ATTEMPTS),
      ),
    )
    .limit(50);

  let retried = 0;
  let resolved = 0;
  let failed = 0;

  for (const letter of due) {
    retried += 1;
    const outcome = await retryOpenDeadLetterRow(letter, applyRow, now);
    if (outcome === "resolved") resolved += 1;
    else failed += 1;
  }

  return { retried, resolved, failed };
}

/** Operator retry from ops UI — ignores next_retry_at and max-attempt skip. */
export async function retryReplicationDeadLetterById(
  id: string,
  applyRow: ApplyRowFn,
): Promise<DeadLetterRetryResult> {
  const [letter] = await db
    .select()
    .from(replicationDeadLetters)
    .where(eq(replicationDeadLetters.id, id))
    .limit(1);
  if (!letter) return { status: "not_found" };
  if (letter.resolvedAt) return { status: "already_resolved" };
  const outcome = await retryOpenDeadLetterRow(letter, applyRow, new Date());
  return { status: outcome };
}

/** Mark an open letter resolved without applying the payload. */
export async function acknowledgeReplicationDeadLetter(
  id: string,
): Promise<DeadLetterAckResult> {
  const [letter] = await db
    .select()
    .from(replicationDeadLetters)
    .where(eq(replicationDeadLetters.id, id))
    .limit(1);
  if (!letter) return { status: "not_found" };
  if (letter.resolvedAt) return { status: "already_resolved" };
  const now = new Date();
  await db
    .update(replicationDeadLetters)
    .set({
      lastSeenAt: now,
      resolvedAt: now,
    })
    .where(eq(replicationDeadLetters.id, letter.id));
  appendOpsLog(
    "info",
    "core replication dead letter acknowledged",
    `${letter.tableName} ${letter.rowId} (${letter.direction})`,
  );
  return { status: "acknowledged" };
}
