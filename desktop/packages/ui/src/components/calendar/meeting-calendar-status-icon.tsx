"use client";

import { useSyncExternalStore } from "react";

import { iconSvgColorStyle, mergeIconSvgClassName } from "../../entity/icon-color.js";
import {
  getPreferredColorSchemeSnapshot,
  resolveTaskStatusColor,
  subscribeToPreferredColorScheme,
} from "../../tasks/task-status-color.js";
import { CalendarIcon } from "../icons/calendar-icon.js";
import { TaskDueDateIcon } from "../tasks/task-due-date-icon.js";

import "./meeting-calendar-status-icon.css";

export type MeetingCalendarStatusIconProps = {
  startAt?: number | Date | string | null;
  endAt?: number | Date | string | null;
  status?: string | null;
  /** When true, force finished (muted) styling. */
  finished?: boolean;
  now?: Date;
  size?: number;
  className?: string;
};

function parseInstant(
  value: number | Date | string | null | undefined,
): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Now intersects the meeting window (started, not yet ended). */
function isMeetingLive(
  startAt: number | Date | string | null | undefined,
  endAt: number | Date | string | null | undefined,
  status: string | null | undefined,
  now: Date,
): boolean {
  const stored = (status ?? "").trim().toLowerCase();
  if (
    stored === "canceled" ||
    stored === "completed" ||
    stored === "duplicated"
  ) {
    return false;
  }
  const start = parseInstant(startAt);
  if (!start || start.getTime() > now.getTime()) return false;
  const end = parseInstant(endAt);
  if (end && end.getTime() <= now.getTime()) return false;
  return true;
}

/**
 * Calendar glyph for meetings — identical on desktop grid events and host lists.
 * When now intersects the meeting window, paints in-progress yellow and pulses.
 */
export function MeetingCalendarStatusIcon({
  startAt = null,
  endAt = null,
  status = null,
  finished = false,
  now = new Date(),
  size = 12,
  className,
}: MeetingCalendarStatusIconProps) {
  const colorScheme = useSyncExternalStore(
    subscribeToPreferredColorScheme,
    getPreferredColorSchemeSnapshot,
    () => "dark" as const,
  );
  const live = !finished && isMeetingLive(startAt, endAt, status, now);
  const inTriage = (status ?? "").trim().toLowerCase() === "triage";
  const inProgressColor = resolveTaskStatusColor("in_progress", undefined, {
    colorScheme,
  });

  if (live) {
    return (
      <CalendarIcon
        size={size}
        className={mergeIconSvgClassName(
          ["meeting-calendar-status-icon", "meeting-calendar-status-icon--live", className]
            .filter(Boolean)
            .join(" "),
          {},
        )}
        style={iconSvgColorStyle(inProgressColor)}
      />
    );
  }

  return (
    <TaskDueDateIcon
      active={!finished}
      urgency={finished ? null : inTriage ? "due_soon" : "due_today"}
      size={size}
      className={mergeIconSvgClassName(
        ["meeting-calendar-status-icon", className].filter(Boolean).join(" "),
        {},
      )}
    />
  );
}
