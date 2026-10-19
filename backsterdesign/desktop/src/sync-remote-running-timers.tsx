import { useEffect, useRef } from "react";
import {
  getProjectTaskHref,
  getTaskDisplayId,
} from "@backsteros/ui";
import {
  useTrackedTimer,
  type RemoteRunningTimerAdoption,
} from "@backsteros/ui/shell";

import { coreRequestJson, readCoreConfig } from "./core-config";

type FocusedTaskResponse = {
  id?: string;
  title?: string;
  number?: number | null;
  projectKey?: string | null;
  status?: string | null;
  trackedDurationSeconds?: number | null;
  task?: FocusedTaskResponse;
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
  updatedAt?: string | null;
};

const POLL_INTERVAL_MS = 2_000;
const TIMER_STORAGE_KEY = "backsterdesign.desktop.timer";

type FocusedTimer = {
  taskId: string;
  title: string;
  number: number | null;
  projectKey: string | null;
  status: string | null;
  trackedDurationSeconds: number | null;
};

function loadFocusedTimer(): FocusedTimer | null {
  try {
    const raw = localStorage.getItem(TIMER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FocusedTimer>;
    if (!parsed.taskId || typeof parsed.taskId !== "string") return null;
    return {
      taskId: parsed.taskId,
      title: typeof parsed.title === "string" ? parsed.title : "Task",
      number: typeof parsed.number === "number" ? parsed.number : null,
      projectKey:
        typeof parsed.projectKey === "string" ? parsed.projectKey : null,
      status: typeof parsed.status === "string" ? parsed.status : null,
      trackedDurationSeconds:
        typeof parsed.trackedDurationSeconds === "number"
          ? parsed.trackedDurationSeconds
          : null,
    };
  } catch {
    return null;
  }
}

function saveFocusedTimer(timer: FocusedTimer): void {
  try {
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timer));
  } catch {
    // The pill still works for this session.
  }
}

function parseStartedAtMs(value: string): number {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Date.now();
}

/**
 * Mirrors open task timers from local-core into TrackedTimerProvider so the
 * chrome ContentTabsTimer strip stays live (same approach as BacksterOS).
 */
export function SyncRemoteRunningTimers({
  taskId = null,
}: {
  /** Open dashboard task. The header pill follows this, same as BacksterOS. */
  taskId?: string | null;
}) {
  const timer = useTrackedTimer() as ReturnType<typeof useTrackedTimer> & {
    syncRemoteRunningTimers: (adoptions: RemoteRunningTimerAdoption[]) => void;
  };
  const config = useRef(readCoreConfig());
  const syncRef = useRef(timer.syncRemoteRunningTimers);
  syncRef.current = timer.syncRemoteRunningTimers;
  const registerRef = useRef(timer.registerTimer);
  registerRef.current = timer.registerTimer;

  const registerFocused = (row: FocusedTimer) => {
    const projectKey = row.projectKey?.trim() || null;
    const number = row.number;
    const displayId = getTaskDisplayId({ number, projectKey }, projectKey);
    const href =
      projectKey && number != null
        ? getProjectTaskHref(projectKey, number)
        : `/tasks/${encodeURIComponent(row.taskId)}`;
    const cfg = config.current;
    const taskId = row.taskId;
    registerRef.current({
      kind: "task",
      entityId: taskId,
      title: row.title?.trim() || displayId || "Task",
      subtitle: displayId,
      statusKey: row.status,
      href,
      trackedDurationSeconds: row.trackedDurationSeconds,
      onPersist: (seconds) => {
        saveFocusedTimer({ ...row, trackedDurationSeconds: seconds });
        void coreRequestJson(cfg, `/api/v1/tasks/${encodeURIComponent(taskId)}`, {
          method: "PATCH",
          body: JSON.stringify({ trackedDurationSeconds: seconds }),
        }).catch(() => {});
      },
      onSessionChange: (action, sessionSeconds) => {
        if (action === "started") {
          void coreRequestJson(
            cfg,
            `/api/v1/tasks/${encodeURIComponent(taskId)}/activities`,
            {
              method: "POST",
              body: JSON.stringify({ type: "timer_started" }),
            },
          ).catch(() => {});
          return;
        }
        void coreRequestJson(
          cfg,
          `/api/v1/tasks/${encodeURIComponent(taskId)}/activities`,
          {
            method: "POST",
            body: JSON.stringify({
              type: "timer_stopped",
              data: {
                durationSeconds: Math.max(0, Math.round(sessionSeconds ?? 0)),
              },
            }),
          },
        ).catch(() => {});
      },
    });
  };

  useEffect(() => {
    const stored = loadFocusedTimer();
    if (stored) registerFocused(stored);
    // Restore once so a reload does not blank the pill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = taskId?.trim();
    if (!id) return;
    let cancelled = false;
    const cfg = config.current;
    void coreRequestJson<FocusedTaskResponse>(
      cfg,
      `/api/v1/tasks/${encodeURIComponent(id)}`,
    )
      .then((body) => {
        if (cancelled) return;
        const task = body.task ?? body;
        if (!task.id) return;
        const row: FocusedTimer = {
          taskId: task.id,
          title: task.title?.trim() || "Task",
          number: typeof task.number === "number" ? task.number : null,
          projectKey: task.projectKey?.trim() || null,
          status: task.status ?? null,
          trackedDurationSeconds:
            typeof task.trackedDurationSeconds === "number"
              ? task.trackedDurationSeconds
              : null,
        };
        saveFocusedTimer(row);
        registerFocused(row);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const cfg = config.current;

    const apply = (rows: RunningTimerApiRow[]) => {
      const sync = syncRef.current;
      if (!sync) return;

      const adoptions: RemoteRunningTimerAdoption[] = rows.map((row) => {
        const taskId = row.taskId;
        const projectKey = row.projectKey?.trim() || null;
        const number = row.number;
        const displayId = getTaskDisplayId({ number, projectKey }, projectKey);
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
          updatedAtMs: row.updatedAt ? parseStartedAtMs(row.updatedAt) : null,
          onPersist: (seconds: number | null) => {
            void coreRequestJson(cfg, `/api/v1/tasks/${encodeURIComponent(taskId)}`, {
              method: "PATCH",
              body: JSON.stringify({ trackedDurationSeconds: seconds }),
            }).catch(() => {});
          },
          onSessionChange: (
            action: "started" | "stopped",
            sessionSeconds?: number,
          ) => {
            if (action === "started") return;
            void coreRequestJson(
              cfg,
              `/api/v1/tasks/${encodeURIComponent(taskId)}/activities`,
              {
                method: "POST",
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
            ).catch(() => {});
          },
        };
      });

      sync(adoptions);
    };

    const poll = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const body = await coreRequestJson<{ timers: RunningTimerApiRow[] }>(
          cfg,
          "/api/v1/running-timers",
        );
        if (cancelled) return;
        apply(body.timers ?? []);
      } catch {
        // Best-effort; next tick retries.
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

  return null;
}
