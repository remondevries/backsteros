import { useEffect, useRef } from "react";
import { getProjectTaskHref, getTaskDisplayId } from "@backsteros/ui";
import { useTrackedTimer } from "@backsteros/ui/shell";

import { useDesktopApi } from "./api-context";

type RemoteRunningTimerAdoption = {
  kind: "task";
  entityId: string;
  title: string;
  subtitle?: string | null;
  statusKey?: string | null;
  href: string;
  trackedDurationSeconds: number | null;
  trackedMinutes?: number | null;
  remoteStartedAtMs: number;
  onPersist: (seconds: number | null, fromTimerPause?: boolean) => void;
  onSessionChange?: (
    action: "started" | "stopped",
    sessionSeconds?: number,
  ) => void;
};

type RunningTimerApiRow = {
  taskId: string;
  startedAt: string;
  title: string;
  number: number | null;
  status: string | null;
  trackedDurationSeconds: number | null;
  trackedMinutes: number | null;
  projectKey: string | null;
};

const POLL_INTERVAL_MS = 2_000;

function parseStartedAtMs(value: string): number {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Date.now();
}

/**
 * Keeps the top-right timer strip in sync with open `timer_started` activities
 * from any client (e.g. backsteros-development).
 *
 * Uses REST against local-core — PowerSync `task_activities` can lag or stall,
 * so activity-based local SQL is not reliable for live chrome.
 */
export function useSyncRemoteRunningTimers(): void {
  const timer = useTrackedTimer() as ReturnType<typeof useTrackedTimer> & {
    syncRemoteRunningTimers: (adoptions: RemoteRunningTimerAdoption[]) => void;
  };
  const { client } = useDesktopApi();

  const clientRef = useRef(client);
  clientRef.current = client;
  const syncRef = useRef(timer.syncRemoteRunningTimers);
  syncRef.current = timer.syncRemoteRunningTimers;

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const apply = (rows: RunningTimerApiRow[]) => {
      const sync = syncRef.current;
      if (!sync) return;

      const adoptions: RemoteRunningTimerAdoption[] = rows.map((row) => {
        const taskId = row.taskId;
        const projectKey = row.projectKey?.trim() || null;
        const number = row.number;
        const displayId = getTaskDisplayId(
          { number, projectKey },
          projectKey,
        );
        const href =
          projectKey && number != null
            ? getProjectTaskHref(projectKey, number)
            : `/tasks/${encodeURIComponent(taskId)}`;

        return {
          kind: "task" as const,
          entityId: taskId,
          title: row.title?.trim() || displayId || "Task",
          subtitle: displayId,
          statusKey: row.status,
          href,
          trackedDurationSeconds: row.trackedDurationSeconds,
          trackedMinutes: row.trackedMinutes,
          remoteStartedAtMs: parseStartedAtMs(row.startedAt),
          onPersist: (seconds: number | null) => {
            void clientRef.current
              .requestJson(`/api/v1/tasks/${encodeURIComponent(taskId)}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ trackedDurationSeconds: seconds }),
              })
              .catch(() => {
                // Soft checkpoint / pause persist is best-effort from chrome.
              });
          },
          onSessionChange: (
            action: "started" | "stopped",
            sessionSeconds?: number,
          ) => {
            if (action === "started") return;
            void clientRef.current
              .requestJson(
                `/api/v1/tasks/${encodeURIComponent(taskId)}/activities`,
                {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    type: "timer_stopped",
                    data: {
                      durationSeconds: Math.max(
                        0,
                        Math.round(sessionSeconds ?? 0),
                      ),
                    },
                  }),
                },
              )
              .catch(() => {
                // Activity feed is best-effort.
              });
          },
        };
      });

      sync(adoptions);
    };

    const poll = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const body = await clientRef.current.requestJson<{
          timers: RunningTimerApiRow[];
        }>("/api/v1/running-timers");
        if (cancelled) return;
        apply(body.timers ?? []);
      } catch {
        // Poll is best-effort; next tick retries.
      } finally {
        inFlight = false;
      }
    };

    void poll();
    const id = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);
}
