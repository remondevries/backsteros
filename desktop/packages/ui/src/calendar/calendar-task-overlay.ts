import {
  buildCalendarViewHref,
  type CalendarViewMode,
} from "./calendar-view-modes.js";

/** Search param key for the calendar task detail overlay. */
export const CALENDAR_TASK_OVERLAY_PARAM = "task";

/** Search param: task overlay opens as full page vs narrow right panel. */
export const CALENDAR_TASK_OVERLAY_LAYOUT_PARAM = "taskLayout";

export type CalendarTaskOverlayLayout = "page" | "panel";

export function parseCalendarTaskOverlayId(search: string): string | null {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const value = params.get(CALENDAR_TASK_OVERLAY_PARAM)?.trim();
  return value || null;
}

export function parseCalendarTaskOverlayLayout(
  search: string,
): CalendarTaskOverlayLayout {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  return params.get(CALENDAR_TASK_OVERLAY_LAYOUT_PARAM) === "page"
    ? "page"
    : "panel";
}

export function getCalendarTaskOverlayHref(
  taskId: string,
  viewMode?: CalendarViewMode,
  layout?: CalendarTaskOverlayLayout,
): string {
  return buildCalendarViewHref(viewMode, {
    [CALENDAR_TASK_OVERLAY_PARAM]: taskId,
    ...(layout === "page"
      ? { [CALENDAR_TASK_OVERLAY_LAYOUT_PARAM]: "page" }
      : {}),
  });
}
