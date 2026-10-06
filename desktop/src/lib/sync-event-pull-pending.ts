/**
 * Desktop policy for OS-82 sync-event pull pause/prompt.
 *
 * Dead-letter pause uses OS-84's `shouldPauseSyncEventPullForDeadLetters` so
 * the rule is not duplicated. Server-side pending-unpushed-state uses the same
 * count > 0 meaning for open dead letters.
 */

import { shouldPauseSyncEventPullForDeadLetters } from "./replication-dead-letters";

export type SyncEventPullPendingState = {
  unpushedRowCount: number;
  openDeadLetterCount: number;
  localOnlyRowCount: number;
  unpushedTables?: string[];
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

/** Pause ordered pull until Remon acknowledges pending local state. */
export function shouldPauseSyncEventPullForPendingState(
  state: SyncEventPullPendingState,
  acknowledged: boolean,
): boolean {
  return hasSyncEventPullPendingState(state) && !acknowledged;
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
