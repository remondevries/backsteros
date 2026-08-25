export type CalendarDateNavigationAction = "prev" | "next";

export function resolveCalendarDateNavigationAction(
  key: string,
  modifiers: {
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
  } = {},
): CalendarDateNavigationAction | null {
  if (modifiers.metaKey || modifiers.ctrlKey || modifiers.altKey || modifiers.shiftKey) {
    return null;
  }
  if (key === "ArrowLeft") return "prev";
  if (key === "ArrowRight") return "next";
  return null;
}

export function isCalendarDateNavigationPopoverOpen(): boolean {
  if (typeof document === "undefined") return false;
  return (
    document.querySelector("[data-calendar-task-event-popover]") !== null ||
    document.querySelector("[data-calendar-meeting-event-popover]") !== null ||
    document.querySelector("[data-calendar-availability-day-popover]") !== null ||
    document.querySelector("[data-calendar-task-overlay]") !== null ||
    document.querySelector("[data-calendar-meeting-overlay]") !== null
  );
}
