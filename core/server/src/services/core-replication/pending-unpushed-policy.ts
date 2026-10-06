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
