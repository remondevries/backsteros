"use client";

import {
  formatTimetrackingDuration,
  formatTimetrackingLeadingStamp,
  resolveTimetrackingGroupDateYmd,
} from "../../calendar/calendar-timetracking-entries.js";
import { TrackedTimeIcon } from "../icons/tracked-time-icon.js";

export type TimetrackingLeadingStampProps = {
  scheduleAt?: Date | number | string | null;
  trackedDurationSeconds: number;
  timeZone?: string;
  className?: string;
  /** Running timer — green live chrome + pulsing duration. */
  isLive?: boolean;
};

/**
 * Leading Timetracking chrome: schedule day · stopwatch · tracked duration.
 */
export function TimetrackingLeadingStamp({
  scheduleAt,
  trackedDurationSeconds,
  timeZone,
  className,
  isLive = false,
}: TimetrackingLeadingStampProps) {
  const ymd = resolveTimetrackingGroupDateYmd(scheduleAt, timeZone);
  const duration = formatTimetrackingDuration(trackedDurationSeconds);
  const title = isLive
    ? `${formatTimetrackingLeadingStamp(scheduleAt, trackedDurationSeconds, timeZone)} (live)`
    : formatTimetrackingLeadingStamp(
        scheduleAt,
        trackedDurationSeconds,
        timeZone,
      );

  return (
    <span
      className={[
        "task-item-row__due-ymd",
        "task-item-row__tracked-stamp",
        isLive ? "is-live" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      title={title}
      data-timetracking-live={isLive ? "true" : undefined}
    >
      {ymd ? (
        <span className="task-item-row__tracked-stamp-date">{ymd}</span>
      ) : null}
      <TrackedTimeIcon
        className="task-item-row__tracked-stamp-icon"
        size={12}
      />
      <span className="task-item-row__tracked-stamp-duration">{duration}</span>
    </span>
  );
}
