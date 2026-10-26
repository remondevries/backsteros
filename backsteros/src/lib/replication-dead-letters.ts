/**
 * Desktop helpers for GET /api/v1/ops/sync-health dead letters (OS-84).
 *
 * OS-82 pending-state prompt should treat `count > 0` as unresolved letters
 * that can pause sync-event pull. This module does not toggle pull itself.
 */

export const OPS_SYNC_HEALTH_PATH = "/api/v1/ops/sync-health";

export type ReplicationDeadLetter = {
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

export type OpsSyncHealthMismatch = {
  tableName: string;
  localCount: number;
  peerCount: number;
  missingLocally: number;
  missingOnPeer: number;
  checkedAt: string;
};

export type OpsSyncHealthDeadLetters = {
  count: number;
  letters: ReplicationDeadLetter[];
  mismatches: OpsSyncHealthMismatch[];
};

export function replicationDeadLetterRetryPath(id: string): string {
  return `/api/v1/ops/replication-dead-letters/${encodeURIComponent(id)}/retry`;
}

export function replicationDeadLetterAcknowledgePath(id: string): string {
  return `/api/v1/ops/replication-dead-letters/${encodeURIComponent(id)}/acknowledge`;
}

/** True when open dead letters should pause sync-event pull (OS-82). */
export function shouldPauseSyncEventPullForDeadLetters(count: number): boolean {
  return count > 0;
}

function asIsoString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseLetter(value: unknown): ReplicationDeadLetter | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.tableName !== "string") {
    return null;
  }
  return {
    id: row.id,
    tableName: row.tableName,
    rowId: typeof row.rowId === "string" ? row.rowId : "",
    direction: typeof row.direction === "string" ? row.direction : "",
    errorCode: typeof row.errorCode === "string" ? row.errorCode : null,
    errorMessage: typeof row.errorMessage === "string" ? row.errorMessage : "",
    attempts: typeof row.attempts === "number" ? row.attempts : 0,
    firstSeenAt: asIsoString(row.firstSeenAt),
    lastSeenAt: asIsoString(row.lastSeenAt),
    nextRetryAt: asIsoString(row.nextRetryAt),
  };
}

function parseMismatch(value: unknown): OpsSyncHealthMismatch | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.tableName !== "string") return null;
  return {
    tableName: row.tableName,
    localCount: typeof row.localCount === "number" ? row.localCount : 0,
    peerCount: typeof row.peerCount === "number" ? row.peerCount : 0,
    missingLocally:
      typeof row.missingLocally === "number" ? row.missingLocally : 0,
    missingOnPeer:
      typeof row.missingOnPeer === "number" ? row.missingOnPeer : 0,
    checkedAt: asIsoString(row.checkedAt),
  };
}

export function parseOpsSyncHealthDeadLetters(
  body: unknown,
): OpsSyncHealthDeadLetters {
  if (!body || typeof body !== "object") {
    return { count: 0, letters: [], mismatches: [] };
  }
  const record = body as Record<string, unknown>;
  const letters = Array.isArray(record.replicationDeadLetters)
    ? record.replicationDeadLetters.flatMap((item) => {
        const letter = parseLetter(item);
        return letter ? [letter] : [];
      })
    : [];
  const mismatches = Array.isArray(record.replicationMismatches)
    ? record.replicationMismatches.flatMap((item) => {
        const mismatch = parseMismatch(item);
        return mismatch ? [mismatch] : [];
      })
    : [];
  const count =
    typeof record.replicationDeadLetterCount === "number" &&
    Number.isFinite(record.replicationDeadLetterCount)
      ? record.replicationDeadLetterCount
      : letters.length;
  return { count, letters, mismatches };
}

export function formatDeadLetterNextRetry(
  iso: string,
  nowMs: number = Date.now(),
): string {
  if (!iso) return "—";
  const epoch = Date.parse(iso);
  if (Number.isNaN(epoch)) return "—";
  const delta = epoch - nowMs;
  if (delta <= 0) return "due now";
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return "in under a minute";
  if (minutes === 1) return "in 1 minute";
  if (minutes < 60) return `in ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "in 1 hour";
  if (hours < 48) return `in ${hours} hours`;
  const days = Math.round(hours / 24);
  return days === 1 ? "in 1 day" : `in ${days} days`;
}

export function formatDeadLetterTimestamp(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
