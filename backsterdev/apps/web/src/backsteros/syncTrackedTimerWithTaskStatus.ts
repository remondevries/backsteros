import { isBacksterosTaskClosedStatus, migrateBacksterosTaskStatus } from "./taskStatus";
import {
  getTrackedTimerElapsedSeconds,
  isTrackedTimerRunning,
  listRunningTrackedTimerKeys,
  pauseTrackedTimer,
  setTrackedTimerRefusePersist,
  startTrackedTimer,
} from "./trackedTimerStore";

/**
 * Mirror server auto time tracking in the local pill UI.
 * Silent so we do not post a second timer_started / timer_stopped — the core
 * API already recorded those when status changed.
 *
 * Closed statuses (completed / canceled / duplicated / legacy done) halt the
 * store-level session and refuse further tracked-time PATCHes.
 */
export function syncTrackedTimerWithTaskStatus(input: {
  readonly taskId: string;
  readonly status: string;
  readonly trackedDurationSeconds?: number | null;
}): void {
  const status = migrateBacksterosTaskStatus(input.status);
  const closed = isBacksterosTaskClosedStatus(input.status);
  setTrackedTimerRefusePersist(input.taskId, closed);

  const baseSeconds = Math.max(
    0,
    Math.floor(input.trackedDurationSeconds ?? 0),
    getTrackedTimerElapsedSeconds(input.taskId),
  );

  if (status === "in_progress" && !closed) {
    if (isTrackedTimerRunning(input.taskId)) return;
    startTrackedTimer(input.taskId, baseSeconds, { silent: true });
    return;
  }

  if (isTrackedTimerRunning(input.taskId)) {
    pauseTrackedTimer(input.taskId, { silent: true });
  }
}

/**
 * When list/inbox/project soft-poll (or sync) returns rows, pause any local
 * running timers whose task is no longer open — without starting timers for
 * unrelated in_progress rows.
 */
export function syncRunningTrackedTimersWithTasks(
  tasks: readonly {
    readonly id: string;
    readonly status: string;
    readonly trackedDurationSeconds?: number | null;
  }[],
): void {
  const running = listRunningTrackedTimerKeys();
  if (running.length === 0) return;

  const byId = new Map(tasks.map((task) => [task.id, task] as const));
  for (const taskId of running) {
    const task = byId.get(taskId);
    if (!task) continue;
    syncTrackedTimerWithTaskStatus({
      taskId,
      status: task.status,
      trackedDurationSeconds: task.trackedDurationSeconds ?? null,
    });
  }
}
