import type { TaskActivity } from "@backsteros/contracts";

export type TimetrackingSession = {
  id: string;
  /** `timer_started` activity id for this session. */
  startActivityId: string;
  /** `timer_stopped` activity id when closed; null while running. */
  stopActivityId: string | null;
  startedAt: string;
  stoppedAt: string | null;
  /** Session length in seconds (from stop activity, or elapsed if still running). */
  durationSeconds: number;
  isRunning: boolean;
  actorName: string | null;
  actorContactId: string | null;
  actorEmail: string | null;
};

/** Match server `OPEN_RUNNING_TIMER_MAX_AGE_MS` — older unpaired starts are abandoned. */
export const TIMETRACKING_SESSION_MAX_RUNNING_AGE_MS = 36 * 60 * 60 * 1000;

function asDurationSeconds(data: Record<string, unknown> | null | undefined): number | null {
  const value = data?.durationSeconds;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

/**
 * Pair `timer_started` / `timer_stopped` activities into discrete sessions
 * (newest first). An unpaired start within {@link TIMETRACKING_SESSION_MAX_RUNNING_AGE_MS}
 * is treated as still running; older orphans are dropped.
 */
export function buildTimetrackingSessionsFromActivities(
  activities: readonly TaskActivity[],
  nowMs: number = Date.now(),
  maxRunningAgeMs: number = TIMETRACKING_SESSION_MAX_RUNNING_AGE_MS,
): TimetrackingSession[] {
  const timerEvents = activities
    .filter(
      (activity) =>
        activity.type === "timer_started" || activity.type === "timer_stopped",
    )
    .slice()
    .sort((a, b) => {
      const aMs = Date.parse(a.createdAt);
      const bMs = Date.parse(b.createdAt);
      if (aMs !== bMs) return aMs - bMs;
      return a.id.localeCompare(b.id);
    });

  const sessions: TimetrackingSession[] = [];
  let openStart: TaskActivity | null = null;

  for (const activity of timerEvents) {
    if (activity.type === "timer_started") {
      if (openStart) {
        // Abandoned start without stop — omit (no recorded duration).
        void openStart;
      }
      openStart = activity;
      continue;
    }

    // timer_stopped
    if (!openStart) continue;
    const startedMs = Date.parse(openStart.createdAt);
    const stoppedMs = Date.parse(activity.createdAt);
    const fromData = asDurationSeconds(activity.data);
    const computed =
      Number.isFinite(startedMs) && Number.isFinite(stoppedMs)
        ? Math.max(0, Math.round((stoppedMs - startedMs) / 1000))
        : 0;
    const durationSeconds = fromData ?? computed;
    // Skip zero-length closes (orphans we killed, or accidental empty stops).
    if (durationSeconds > 0) {
      sessions.push({
        id: activity.id,
        startActivityId: openStart.id,
        stopActivityId: activity.id,
        startedAt: openStart.createdAt,
        stoppedAt: activity.createdAt,
        durationSeconds,
        isRunning: false,
        actorName:
          activity.actorName?.trim() || openStart.actorName?.trim() || null,
        actorContactId:
          activity.actorContactId?.trim() ||
          openStart.actorContactId?.trim() ||
          null,
        actorEmail:
          activity.actorEmail?.trim().toLowerCase() ||
          openStart.actorEmail?.trim().toLowerCase() ||
          null,
      });
    }
    openStart = null;
  }

  if (openStart) {
    const startedMs = Date.parse(openStart.createdAt);
    const ageMs = Number.isFinite(startedMs) ? nowMs - startedMs : Infinity;
    if (ageMs <= maxRunningAgeMs) {
      const elapsed = Number.isFinite(startedMs)
        ? Math.max(0, Math.round((nowMs - startedMs) / 1000))
        : 0;
      sessions.push({
        id: openStart.id,
        startActivityId: openStart.id,
        stopActivityId: null,
        startedAt: openStart.createdAt,
        stoppedAt: null,
        durationSeconds: elapsed,
        isRunning: true,
        actorName: openStart.actorName?.trim() || null,
        actorContactId: openStart.actorContactId?.trim() || null,
        actorEmail: openStart.actorEmail?.trim().toLowerCase() || null,
      });
    }
  }

  return sessions.sort((a, b) => {
    const aMs = Date.parse(a.startedAt);
    const bMs = Date.parse(b.startedAt);
    if (aMs !== bMs) return bMs - aMs;
    return b.id.localeCompare(a.id);
  });
}

export function sumTimetrackingSessionSeconds(
  sessions: readonly TimetrackingSession[],
): number {
  return sessions.reduce(
    (sum, session) => sum + Math.max(0, session.durationSeconds),
    0,
  );
}
