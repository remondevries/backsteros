/** Monday-start week helpers for the horizontal week scroll strip. */

import { calendarStripCenterIndex } from "./calendar-strip-geometry.js";

/** Fixed day column width in the week strip (readable chips + horizontal pan). */
export const CALENDAR_WEEK_DAY_COLUMN_WIDTH_PX = 300;

export const CALENDAR_WEEK_STRIP_DAY_COUNT = 7;

export function calendarWeekStripPaneWidthPx(
  dayColumnWidthPx: number = CALENDAR_WEEK_DAY_COLUMN_WIDTH_PX,
): number {
  return dayColumnWidthPx * CALENDAR_WEEK_STRIP_DAY_COUNT;
}

/** 0 = Monday … 6 = Sunday (matches FullCalendar `firstDay: 1`). */
export function calendarWeekStripDayIndexMondayStart(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

/**
 * ScrollLeft that puts `date`'s day column in the center of the viewport,
 * within the center week pane of the infinite strip.
 */
export function calendarWeekStripScrollLeftForDate(options: {
  date: Date;
  viewportWidthPx: number;
  dayColumnWidthPx?: number;
  paneCount?: number;
  centerPaneIndex?: number;
}): number {
  const dayColumnWidthPx =
    options.dayColumnWidthPx ?? CALENDAR_WEEK_DAY_COLUMN_WIDTH_PX;
  const paneCount = options.paneCount ?? CALENDAR_WEEK_STRIP_PANE_COUNT;
  const centerPaneIndex =
    options.centerPaneIndex ?? calendarStripCenterIndex(paneCount);
  const paneWidth = calendarWeekStripPaneWidthPx(dayColumnWidthPx);
  const viewportWidthPx = Math.max(1, options.viewportWidthPx);
  const dayIndex = calendarWeekStripDayIndexMondayStart(options.date);
  const dayCenter =
    paneWidth * centerPaneIndex +
    dayIndex * dayColumnWidthPx +
    dayColumnWidthPx / 2;
  const maxScroll = Math.max(0, paneWidth * paneCount - viewportWidthPx);
  return Math.max(0, Math.min(maxScroll, dayCenter - viewportWidthPx / 2));
}

/** Five panes keep ±2 weeks warm without the cost of many time-grids. */
export const CALENDAR_WEEK_STRIP_PANE_COUNT = 5;

export const CALENDAR_WEEK_STRIP_CENTER_INDEX = calendarStripCenterIndex(
  CALENDAR_WEEK_STRIP_PANE_COUNT,
);

export function formatLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseLocalYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 0, 0, 0, 0);
}

/** Monday 00:00 local for the week containing `date`. */
export function startOfWeekMondayDate(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  return start;
}

export function addDaysDate(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Prev…next Mondays around the anchor (anchor sits at the center pane). */
export function calendarWeekStripDates(
  anchorMonday: Date,
  paneCount: number = CALENDAR_WEEK_STRIP_PANE_COUNT,
): Date[] {
  const monday = startOfWeekMondayDate(anchorMonday);
  const center = calendarStripCenterIndex(paneCount);
  const dates: Date[] = [];
  for (let i = 0; i < paneCount; i += 1) {
    dates.push(addDaysDate(monday, (i - center) * 7));
  }
  return dates;
}

/** @deprecated Prefer calendarStripRecycleShift — kept for existing tests. */
export function calendarWeekStripPaneIndex(
  scrollLeft: number,
  paneWidth: number,
  paneCount: number = CALENDAR_WEEK_STRIP_PANE_COUNT,
): number {
  const width = Math.max(1, paneWidth);
  const raw = Math.round(scrollLeft / width);
  if (raw <= 0) return 0;
  if (raw >= paneCount - 1) return paneCount - 1;
  return raw;
}

/** @deprecated Prefer calendarStripRecycleShift. */
export function calendarWeekStripAnchorShiftWeeks(
  paneIndex: number,
  paneCount: number = CALENDAR_WEEK_STRIP_PANE_COUNT,
): number {
  return paneIndex - calendarStripCenterIndex(paneCount);
}
