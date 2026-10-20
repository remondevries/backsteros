import { useEffect, useRef } from "react";
import {
  getProjectTaskHref,
  getTaskDisplayId,
  useTrackedTimer,
  type RemoteRunningTimerAdoption,
} from "@backsteros/ui";

import { apiJson, readCoreConfig, type CoreConfig } from "./core-api.js";

type RecentTimerApiRow = {
  taskId: string;
  startedAt: string;
  lastTimerAt?: string;
  isRunning?: boolean;
  title: string;
  number: number | null;
  status: string | null;
  trackedDurationSeconds: number | null;
  trackedMinutes: number | null;
  projectKey: string | null;
  updatedAt?: string | null;
};

const POLL_INTERVAL_MS = 2_000;

function parseStartedAtMs(value: string): number {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Date.now();
}

/**
 * Mirrors recent task timers from cloud-core (window.backsterosCore) into
 * TrackedTimerProvider so bridge pills + chrome stay aligned with OS / DEV.
 */
export function SyncRemoteRunningTimers() {
  const timer = useTrackedTimer() as ReturnType<typeof useTrackedTimer> & {
    syncRemoteRunningTimers: (
      adoptions: RemoteRunningTimerAdoption[],
      options?: { pruneAbsent?: boolean },
    ) => void;
  };
  const syncRef = useRef(timer.syncRemoteRunningTimers);
  syncRef.current = timer.syncRemoteRunningTimers;

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const apply = (
      cfg: CoreConfig,
      rows: RecentTimerApiRow[],
      options?: { pruneAbsent?: boolean },
    ) => {
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
        const lastTimerAtMs = parseStartedAtMs(
          row.lastTimerAt ?? row.startedAt,
        );

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
          lastTimerAtMs,
          isRunning: row.isRunning,
          updatedAtMs: row.updatedAt ? parseStartedAtMs(row.updatedAt) : null,
          onPersist: (seconds: number | null) => {
            void apiJson(cfg, `/api/v1/tasks/${encodeURIComponent(taskId)}`, {
              method: "PATCH",
              body: JSON.stringify({ trackedDurationSeconds: seconds }),
            }).catch(() => {});
          },
          onSessionChange: (
            action: "started" | "stopped",
            sessionSeconds?: number,
          ) => {
            if (action === "started") return;
            void apiJson(
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

      sync(adoptions, options);
    };

    const poll = async () => {
      if (cancelled || inFlight) return;
      const cfg = readCoreConfig();
      if (!cfg) return;
      inFlight = true;
      try {
        let rows: RecentTimerApiRow[] = [];
        let pruneAbsent = false;
        try {
          const body = await apiJson<{ timers: RecentTimerApiRow[] }>(
            cfg,
            "/api/v1/recent-timers",
          );
          rows = body.timers ?? [];
          pruneAbsent = true;
        } catch {
          const body = await apiJson<{ timers: RecentTimerApiRow[] }>(
            cfg,
            "/api/v1/running-timers",
          );
          rows = (body.timers ?? []).map((row) => ({
            ...row,
            isRunning: true,
            lastTimerAt: row.startedAt,
          }));
        }
        if (cancelled) return;
        apply(cfg, rows, { pruneAbsent });
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
