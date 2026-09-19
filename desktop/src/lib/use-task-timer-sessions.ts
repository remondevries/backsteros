import { useCallback, useEffect, useMemo, useState } from "react";
import type { TaskActivity } from "@backsteros/contracts";

import {
  buildTimetrackingSessionsFromActivities,
  type TimetrackingSession,
} from "../../packages/ui/src/calendar/calendar-timetracking-sessions";
import { useDesktopApi } from "./api-context";

type ActivitiesResponse = {
  activities: TaskActivity[];
};

type TaskTrackedResponse = {
  trackedDurationSeconds?: number | null;
};

/** Default length for manually added time entries (must be > 0 to appear in the list). */
const DEFAULT_NEW_SESSION_SECONDS = 60;

/**
 * Loads timer sessions for a task via REST (avoids stale PowerSync activities).
 */
export function useTaskTimerSessions(taskId: string | null | undefined): {
  sessions: TimetrackingSession[];
  loading: boolean;
  error: string | null;
  deleteSession: (session: TimetrackingSession) => Promise<void>;
  createSession: () => Promise<void>;
  updateSessionActor: (
    session: TimetrackingSession,
    actorContactId: string,
  ) => Promise<void>;
} {
  const { client } = useDesktopApi();
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reloadActivities = useCallback(async () => {
    if (!taskId) {
      setActivities([]);
      return;
    }
    const body = await client.requestJson<ActivitiesResponse>(
      `/api/v1/tasks/${encodeURIComponent(taskId)}/activities`,
    );
    setActivities(body.activities ?? []);
  }, [client, taskId]);

  useEffect(() => {
    if (!taskId) {
      setActivities([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void reloadActivities()
      .then(() => {
        if (cancelled) return;
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setActivities([]);
        setLoading(false);
        setError("Couldn’t load timer sessions.");
      });

    return () => {
      cancelled = true;
    };
  }, [reloadActivities, taskId]);

  const sessions = useMemo(() => {
    void tick;
    return buildTimetrackingSessionsFromActivities(activities);
  }, [activities, tick]);

  useEffect(() => {
    if (!sessions.some((session) => session.isRunning)) return;
    const id = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [sessions]);

  const deleteSession = useCallback(
    async (session: TimetrackingSession) => {
      if (!taskId || session.isRunning) {
        throw new Error("Cannot delete this session.");
      }
      const activityId = session.stopActivityId ?? session.startActivityId;
      await client.requestJson(
        `/api/v1/tasks/${encodeURIComponent(taskId)}/activities/${encodeURIComponent(activityId)}`,
        { method: "DELETE" },
      );
      setActivities((current) =>
        current.filter(
          (activity) =>
            activity.id !== session.startActivityId &&
            activity.id !== session.stopActivityId,
        ),
      );
    },
    [client, taskId],
  );

  const createSession = useCallback(async () => {
    if (!taskId) {
      throw new Error("Cannot add a time entry without a task.");
    }
    if (sessions.some((session) => session.isRunning)) {
      throw new Error("Stop the running timer before adding a time entry.");
    }

    const durationSeconds = DEFAULT_NEW_SESSION_SECONDS;
    const activitiesPath = `/api/v1/tasks/${encodeURIComponent(taskId)}/activities`;

    await client.requestJson(activitiesPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "timer_started" }),
    });
    await client.requestJson(activitiesPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "timer_stopped",
        data: { durationSeconds },
      }),
    });

    await reloadActivities();

    try {
      const task = await client.requestJson<TaskTrackedResponse>(
        `/api/v1/tasks/${encodeURIComponent(taskId)}`,
      );
      const current = Math.max(0, Math.round(task.trackedDurationSeconds ?? 0));
      const next = current + durationSeconds;
      await client.requestJson(`/api/v1/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trackedDurationSeconds: next,
          trackedMinutes: next >= 60 ? Math.floor(next / 60) : null,
        }),
      });
    } catch {
      // Session rows already exist; tracked total sync is best-effort.
    }
  }, [client, reloadActivities, sessions, taskId]);

  const updateSessionActor = useCallback(
    async (session: TimetrackingSession, actorContactId: string) => {
      if (!taskId) {
        throw new Error("Cannot update this session.");
      }
      const nextId = actorContactId.trim();
      if (!nextId || nextId === session.actorContactId) return;
      const activityId = session.stopActivityId ?? session.startActivityId;
      const updated = await client.requestJson<TaskActivity>(
        `/api/v1/tasks/${encodeURIComponent(taskId)}/activities/${encodeURIComponent(activityId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ actorContactId: nextId }),
        },
      );
      setActivities((current) =>
        current.map((activity) => {
          if (
            activity.id !== session.startActivityId &&
            activity.id !== session.stopActivityId
          ) {
            return activity;
          }
          return {
            ...activity,
            actorContactId: updated.actorContactId,
            actorEmail: updated.actorEmail,
            actorName: updated.actorName,
            actorUserId: updated.actorUserId,
          };
        }),
      );
    },
    [client, taskId],
  );

  return {
    sessions,
    loading,
    error,
    deleteSession,
    createSession,
    updateSessionActor,
  };
}
