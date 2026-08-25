import { useEffect, useRef } from "react";

import {
  meetingStatusNeedsReconcile,
  type MeetingListItem,
} from "@backsteros/ui";

const RECONCILE_INTERVAL_MS = 15_000;

export function useMeetingStatusReconciler(
  meetings: readonly MeetingListItem[],
  patchMeeting: (id: string, values: Record<string, unknown>) => Promise<void>,
) {
  const meetingsRef = useRef(meetings);
  meetingsRef.current = meetings;
  const patchMeetingRef = useRef(patchMeeting);
  patchMeetingRef.current = patchMeeting;
  const inFlightRef = useRef(new Set<string>());

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      for (const meeting of meetingsRef.current) {
        if (inFlightRef.current.has(meeting.id)) continue;
        const nextStatus = meetingStatusNeedsReconcile(meeting, now);
        if (!nextStatus) continue;
        inFlightRef.current.add(meeting.id);
        void patchMeetingRef
          .current(meeting.id, { status: nextStatus })
          .catch(() => {
            // Retry on the next tick.
          })
          .finally(() => {
            inFlightRef.current.delete(meeting.id);
          });
      }
    };

    tick();
    const intervalId = window.setInterval(tick, RECONCILE_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
}
