import { useCallback } from "react";

import { useDesktopApi } from "./api-context";

/**
 * Posts timer_started / timer_stopped activities for a task and bumps the
 * activity feed so the new rows appear without a full page refresh.
 */
export function usePostTaskTimerActivity(
  taskId: string | null | undefined,
  onPosted?: () => void,
) {
  const { client } = useDesktopApi();

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
      void client
        .requestJson(
          `/api/v1/tasks/${encodeURIComponent(taskId)}/activities`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
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
    [client, onPosted, taskId],
  );
}
