export const calendarViewModes = ["month", "week", "day", "list"] as const;

export type CalendarViewMode = (typeof calendarViewModes)[number];

export const CALENDAR_VIEW_MODE_OPTIONS: ReadonlyArray<{
  value: CalendarViewMode;
  label: string;
}> = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
  { value: "list", label: "List" },
];

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
