/** First-of-month helpers for the vertical month scroll strip. */

import { calendarStripCenterIndex } from "./calendar-strip-geometry.js";
import { formatLocalYmd, parseLocalYmd } from "./calendar-week-strip.js";

/** Rolling year window — enough that normal-speed pans never hit a cold pane. */
export const CALENDAR_MONTH_STRIP_PANE_COUNT = 12;

export const CALENDAR_MONTH_STRIP_CENTER_INDEX = calendarStripCenterIndex(
  CALENDAR_MONTH_STRIP_PANE_COUNT,
);

/** Monday-first labels matching FullCalendar `firstDay: 1`. */
export const CALENDAR_MONTH_STRIP_WEEKDAY_LABELS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;

/** 1st of the month containing `date`, local midnight. */
export function startOfMonthDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

export function addMonthsDate(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

/** Prev…next months around the anchor (anchor sits at the center pane). */
export function calendarMonthStripDates(
  anchorFirst: Date,
  paneCount: number = CALENDAR_MONTH_STRIP_PANE_COUNT,
): Date[] {
  const first = startOfMonthDate(anchorFirst);
  const center = calendarStripCenterIndex(paneCount);
  const dates: Date[] = [];
  for (let i = 0; i < paneCount; i += 1) {
    dates.push(addMonthsDate(first, i - center));
  }
  return dates;
}

export function formatLocalYm(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Stable month-anchor key (YYYY-MM-01) for React state. */
export function formatMonthAnchorYmd(date: Date): string {
  return formatLocalYmd(startOfMonthDate(date));
}

export function parseMonthAnchorYmd(ymd: string): Date {
  return startOfMonthDate(parseLocalYmd(ymd));
}
