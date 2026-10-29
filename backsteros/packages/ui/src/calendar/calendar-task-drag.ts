import {
  DEFAULT_TIMED_TASK_DURATION_MINUTES,
  meetingCalendarEventClassNames,
  taskCalendarEventClassNames,
} from "./calendar-events.js";
import { migrateLegacyTaskStatus } from "../tasks/task-status.js";

const MIN_DRAG_DURATION_MINUTES = 15;

export type CalendarTaskDragEventData = {
  id: string;
  title: string;
  duration: string;
  classNames: string[];
  backgroundColor?: string;
  borderColor?: string;
  displayEventEnd?: boolean;
  /**
   * Social pending chips schedule via pointer hit-testing (month-strip CSS
   * breaks FC’s own external-drop hits). Keep create false to avoid doubles.
   */
  create?: boolean;
  extendedProps: {
    entityType: "task";
    taskId: string;
    status: string;
    socialPlatform?: string | null;
    socialImageOnly?: boolean;
    socialMediaPreviewUrl?: string | null;
    socialMediaKind?: "image" | "video" | null;
    socialHashtags?: readonly string[] | null;
  };
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

function readSocialHashtagsAttribute(element: HTMLElement): string[] | null {
  const raw = element.getAttribute("data-social-hashtags");
  if (!raw?.trim()) return null;
  const tags = raw
    .split(/\s+/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.startsWith("#"));
  return tags.length > 0 ? tags : null;
}

/** FullCalendar external-drag payload for task rows / side-panel items. */
export function calendarTaskDragEventData(element: HTMLElement): CalendarTaskDragEventData {
  const taskId = element.getAttribute("data-calendar-task-id") ?? "";
  const title = element.getAttribute("data-calendar-task-title") ?? "Task";
  const status = migrateLegacyTaskStatus(
    element.getAttribute("data-calendar-task-status") ?? "ready_to_start",
  );
  const socialPlatform = element.getAttribute("data-social-platform")?.trim() || null;
  if (socialPlatform) {
    const backgroundColor =
      element.getAttribute("data-social-event-bg")?.trim() || undefined;
    const borderColor =
      element.getAttribute("data-social-event-border")?.trim() || backgroundColor;
    return {
      id: taskId,
      title,
      duration: calendarTaskDragDurationFromElement(element),
      classNames: [
        "task-calendar-event",
        "social-planned-calendar-event",
        `social-planned-calendar-event--${socialPlatform}`,
      ],
      backgroundColor,
      borderColor,
      displayEventEnd: false,
      create: false,
      extendedProps: {
        entityType: "task",
        taskId,
        status,
        socialPlatform,
        socialImageOnly: element.getAttribute("data-social-image-only") === "true",
        socialMediaPreviewUrl:
          element.getAttribute("data-social-media-preview-url")?.trim() || null,
        socialMediaKind: (() => {
          const kind = element
            .getAttribute("data-social-media-kind")
            ?.trim()
            .toLowerCase();
          return kind === "video" || kind === "image" ? kind : null;
        })(),
        socialHashtags: readSocialHashtagsAttribute(element),
      },
    };
  }
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
  const explicitMinutes = Number(
    element.getAttribute("data-calendar-drag-duration-minutes"),
  );
  if (Number.isFinite(explicitMinutes) && explicitMinutes >= MIN_DRAG_DURATION_MINUTES) {
    return minutesToFullCalendarDuration(explicitMinutes);
  }
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
  if (sourceEl.hasAttribute("data-social-platform")) {
    mirrorEl.classList.add("social-planned-calendar-event");
    const platform = sourceEl.getAttribute("data-social-platform")?.trim();
    if (platform) {
      mirrorEl.classList.add(`social-planned-calendar-event--${platform}`);
    }
    const bg = sourceEl.getAttribute("data-social-event-bg");
    if (bg) {
      mirrorEl.style.backgroundColor = bg;
      mirrorEl.style.borderColor =
        sourceEl.getAttribute("data-social-event-border") ?? bg;
    }
  }
  mirrorEl.style.minHeight = calendarExternalDragMirrorMinHeight(sourceEl);
  mirrorEl.style.width = "11rem";
  mirrorEl.style.maxWidth = "14rem";
  mirrorEl.style.cursor = "grabbing";
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

export type CalendarPointerDropRange = {
  start: Date;
  end: Date;
  /** Local calendar day under the pointer (`YYYY-MM-DD`). */
  dateYmd: string;
  /**
   * Month / daygrid drop — no timed slot. Callers should ask for a publish
   * time instead of trusting the provisional `start` hour.
   */
  allDay: boolean;
};

/**
 * Resolve a calendar drop from the pointer — used when FC external-drop hits
 * fail (e.g. month-strip day cells reflowed with custom CSS).
 */
export function resolveCalendarDropAtPoint(
  clientX: number,
  clientY: number,
  {
    allDayHour = 9,
    durationMinutes = DEFAULT_TIMED_TASK_DURATION_MINUTES,
  }: {
    allDayHour?: number;
    durationMinutes?: number;
  } = {},
): CalendarPointerDropRange | null {
  if (typeof document === "undefined") return null;
  const stack = document.elementsFromPoint(clientX, clientY);

  let dateYmd: string | null = null;
  let timeHms: string | null = null;
  let fromDayGrid = false;

  for (const node of stack) {
    if (!(node instanceof Element)) continue;
    if (!node.closest(".calendar-view, .fc")) continue;

    if (!dateYmd) {
      const dated = node.closest<HTMLElement>("[data-date]");
      const raw = dated?.getAttribute("data-date")?.trim() ?? "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        dateYmd = raw;
        fromDayGrid = Boolean(dated?.closest(".fc-daygrid"));
      }
    }

    if (!timeHms) {
      const slotted = node.closest<HTMLElement>(
        ".fc-timegrid-slot[data-time]",
      );
      const raw = slotted?.getAttribute("data-time")?.trim() ?? "";
      if (/^\d{2}:\d{2}/.test(raw)) {
        timeHms = raw;
      }
    }

    if (dateYmd && (timeHms || fromDayGrid)) break;
  }

  if (!dateYmd) return null;

  const [year, month, day] = dateYmd.split("-").map(Number);
  const start = new Date(year!, month! - 1, day!, 0, 0, 0, 0);
  const allDay = fromDayGrid || !timeHms;

  if (!allDay && timeHms) {
    const [hours, minutes] = timeHms.split(":").map(Number);
    start.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  } else {
    start.setHours(allDayHour, 0, 0, 0);
  }

  const durationMs =
    Math.max(MIN_DRAG_DURATION_MINUTES, durationMinutes) * 60_000;
  return {
    start,
    end: new Date(start.getTime() + durationMs),
    dateYmd,
    allDay,
  };
}
