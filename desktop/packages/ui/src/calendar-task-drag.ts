import {
  DEFAULT_TIMED_TASK_DURATION_MINUTES,
  meetingCalendarEventClassNames,
  taskCalendarEventClassNames,
} from "./calendar-events.js";
import { migrateLegacyTaskStatus } from "./task-status.js";

const MIN_DRAG_DURATION_MINUTES = 15;

export type CalendarTaskDragEventData = {
  id: string;
  title: string;
  duration: string;
  classNames: string[];
  extendedProps: { entityType: "task"; taskId: string; status: string };
};

export type CalendarMeetingDragEventData = {
  id: string;
  title: string;
  duration: string;
  classNames: string[];
  extendedProps: { entityType: "meeting"; meetingId: string };
};

/** Selectors for FullCalendar external drag items in calendar side panels. */
export const CALENDAR_EXTERNAL_DRAG_ITEM_SELECTOR =
  "[data-calendar-task-id], [data-calendar-meeting-id]";

/** FullCalendar external-drag payload for task rows / side-panel items. */
export function calendarTaskDragEventData(element: HTMLElement): CalendarTaskDragEventData {
  const taskId = element.getAttribute("data-calendar-task-id") ?? "";
  const title = element.getAttribute("data-calendar-task-title") ?? "Task";
  const status = migrateLegacyTaskStatus(
    element.getAttribute("data-calendar-task-status") ?? "ready_to_start",
  );
  return {
    id: taskId,
    title,
    duration: calendarTaskDragDurationFromElement(element),
    classNames: taskCalendarEventClassNames(status),
    extendedProps: { entityType: "task", taskId, status },
  };
}

/** FullCalendar external-drag payload for meeting side-panel rows. */
export function calendarMeetingDragEventData(
  element: HTMLElement,
): CalendarMeetingDragEventData {
  const meetingId = element.getAttribute("data-calendar-meeting-id") ?? "";
  const title = element.getAttribute("data-calendar-meeting-title") ?? "Meeting";
  return {
    id: `meeting:${meetingId}`,
    title,
    duration: calendarMeetingDragDurationFromElement(element),
    classNames: meetingCalendarEventClassNames(),
    extendedProps: { entityType: "meeting", meetingId },
  };
}

export function calendarExternalDragEventData(
  element: HTMLElement,
): CalendarTaskDragEventData | CalendarMeetingDragEventData {
  if (element.hasAttribute("data-calendar-meeting-id")) {
    return calendarMeetingDragEventData(element);
  }
  return calendarTaskDragEventData(element);
}

export function epochMsAttribute(
  value: number | Date | string | null | undefined,
): string | undefined {
  if (value == null) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return String(date.getTime());
}

export function taskDueEpochAttribute(
  value: number | Date | null | undefined,
): string | undefined {
  return epochMsAttribute(value);
}

export function meetingEpochAttribute(
  value: number | Date | string | null | undefined,
): string | undefined {
  return epochMsAttribute(value);
}

export function calendarTaskDragDurationFromElement(element: HTMLElement): string {
  const dueMs = Number(element.getAttribute("data-calendar-task-due-ms"));
  const endMs = Number(element.getAttribute("data-calendar-task-due-end-ms"));
  if (
    Number.isFinite(dueMs) &&
    Number.isFinite(endMs) &&
    endMs > dueMs
  ) {
    const minutes = Math.round((endMs - dueMs) / 60_000);
    if (minutes >= MIN_DRAG_DURATION_MINUTES) {
      return minutesToFullCalendarDuration(minutes);
    }
  }
  return minutesToFullCalendarDuration(DEFAULT_TIMED_TASK_DURATION_MINUTES);
}

export function calendarMeetingDragDurationFromElement(
  element: HTMLElement,
): string {
  const startMs = Number(element.getAttribute("data-calendar-meeting-start-ms"));
  const endMs = Number(element.getAttribute("data-calendar-meeting-end-ms"));
  if (
    Number.isFinite(startMs) &&
    Number.isFinite(endMs) &&
    endMs > startMs
  ) {
    const minutes = Math.round((endMs - startMs) / 60_000);
    if (minutes >= MIN_DRAG_DURATION_MINUTES) {
      return minutesToFullCalendarDuration(minutes);
    }
  }
  return minutesToFullCalendarDuration(DEFAULT_TIMED_TASK_DURATION_MINUTES);
}

export function minutesToFullCalendarDuration(totalMinutes: number): string {
  const clamped = Math.max(MIN_DRAG_DURATION_MINUTES, totalMinutes);
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

export function fullCalendarDurationToMinutes(duration: string): number {
  const match = /^(\d+):(\d{2})$/.exec(duration.trim());
  if (!match) return DEFAULT_TIMED_TASK_DURATION_MINUTES;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Min-height for the external drag mirror (30-min slot ≈ 2.5rem in timeline). */
export function calendarExternalDragMirrorMinHeight(
  element: HTMLElement,
  slotMinutes = 30,
  slotRem = 2.5,
): string {
  const minutes = element.hasAttribute("data-calendar-meeting-id")
    ? fullCalendarDurationToMinutes(
        calendarMeetingDragDurationFromElement(element),
      )
    : fullCalendarDurationToMinutes(
        calendarTaskDragDurationFromElement(element),
      );
  const rem = (minutes / slotMinutes) * slotRem;
  return `${Math.max(0.75, rem)}rem`;
}

/** Min-height for the external drag mirror (30-min slot ≈ 2.5rem in timeline). */
export function calendarTaskDragMirrorMinHeight(
  element: HTMLElement,
  slotMinutes = 30,
  slotRem = 2.5,
): string {
  return calendarExternalDragMirrorMinHeight(element, slotMinutes, slotRem);
}

/** Cursor offset from mirror top-left (compact card vs full-width row). */
export const CALENDAR_EXTERNAL_DRAG_MIRROR_CURSOR_OFFSET = { x: 12, y: 10 };

/** Morph a cloned row mirror into a timeline event card while dragging. */
export function applyCalendarExternalDragMirrorAppearance(
  mirrorEl: HTMLElement,
  sourceEl: HTMLElement,
): void {
  mirrorEl.classList.add("task-calendar-event", "calendar-external-drag-mirror");
  if (sourceEl.hasAttribute("data-calendar-meeting-id")) {
    mirrorEl.classList.add("meeting-calendar-event");
  }
  mirrorEl.style.minHeight = calendarExternalDragMirrorMinHeight(sourceEl);
  mirrorEl.style.width = "11rem";
  mirrorEl.style.maxWidth = "14rem";
}

/** Morph a cloned task row mirror into a timeline event card while dragging. */
export function applyTimelineDragMirrorAppearance(
  mirrorEl: HTMLElement,
  sourceEl: HTMLElement,
): void {
  applyCalendarExternalDragMirrorAppearance(mirrorEl, sourceEl);
}

/** Keep the compact mirror under the pointer (FC anchors to full row width). */
export function anchorTimelineDragMirrorToCursor(
  mirrorEl: HTMLElement,
  pageX: number,
  pageY: number,
): void {
  mirrorEl.style.left = `${pageX - window.scrollX - CALENDAR_EXTERNAL_DRAG_MIRROR_CURSOR_OFFSET.x}px`;
  mirrorEl.style.top = `${pageY - window.scrollY - CALENDAR_EXTERNAL_DRAG_MIRROR_CURSOR_OFFSET.y}px`;
}
