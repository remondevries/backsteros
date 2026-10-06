export type PendingUnpushedState = {
  unpushedRowCount: number;
  openDeadLetterCount: number;
  localOnlyRowCount: number;
  unpushedTables: string[];
};

export function emptyPendingUnpushedState(): PendingUnpushedState {
  return {
    unpushedRowCount: 0,
    openDeadLetterCount: 0,
    localOnlyRowCount: 0,
    unpushedTables: [],
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

export function shouldPauseSyncEventPull(
  state: PendingUnpushedState,
  acknowledged: boolean,
): boolean {
  return hasPendingUnpushedState(state) && !acknowledged;
}

export function formatPendingUnpushedSummary(state: PendingUnpushedState): string {
  const tables =
    state.unpushedTables.length > 0
      ? ` tables=${state.unpushedTables.join(",")}`
      : "";
  return `unpushed=${state.unpushedRowCount} deadLetters=${state.openDeadLetterCount} localOnly=${state.localOnlyRowCount}${tables}`;
}
