import { useCallback } from "react";

import { cloudCoreRequestJson } from "./cloud-core-api";

/**
 * Posts timer_started / timer_stopped to cloud-core so OS / DESIGN / DEV
 * chrome see the same running timer. Bumps the activity feed on success.
 */
export function usePostTaskTimerActivity(
  taskId: string | null | undefined,
  onPosted?: () => void,
) {
  return useCallback(
    (action: "start" | "pause", sessionSeconds?: number | null) => {
      if (!taskId) return;
      const body =
        action === "start"
          ? { type: "timer_started" as const }
          : {
              type: "timer_stopped" as const,
              data: {
                durationSeconds: Math.max(
                  0,
                  Math.round(sessionSeconds ?? 0),
                ),
              },
            };
      void cloudCoreRequestJson(
        `/api/v1/tasks/${encodeURIComponent(taskId)}/activities`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      )
        .then(() => {
          onPosted?.();
        })
        .catch(() => {
          // Activity feed is best-effort; tracked time still persists separately.
        });
    },
    [onPosted, taskId],
  );
}
