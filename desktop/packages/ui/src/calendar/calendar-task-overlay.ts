import {
  buildCalendarViewHref,
  type CalendarViewMode,
} from "./calendar-view-modes.js";

/** Search param key for the calendar task detail overlay. */
export const CALENDAR_TASK_OVERLAY_PARAM = "task";

export function parseCalendarTaskOverlayId(search: string): string | null {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const value = params.get(CALENDAR_TASK_OVERLAY_PARAM)?.trim();
  return value || null;
}

export function getCalendarTaskOverlayHref(
  taskId: string,
  viewMode?: CalendarViewMode,
): string {
  return buildCalendarViewHref(viewMode, {
    [CALENDAR_TASK_OVERLAY_PARAM]: taskId,
  });
}
