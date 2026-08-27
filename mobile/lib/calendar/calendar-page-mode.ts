export const calendarPageModes = [
  "calendar",
  "timetracking",
  "availability",
] as const;

export type CalendarPageMode = (typeof calendarPageModes)[number];

export const DEFAULT_CALENDAR_PAGE_MODE: CalendarPageMode = "calendar";

export const CALENDAR_PAGE_MODE_STORAGE_KEY = "circle:calendar-page-mode";

export const CALENDAR_PAGE_MODE_OPTIONS: ReadonlyArray<{
  value: CalendarPageMode;
  label: string;
}> = [
  { value: "calendar", label: "Calendar" },
  { value: "timetracking", label: "Timetracking" },
  { value: "availability", label: "Availability" },
];

export function isCalendarPageMode(value: string): value is CalendarPageMode {
  return (calendarPageModes as readonly string[]).includes(value);
}

export function parseCalendarPageMode(
  value: string | null | undefined,
): CalendarPageMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized && isCalendarPageMode(normalized)) {
    return normalized;
  }
  return DEFAULT_CALENDAR_PAGE_MODE;
}
