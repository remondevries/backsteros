/**
 * Desktop policy for OS-82 sync-event pull pause/prompt.
 *
 * Dead-letter pause uses OS-84's `shouldPauseSyncEventPullForDeadLetters` so
 * the rule is not duplicated. Server-side pending-unpushed-state uses the same
 * count > 0 meaning for open dead letters.
 *
 * "Pull anyway" acknowledges only the shown snapshot; growth in any category
 * re-pauses. Keep paused: pull resumes automatically once pending clears.
 */

import { shouldPauseSyncEventPullForDeadLetters } from "./replication-dead-letters";

export type SyncEventPullPendingState = {
  unpushedRowCount: number;
  openDeadLetterCount: number;
  localOnlyRowCount: number;
  unpushedTables?: string[];
};

export type SyncEventPullPendingAck = {
  unpushedRowCount: number;
  openDeadLetterCount: number;
  localOnlyRowCount: number;
};

export function hasSyncEventPullPendingState(
  state: SyncEventPullPendingState,
): boolean {
  return (
    state.unpushedRowCount > 0 ||
    shouldPauseSyncEventPullForDeadLetters(state.openDeadLetterCount) ||
    state.localOnlyRowCount > 0
  );
}

export function toSyncEventPullPendingAck(
  state: SyncEventPullPendingState,
): SyncEventPullPendingAck {
  return {
    unpushedRowCount: state.unpushedRowCount,
    openDeadLetterCount: state.openDeadLetterCount,
    localOnlyRowCount: state.localOnlyRowCount,
  };
}

export function isSyncEventPullPendingCoveredByAck(
  state: SyncEventPullPendingState,
  ack: SyncEventPullPendingAck | null,
): boolean {
  if (!ack) return false;
  return (
    state.unpushedRowCount <= ack.unpushedRowCount &&
    state.openDeadLetterCount <= ack.openDeadLetterCount &&
    state.localOnlyRowCount <= ack.localOnlyRowCount
  );
}

/** Pause ordered pull until Remon acknowledges the shown pending snapshot. */
export function shouldPauseSyncEventPullForPendingState(
  state: SyncEventPullPendingState,
  ack: SyncEventPullPendingAck | null,
): boolean {
  if (!hasSyncEventPullPendingState(state)) return false;
  return !isSyncEventPullPendingCoveredByAck(state, ack);
}

export function formatSyncEventPullPendingSummary(
  state: SyncEventPullPendingState,
): string {
  const tables =
    state.unpushedTables && state.unpushedTables.length > 0
      ? ` tables=${state.unpushedTables.join(",")}`
      : "";
  return `unpushed=${state.unpushedRowCount} deadLetters=${state.openDeadLetterCount} localOnly=${state.localOnlyRowCount}${tables}`;
}
