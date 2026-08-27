export const calendarViewModes = ["month", "day"] as const;

export type CalendarViewMode = (typeof calendarViewModes)[number];

export const DEFAULT_CALENDAR_VIEW_MODE: CalendarViewMode = "day";

export const CALENDAR_VIEW_MODE_STORAGE_KEY = "circle:calendar-view-mode";

export const CALENDAR_VIEW_MODE_OPTIONS: ReadonlyArray<{
  value: CalendarViewMode;
  label: string;
}> = [
  { value: "month", label: "Month" },
  { value: "day", label: "Day" },
];

export function isCalendarViewMode(value: string): value is CalendarViewMode {
  return (calendarViewModes as readonly string[]).includes(value);
}

/** Legacy persisted value from when week view existed on iOS. */
export function normalizeCalendarViewMode(
  value: string | null | undefined,
): CalendarViewMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "week") return "day";
  if (normalized && isCalendarViewMode(normalized)) {
    return normalized;
  }
  return DEFAULT_CALENDAR_VIEW_MODE;
}

export function parseCalendarViewMode(
  value: string | null | undefined,
): CalendarViewMode {
  return normalizeCalendarViewMode(value);
}

export function calendarViewModeToFcView(mode: CalendarViewMode): string {
  if (mode === "month") return "dayGridMonth";
  return "timeGridDay";
}
