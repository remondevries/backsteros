import { useEffect, useRef } from "react";

import {
  createBacksterosTaskActivity,
  fetchBacksterosRecentTimers,
  fetchBacksterosRunningTimers,
  updateBacksterosTask,
  type BacksterosRecentTimer,
} from "./client";
import { syncRemoteRunningTimers } from "./trackedTimerStore";

const POLL_INTERVAL_MS = 2_000;

function parseStartedAtMs(value: string): number {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Date.now();
}

function displayIdForRow(row: BacksterosRecentTimer): string | null {
  const projectKey = row.projectKey?.trim() || null;
  if (projectKey && row.number != null) return `${projectKey}-${row.number}`;
  if (row.number != null) return `#${row.number}`;
  return null;
}

/**
 * Keeps BacksterDEV's trackedTimerStore in sync with recent timers from
 * cloud-core (product `/backsteros-api` → agent.backsteros.com), same leader
 * as BacksterOS / DESIGN.
 */
export function SyncRemoteRunningTimers() {
  const inFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const apply = (
      rows: readonly BacksterosRecentTimer[],
      options?: { pruneAbsent?: boolean },
    ) => {
      syncRemoteRunningTimers(
        rows.map((row) => {
          const taskId = row.taskId;
          const displayId = displayIdForRow(row);
          const projectKey = row.projectKey?.trim() || null;
          const href =
            projectKey && row.number != null
              ? `/backsteros/project/${encodeURIComponent(projectKey)}?task=${encodeURIComponent(taskId)}`
              : null;
          return {
            taskId,
            remoteStartedAtMs: parseStartedAtMs(row.startedAt),
            lastTimerAtMs: parseStartedAtMs(row.lastTimerAt ?? row.startedAt),
            isRunning: row.isRunning === true,
            trackedDurationSeconds: row.trackedDurationSeconds,
            trackedMinutes: row.trackedMinutes,
            updatedAtMs: row.updatedAt ? parseStartedAtMs(row.updatedAt) : null,
            title: row.title?.trim() || displayId || "Task",
            subtitle: displayId,
            statusKey: row.status,
            href,
            onPersist: (seconds: number | null) => {
              void updateBacksterosTask(taskId, {
                trackedDurationSeconds: seconds,
              }).catch(() => {
                // Soft checkpoint / pause persist is best-effort.
              });
            },
            onSessionChange: (action, sessionSeconds) => {
              if (action === "start") return;
              void createBacksterosTaskActivity(taskId, {
                type: "timer_stopped",
                data: {
                  durationSeconds: Math.max(
                    0,
                    Math.round(sessionSeconds ?? 0),
                  ),
                },
              }).catch(() => {
                // Activity feed is best-effort.
              });
            },
          };
        }),
        options,
      );
    };

    const poll = async () => {
      if (cancelled || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        let rows: readonly BacksterosRecentTimer[] = [];
        let pruneAbsent = false;
        try {
          rows = await fetchBacksterosRecentTimers();
          pruneAbsent = true;
        } catch {
          // Core without recent-timers — keep paused chrome rows.
          const running = await fetchBacksterosRunningTimers();
          rows = running.map((row) => ({
            ...row,
            isRunning: true,
            lastTimerAt: row.startedAt,
          }));
        }
        if (cancelled) return;
        apply(rows, { pruneAbsent });
      } catch {
        // Poll is best-effort; next tick retries.
      } finally {
        inFlightRef.current = false;
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
