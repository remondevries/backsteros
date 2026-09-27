import {
  getTrackedTimerElapsedSeconds,
  isTrackedTimerRunning,
  pauseTrackedTimer,
  startTrackedTimer,
} from "./trackedTimerStore";

/**
 * Mirror server auto time tracking in the local pill UI.
 * Silent so we do not post a second timer_started / timer_stopped — the core
 * API already recorded those when status changed.
 */
export function syncTrackedTimerWithTaskStatus(input: {
  readonly taskId: string;
  readonly status: string;
  readonly trackedDurationSeconds?: number | null;
}): void {
  const baseSeconds = Math.max(
    0,
    Math.floor(input.trackedDurationSeconds ?? 0),
    getTrackedTimerElapsedSeconds(input.taskId),
  );

  if (input.status === "in_progress") {
    if (isTrackedTimerRunning(input.taskId)) return;
    startTrackedTimer(input.taskId, baseSeconds, { silent: true });
    return;
  }

  if (isTrackedTimerRunning(input.taskId)) {
    pauseTrackedTimer(input.taskId, { silent: true });
  }
}
