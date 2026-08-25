import {
  CALENDAR_VIEW_MODE_PARAM,
  DEFAULT_CALENDAR_VIEW_MODE,
  type CalendarViewMode,
} from "./calendar-view-modes.js";

export const calendarPageModes = [
  "calendar",
  "timetracking",
  "availability",
] as const;

export type CalendarPageMode = (typeof calendarPageModes)[number];

export const CALENDAR_PAGE_MODE_PARAM = "mode";

export const DEFAULT_CALENDAR_PAGE_MODE: CalendarPageMode = "calendar";

export const CALENDAR_PAGE_MODE_OPTIONS: ReadonlyArray<{
  value: CalendarPageMode;
  label: string;
  /** Digit shortcut shown in the segmented toggle tooltip. */
  shortcut?: string;
}> = [
  { value: "calendar", label: "Calendar", shortcut: "1" },
  { value: "timetracking", label: "Timetracking", shortcut: "2" },
  { value: "availability", label: "Availability", shortcut: "3" },
];

export function isCalendarPageMode(value: string): value is CalendarPageMode {
  return (calendarPageModes as readonly string[]).includes(value);
}

/**
 * `1` → calendar, `2` → timetracking, `3` → availability.
 */
export function resolveCalendarPageModeFromShortcutKey(
  key: string,
  modifiers: {
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
  } = {},
  allowedModes: readonly CalendarPageMode[] = calendarPageModes,
): CalendarPageMode | null {
  if (
    modifiers.metaKey ||
    modifiers.ctrlKey ||
    modifiers.altKey ||
    modifiers.shiftKey
  ) {
    return null;
  }
  const index = Number.parseInt(key, 10);
  if (!Number.isInteger(index) || index < 1) return null;
  const mode = calendarPageModes[index - 1];
  if (!mode || !allowedModes.includes(mode)) return null;
  return mode;
}

export function parseCalendarPageModeParam(
  value: string | null | undefined,
): CalendarPageMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized && isCalendarPageMode(normalized)) {
    return normalized;
  }
  return DEFAULT_CALENDAR_PAGE_MODE;
}

export function readCalendarPageModeFromSearch(search: string): CalendarPageMode {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  return parseCalendarPageModeParam(params.get(CALENDAR_PAGE_MODE_PARAM));
}

export function buildCalendarPageHref(
  options: {
    viewMode?: CalendarViewMode;
    pageMode?: CalendarPageMode;
    extraParams?: Record<string, string | undefined>;
  } = {},
): string {
  const params = new URLSearchParams();
  const viewMode = options.viewMode ?? DEFAULT_CALENDAR_VIEW_MODE;
  const pageMode = options.pageMode ?? DEFAULT_CALENDAR_PAGE_MODE;
  if (viewMode !== DEFAULT_CALENDAR_VIEW_MODE) {
    params.set(CALENDAR_VIEW_MODE_PARAM, viewMode);
  }
  if (pageMode !== DEFAULT_CALENDAR_PAGE_MODE) {
    params.set(CALENDAR_PAGE_MODE_PARAM, pageMode);
  }
  for (const [key, value] of Object.entries(options.extraParams ?? {})) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/calendar?${query}` : "/calendar";
}

export function withCalendarPageSearch(
  pathname: string,
  search: string,
  options: {
    viewMode?: CalendarViewMode;
    pageMode?: CalendarPageMode;
  } = {},
): string {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const viewMode =
    options.viewMode ??
    (params.get(CALENDAR_VIEW_MODE_PARAM) as CalendarViewMode | null) ??
    DEFAULT_CALENDAR_VIEW_MODE;
  const pageMode =
    options.pageMode ?? readCalendarPageModeFromSearch(search);

  if (viewMode === DEFAULT_CALENDAR_VIEW_MODE) {
    params.delete(CALENDAR_VIEW_MODE_PARAM);
  } else {
    params.set(CALENDAR_VIEW_MODE_PARAM, viewMode);
  }
  if (pageMode === DEFAULT_CALENDAR_PAGE_MODE) {
    params.delete(CALENDAR_PAGE_MODE_PARAM);
  } else {
    params.set(CALENDAR_PAGE_MODE_PARAM, pageMode);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
