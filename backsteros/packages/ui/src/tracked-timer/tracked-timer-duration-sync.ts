/**
 * Pure helpers for TrackedTimeField optimistic duration + draft sync.
 * Kept free of React so unit tests can lock the edit/snap-back contract.
 */

/** While a manual edit or timer persist is in flight, trust pending exclusively. */
export function resolveEffectiveTrackedDurationSeconds(input: {
  pendingSeconds: number | null;
  hasPending: boolean;
  trackedDurationSeconds: number | null;
}): number | null {
  if (input.hasPending) return input.pendingSeconds;
  return input.trackedDurationSeconds;
}

/**
 * Clear optimistic pending only when the source row matches the pending value.
 * Using `>=` would drop a manual decrease as soon as stale higher props arrive.
 */
export function shouldClearPendingTrackedSeconds(input: {
  hasPending: boolean;
  pendingSeconds: number | null;
  trackedDurationSeconds: number | null;
}): boolean {
  if (!input.hasPending) return false;
  return input.trackedDurationSeconds === input.pendingSeconds;
}

/**
 * Draft must not be rewritten from settled/props while the user is typing.
 * `timerTick` must not drive draft sync either — any other running timer would
 * wipe keystrokes every second.
 */
export function shouldSyncTrackedTimeDraft(input: {
  isEditingTime: boolean;
  isRunning: boolean;
}): boolean {
  return !input.isEditingTime && !input.isRunning;
}

/**
 * Absolute duration for a paused timer entry. Ratcheting with Math.max made
 * manual decreases snap back to the previous accumulated total.
 */
export function nextPausedTimerAccumulatedSeconds(input: {
  trackedDurationSeconds: number | null;
  resolvedSeconds: number;
  previousAccumulatedSeconds: number;
}): number {
  if (input.trackedDurationSeconds != null) {
    return Math.max(0, input.trackedDurationSeconds);
  }
  if (input.resolvedSeconds > 0) {
    return input.resolvedSeconds;
  }
  // Empty props must not wipe in-memory totals before optimistic pending lands.
  return Math.max(0, input.previousAccumulatedSeconds);
}

export function shouldSkipEmptyPausedTimerSync(input: {
  trackedDurationSeconds: number | null;
  resolvedSeconds: number;
  previousAccumulatedSeconds: number;
}): boolean {
  return (
    input.trackedDurationSeconds == null &&
    input.resolvedSeconds <= 0 &&
    input.previousAccumulatedSeconds > 0
  );
}
