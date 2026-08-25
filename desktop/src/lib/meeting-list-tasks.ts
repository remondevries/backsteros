import { useEffect, useMemo, useState } from "react";

import type { MeetingListItem, TaskItemRowTask } from "@backsteros/ui";
import {
  buildTaskListMeetingItem,
  filterMeetingTaskRowsForProject,
  getMeetingTaskListHref,
  isMeetingTaskListItem,
} from "@backsteros/ui";

const MEETING_STATUS_TICK_MS = 15_000;

export function mapMeetingsToTaskRows(
  meetings: readonly MeetingListItem[],
  now = new Date(),
): TaskItemRowTask[] {
  return meetings.map((meeting) => buildTaskListMeetingItem(meeting, now));
}

/** Keeps meeting row status/icons aligned with the current clock. */
export function useMeetingTaskRows(
  meetings: readonly MeetingListItem[],
): TaskItemRowTask[] {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const intervalId = window.setInterval(tick, MEETING_STATUS_TICK_MS);
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

  return useMemo(
    () => mapMeetingsToTaskRows(meetings, now),
    [meetings, now],
  );
}

export {
  filterMeetingTaskRowsForProject,
  getMeetingTaskListHref,
  isMeetingTaskListItem,
};
