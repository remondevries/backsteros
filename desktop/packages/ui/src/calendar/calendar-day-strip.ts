/** Local-day helpers for the vertical day scroll strip. */

import { calendarStripCenterIndex } from "./calendar-strip-geometry.js";
import {
  addDaysDate,
  formatLocalYmd,
  parseLocalYmd,
} from "./calendar-week-strip.js";

/**
 * Seven day panes (±3) — enough buffer for normal-speed pans without mounting
 * a heavy stack of time grids.
 */
export const CALENDAR_DAY_STRIP_PANE_COUNT = 7;

export const CALENDAR_DAY_STRIP_CENTER_INDEX = calendarStripCenterIndex(
  CALENDAR_DAY_STRIP_PANE_COUNT,
);

export function startOfLocalDayDate(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function formatDayAnchorYmd(date: Date): string {
  return formatLocalYmd(startOfLocalDayDate(date));
}

export function parseDayAnchorYmd(ymd: string): Date {
  return startOfLocalDayDate(parseLocalYmd(ymd));
}

/** Sticky pane label, e.g. "Saturday, Sep 19". */
export function formatCalendarDayStripHeaderLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

/** Prev…next days around the anchor (anchor sits at the center pane). */
export function calendarDayStripDates(
  anchorDay: Date,
  paneCount: number = CALENDAR_DAY_STRIP_PANE_COUNT,
): Date[] {
  const day = startOfLocalDayDate(anchorDay);
  const center = calendarStripCenterIndex(paneCount);
  const dates: Date[] = [];
  for (let i = 0; i < paneCount; i += 1) {
    dates.push(addDaysDate(day, i - center));
  }
  return dates;
}
