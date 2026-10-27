import { useEffect, useRef } from "react";
import { getProjectTaskHref, getTaskDisplayId } from "@backsteros/ui";
import { useTrackedTimer } from "@backsteros/ui/shell";

import {
  cloudCoreRequestJson,
  isCloudCoreApiError,
} from "./cloud-core-api";
import { loadDesktopOwnerToken } from "./local-shell-auth";

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
  updatedAtMs?: number | null;
  isRunning?: boolean;
  lastTimerAtMs?: number | null;
  onPersist: (seconds: number | null, fromTimerPause?: boolean) => void;
  onSessionChange?: (
    action: "started" | "stopped",
    sessionSeconds?: number,
  ) => void;
};

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
/** Slow down after auth failure so we do not spam 401s every 2s. */
const AUTH_BACKOFF_MS = 60_000;

function parseStartedAtMs(value: string): number {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Date.now();
}

/**
 * Keeps the top-right timer strip + dropdown in sync with recent timers from
 * any client (OS / DESIGN / DEV) via cloud-core GET /api/v1/recent-timers.
 */
export function useSyncRemoteRunningTimers(): void {
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
    let nextAllowedAt = 0;

    const apply = (
      rows: RecentTimerApiRow[],
      options?: { pruneAbsent?: boolean },
    ) => {
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
            void cloudCoreRequestJson(
              `/api/v1/tasks/${encodeURIComponent(taskId)}`,
              {
                method: "PATCH",
                body: JSON.stringify({ trackedDurationSeconds: seconds }),
              },
            ).catch(() => {
              // Soft checkpoint / pause persist is best-effort from chrome.
            });
          },
          onSessionChange: (
            action: "started" | "stopped",
            sessionSeconds?: number,
          ) => {
            if (action === "started") return;
            void cloudCoreRequestJson(
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
            ).catch(() => {
              // Activity feed is best-effort.
            });
          },
        };
      });

      sync(adoptions, options);
    };

    const poll = async () => {
      if (cancelled || inFlight) return;
      if (Date.now() < nextAllowedAt) return;
      inFlight = true;
      try {
        const token = await loadDesktopOwnerToken();
        if (!token) {
          // No owner key yet — skip fetch (avoids a guaranteed 401 in Network).
          nextAllowedAt = Date.now() + AUTH_BACKOFF_MS;
          return;
        }

        let rows: RecentTimerApiRow[] = [];
        let pruneAbsent = false;
        try {
          const body = await cloudCoreRequestJson<{
            timers: RecentTimerApiRow[];
          }>("/api/v1/recent-timers");
          rows = body.timers ?? [];
          pruneAbsent = true;
        } catch (error) {
          // Only fall back when the cloud build is too old for recent-timers.
          // Auth failures must not hit running-timers (second 401 in the console).
          if (isCloudCoreApiError(error) && error.status === 404) {
            const body = await cloudCoreRequestJson<{
              timers: RecentTimerApiRow[];
            }>("/api/v1/running-timers");
            rows = (body.timers ?? []).map((row) => ({
              ...row,
              isRunning: true,
              lastTimerAt: row.startedAt,
            }));
          } else {
            if (
              isCloudCoreApiError(error) &&
              (error.status === 401 || error.status === 403)
            ) {
              nextAllowedAt = Date.now() + AUTH_BACKOFF_MS;
            }
            throw error;
          }
        }
        if (cancelled) return;
        nextAllowedAt = 0;
        apply(rows, { pruneAbsent });
      } catch {
        // Poll is best-effort; next tick retries (or auth backoff above).
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
