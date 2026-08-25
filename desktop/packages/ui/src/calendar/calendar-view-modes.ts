export const calendarViewModes = ["month", "week", "day", "list"] as const;

export type CalendarViewMode = (typeof calendarViewModes)[number];

export const CALENDAR_VIEW_MODE_PARAM = "view";

export const DEFAULT_CALENDAR_VIEW_MODE: CalendarViewMode = "week";

/** FullCalendar chrome lives in the app breadcrumb row — hide the built-in toolbar. */
export const CALENDAR_HEADER_TOOLBAR = false as const;

export const CALENDAR_VIEW_MODE_OPTIONS: ReadonlyArray<{
  value: CalendarViewMode;
  label: string;
}> = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
  { value: "list", label: "List" },
];

export const calendarAvailabilityViewModes = ["month", "week"] as const;

export type CalendarAvailabilityViewMode =
  (typeof calendarAvailabilityViewModes)[number];

export const CALENDAR_AVAILABILITY_VIEW_MODE_OPTIONS: ReadonlyArray<{
  value: CalendarAvailabilityViewMode;
  label: string;
}> = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
];

export function normalizeCalendarAvailabilityViewMode(
  mode: CalendarViewMode,
): CalendarAvailabilityViewMode {
  return mode === "month" ? "month" : "week";
}

const CALENDAR_VIEW_MODE_LABELS = Object.fromEntries(
  CALENDAR_VIEW_MODE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<CalendarViewMode, string>;

export function isCalendarViewMode(value: string): value is CalendarViewMode {
  return (calendarViewModes as readonly string[]).includes(value);
}

export function parseCalendarViewModeParam(
  value: string | null | undefined,
): CalendarViewMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized && isCalendarViewMode(normalized)) {
    return normalized;
  }
  return DEFAULT_CALENDAR_VIEW_MODE;
}

export function readCalendarViewModeFromSearch(search: string): CalendarViewMode {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  return parseCalendarViewModeParam(params.get(CALENDAR_VIEW_MODE_PARAM));
}

export function getCalendarViewModeLabel(mode: CalendarViewMode): string {
  return CALENDAR_VIEW_MODE_LABELS[mode];
}

export function buildCalendarViewHref(
  viewMode: CalendarViewMode = DEFAULT_CALENDAR_VIEW_MODE,
  extraParams: Record<string, string | undefined> = {},
): string {
  const params = new URLSearchParams();
  if (viewMode !== DEFAULT_CALENDAR_VIEW_MODE) {
    params.set(CALENDAR_VIEW_MODE_PARAM, viewMode);
  }
  for (const [key, value] of Object.entries(extraParams)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/calendar?${query}` : "/calendar";
}

export function withCalendarViewSearch(
  pathname: string,
  search: string,
  viewMode?: CalendarViewMode,
): string {
  const mode = viewMode ?? readCalendarViewModeFromSearch(search);
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  if (mode === DEFAULT_CALENDAR_VIEW_MODE) {
    params.delete(CALENDAR_VIEW_MODE_PARAM);
  } else {
    params.set(CALENDAR_VIEW_MODE_PARAM, mode);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

const FC_VIEW_BY_MODE: Record<CalendarViewMode, string> = {
  month: "dayGridMonth",
  week: "timeGridWeek",
  day: "timeGridDay",
  list: "listWeek",
};

export function calendarViewModeToFcView(mode: CalendarViewMode): string {
  return FC_VIEW_BY_MODE[mode];
}

export function fcViewTypeToCalendarViewMode(
  viewType: string,
): CalendarViewMode {
  switch (viewType) {
    case "dayGridMonth":
      return "month";
    case "timeGridWeek":
      return "week";
    case "timeGridDay":
      return "day";
    case "listWeek":
      return "list";
    default:
      return "week";
  }
}
