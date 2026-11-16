export type PendingUnpushedState = {
  unpushedRowCount: number;
  openDeadLetterCount: number;
  localOnlyRowCount: number;
  unpushedTables: string[];
};

/** Counts snapshot acknowledged by "Pull anyway" (OS-82). */
export type PendingAckSnapshot = {
  unpushedRowCount: number;
  openDeadLetterCount: number;
  localOnlyRowCount: number;
};

/**
 * Tables that are NOT pushed (or only partially pushed) by design, so
 * their tip-vs-push-cursor gap / reconcile "local only" rows must never pause
 * ordered sync-event pull. Whole-table one-way rules are gone (every
 * replicated table twins both ways); only column-level special cases remain:
 *
 * - `api_keys`: a local core strips `key_hash` / `secret_ciphertext` upstream,
 *   so keys minted on local are never created on cloud and stay "local only"
 *   forever — metadata updates (revoke, rename) still replicate.
 */
export const EXCLUDED_FROM_PENDING_UNPUSHED: readonly string[] = ["api_keys"];

export function isExcludedFromPendingUnpushed(table: string): boolean {
  return EXCLUDED_FROM_PENDING_UNPUSHED.includes(table);
}

/**
 * Sum per-table unpushed counts, ignoring tables excluded by design.
 * Pure — the DB probe lives in pending-unpushed-state.ts.
 */
export function summarizeUnpushedTables(
  entries: ReadonlyArray<{ table: string; count: number }>,
): { unpushedRowCount: number; unpushedTables: string[] } {
  let unpushedRowCount = 0;
  const unpushedTables: string[] = [];
  for (const { table, count } of entries) {
    if (count <= 0 || isExcludedFromPendingUnpushed(table)) continue;
    unpushedRowCount += count;
    unpushedTables.push(table);
  }
  return { unpushedRowCount, unpushedTables };
}

/** Reconcile "missing on peer" rows, ignoring tables excluded by design. */
export function sumLocalOnlyRows(
  mismatches: ReadonlyArray<{ tableName: string; missingOnPeer?: number | null }>,
): number {
  return mismatches.reduce(
    (sum, row) =>
      isExcludedFromPendingUnpushed(row.tableName)
        ? sum
        : sum + (row.missingOnPeer ?? 0),
    0,
  );
}

export function emptyPendingUnpushedState(): PendingUnpushedState {
  return {
    unpushedRowCount: 0,
    openDeadLetterCount: 0,
    localOnlyRowCount: 0,
    unpushedTables: [],
  };
}

export function toPendingAckSnapshot(
  state: Pick<
    PendingUnpushedState,
    "unpushedRowCount" | "openDeadLetterCount" | "localOnlyRowCount"
  >,
): PendingAckSnapshot {
  return {
    unpushedRowCount: state.unpushedRowCount,
    openDeadLetterCount: state.openDeadLetterCount,
    localOnlyRowCount: state.localOnlyRowCount,
  };
}

/**
 * Ack the counts the user saw, capped by current state (min per category).
 * Growth after the dialog was shown stays above the ack and re-pauses.
 */
export function resolveAcknowledgePendingSnapshot(
  shown: PendingAckSnapshot,
  current: Pick<
    PendingUnpushedState,
    "unpushedRowCount" | "openDeadLetterCount" | "localOnlyRowCount"
  >,
): PendingAckSnapshot {
  return {
    unpushedRowCount: Math.min(shown.unpushedRowCount, current.unpushedRowCount),
    openDeadLetterCount: Math.min(
      shown.openDeadLetterCount,
      current.openDeadLetterCount,
    ),
    localOnlyRowCount: Math.min(shown.localOnlyRowCount, current.localOnlyRowCount),
  };
}

/** Parse desktop `acknowledgePending` object; bare `true` is rejected. */
export function parseAcknowledgePendingBody(
  raw: unknown,
): PendingAckSnapshot | "invalid" | null {
  if (raw === undefined || raw === null || raw === false) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return "invalid";
  const row = raw as Record<string, unknown>;
  const keys = [
    "unpushedRowCount",
    "openDeadLetterCount",
    "localOnlyRowCount",
  ] as const;
  const out: PendingAckSnapshot = {
    unpushedRowCount: 0,
    openDeadLetterCount: 0,
    localOnlyRowCount: 0,
  };
  for (const key of keys) {
    const value = row[key];
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0 ||
      !Number.isFinite(value)
    ) {
      return "invalid";
    }
    out[key] = value;
  }
  return out;
}

/**
 * True when ordered pull must pause. Dead letters use the same count > 0
 * rule as desktop `shouldPauseSyncEventPullForDeadLetters` (OS-84) — do not
 * invent a second threshold here.
 */
export function hasPendingUnpushedState(state: PendingUnpushedState): boolean {
  return (
    state.unpushedRowCount > 0 ||
    state.openDeadLetterCount > 0 ||
    state.localOnlyRowCount > 0
  );
}

/**
 * Ack covers the shown snapshot only. Any category that grows beyond the
 * acknowledged counts re-pauses pull (e.g. a new dead letter after ack).
 */
export function isPendingCoveredByAck(
  state: PendingUnpushedState,
  ack: PendingAckSnapshot | null,
): boolean {
  if (!ack) return false;
  return (
    state.unpushedRowCount <= ack.unpushedRowCount &&
    state.openDeadLetterCount <= ack.openDeadLetterCount &&
    state.localOnlyRowCount <= ack.localOnlyRowCount
  );
}

export function shouldPauseSyncEventPull(
  state: PendingUnpushedState,
  ack: PendingAckSnapshot | null,
): boolean {
  if (!hasPendingUnpushedState(state)) return false;
  return !isPendingCoveredByAck(state, ack);
}

/** Clear ack once pending is fully clean. */
export function nextPendingAckSnapshot(
  state: PendingUnpushedState,
  ack: PendingAckSnapshot | null,
): PendingAckSnapshot | null {
  if (!hasPendingUnpushedState(state)) return null;
  return ack;
}

export function formatPendingUnpushedSummary(state: PendingUnpushedState): string {
  const tables =
    state.unpushedTables.length > 0
      ? ` tables=${state.unpushedTables.join(",")}`
      : "";
  return `unpushed=${state.unpushedRowCount} deadLetters=${state.openDeadLetterCount} localOnly=${state.localOnlyRowCount}${tables}`;
}
