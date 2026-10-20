import { isActiveOpenRunningTimer } from "@backsteros/contracts";

/** Default window for chrome recent-timer membership across clients. */
export const RECENT_TASK_TIMER_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** Cap for shared chrome timer dropdown rows. */
export const RECENT_TASK_TIMER_LIMIT = 20;

export type RecentTaskTimer = {
  taskId: string;
  startedAt: Date;
  lastTimerAt: Date;
  isRunning: boolean;
  title: string;
  number: number | null;
  status: string | null;
  trackedDurationSeconds: number | null;
  trackedMinutes: number | null;
  projectKey: string | null;
  updatedAt: Date | null;
};

export type RecentTaskTimerRow = {
  taskId: string;
  lastTimerAt: Date | string;
  latestType: string;
  title: string;
  number: number | null;
  status: string | null;
  trackedDurationSeconds: number | null;
  trackedMinutes: number | null;
  projectKey: string | null;
  updatedAt: Date | string | null;
};

/** Map a latest-timer activity row into a chrome recent-timer entry. */
export function toRecentTaskTimer(
  row: RecentTaskTimerRow,
  nowMs: number = Date.now(),
): RecentTaskTimer {
  const lastTimerAt =
    row.lastTimerAt instanceof Date
      ? row.lastTimerAt
      : new Date(String(row.lastTimerAt));
  const updatedAt =
    row.updatedAt == null
      ? null
      : row.updatedAt instanceof Date
        ? row.updatedAt
        : new Date(String(row.updatedAt));
  const trackedDurationSeconds =
    row.trackedDurationSeconds == null
      ? null
      : Number(row.trackedDurationSeconds);
  const trackedMinutes =
    row.trackedMinutes == null ? null : Number(row.trackedMinutes);
  const isRunning =
    row.latestType === "timer_started" &&
    isActiveOpenRunningTimer({
      startedAtMs: lastTimerAt.getTime(),
      trackedDurationSeconds,
      trackedMinutes,
      updatedAtMs:
        updatedAt && !Number.isNaN(updatedAt.getTime())
          ? updatedAt.getTime()
          : null,
      nowMs,
    });

  return {
    taskId: row.taskId,
    // Anchor for clients: unpaired start time when live, else last activity.
    startedAt: lastTimerAt,
    lastTimerAt,
    isRunning,
    title: row.title,
    number: row.number == null ? null : Number(row.number),
    status: row.status,
    trackedDurationSeconds,
    trackedMinutes,
    projectKey: row.projectKey,
    updatedAt,
  };
}
