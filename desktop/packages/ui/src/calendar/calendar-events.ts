import { formatLocalYmd } from "../tasks/task-due-date.js";
import { getTaskDueDateYmd } from "../tasks/tasks-due-filters.js";
import { resolveTaskStatusColor } from "../tasks/task-status-color.js";
import { migrateLegacyTaskStatus } from "../tasks/task-status.js";
import { deriveMeetingStatusForSchedule, isPastCompletedMeeting } from "../meetings/meeting-status.js";

/** Default block length when a task is dropped on a time slot. */
export const DEFAULT_TIMED_TASK_DURATION_MINUTES = 60;

const TERMINAL_CALENDAR_STATUSES = new Set([
  "completed",
  "canceled",
  "duplicated",
]);

/** Never shown on calendar grids or unscheduled side panels. */
const HIDDEN_CALENDAR_TASK_STATUSES = new Set(["canceled", "duplicated"]);

export function isHiddenCalendarTaskStatus(status: string): boolean {
  return HIDDEN_CALENDAR_TASK_STATUSES.has(migrateLegacyTaskStatus(status));
}

export function isHabitLinkedCalendarTask(task: CalendarTaskLike): boolean {
  return Boolean(task.habitId?.trim());
}

/** Habit day tasks only appear on the grid once given a timed start/end. */
export function isTimedHabitCalendarTask(task: CalendarTaskLike): boolean {
  if (!isHabitLinkedCalendarTask(task)) return false;
  const start = toValidDate(task.dueDate);
  const end = toValidDate(task.dueEndDate);
  return Boolean(start && end && end.getTime() > start.getTime());
}

export type CalendarTaskLike = {
  id: string;
  title: string;
  status: string;
  dueDate: number | Date | null;
  /** End of a timed block; null/absent = all-day due date. */
  dueEndDate?: number | Date | null;
  /** External update flag — green dot on status icons. */
  inboxUpdatedAt?: number | Date | string | null;
  /** Email rows mixed into task lists — never scheduled from the calendar. */
  listKind?: "task" | "email" | "meeting";
  habitId?: string | null;
  /** Habit icon when `habitId` is set (calendar event chrome). */
  habitIcon?: string | null;
  projectName?: string | null;
};

export function shouldIncludeTaskInCalendarUi(task: CalendarTaskLike): boolean {
  if (
    task.listKind === "email" ||
    task.listKind === "meeting" ||
    isHiddenCalendarTaskStatus(task.status)
  ) {
    return false;
  }
  if (isHabitLinkedCalendarTask(task)) {
    return isTimedHabitCalendarTask(task);
  }
  return true;
}

export type TaskCalendarEvent = {
  id: string;
  title: string;
  /** ISO datetime for timed blocks, local `YYYY-MM-DD` for all-day. */
  start: string;
  end?: string;
  allDay: boolean;
  classNames: string[];
  extendedProps:
    | {
        entityType: "task";
        taskId: string;
        status: string;
        projectName?: string | null;
        inboxUpdatedAt?: number | Date | string | null;
        habitId?: string | null;
        habitIcon?: string | null;
      }
    | {
        entityType: "meeting";
        meetingId: string;
        projectName?: string | null;
        status?: string | null;
        endAt?: string;
        finished?: boolean;
      };
  /** Optional — timeline blocks use `.task-calendar-event` CSS instead. */
  backgroundColor?: string;
  borderColor?: string;
};

/** Patch payload for `patchMeeting` after a calendar drop/resize. */
export type MeetingCalendarPatch = {
  startAt: string;
  endAt: string;
  status: string;
};

export type MeetingCalendarLike = {
  id: string;
  title: string;
  startAt: number | Date | string;
  endAt: number | Date | string;
  status?: string | null;
  projectName?: string | null;
};

/** Timed blocks at least this long show project name + extra top padding. */
export const CALENDAR_EVENT_EXPANDED_MIN_DURATION_MS = 45 * 60 * 1000;

export function calendarEventDurationMs(
  start: Date | null,
  end: Date | null,
): number {
  if (!start || !end) return 0;
  return Math.max(0, end.getTime() - start.getTime());
}

export function calendarEventHasExpandedContent(durationMs: number): boolean {
  return durationMs >= CALENDAR_EVENT_EXPANDED_MIN_DURATION_MS;
}

/** Patch payload for `patchTask` after a calendar drop/resize. */
export type TaskCalendarPatch = {
  dueDate: string | null;
  dueEndDate: string | null;
};

function toValidDate(
  value: number | Date | string | null | undefined,
): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isTerminalCalendarTaskStatus(status: string): boolean {
  return TERMINAL_CALENDAR_STATUSES.has(migrateLegacyTaskStatus(status));
}

export function taskCalendarEventClassNames(
  status: string,
  options?: { habit?: boolean },
): string[] {
  const classNames = ["task-calendar-event"];
  if (options?.habit) {
    classNames.push("habit-calendar-event");
  }
  if (isTerminalCalendarTaskStatus(status)) {
    classNames.push("task-calendar-event-done");
  }
  return classNames;
}

/** Status-tinted fill + border for FullCalendar event blocks. */
export function taskCalendarEventColors(status: string): {
  backgroundColor: string;
  borderColor: string;
} {
  const statusKey = migrateLegacyTaskStatus(status);
  const borderColor = resolveTaskStatusColor(statusKey);
  return {
    borderColor,
    backgroundColor: `color-mix(in srgb, ${borderColor} 26%, transparent)`,
  };
}

/** Neutral timeline styling — status icon carries meaning. */
export function taskCalendarEventNeutralColors(): {
  backgroundColor: string;
  borderColor: string;
} {
  return {
    borderColor: "color-mix(in srgb, var(--foreground) 22%, transparent)",
    backgroundColor: "color-mix(in srgb, var(--foreground) 7%, transparent)",
  };
}

/**
 * Map a task to a FullCalendar event input. Tasks without a due date are not
 * calendar events. A task with only `dueDate` is an all-day event on the
 * local day of the due timestamp; with a valid `dueEndDate` after the start
 * it becomes a timed block.
 */
export function taskToCalendarEvent(
  task: CalendarTaskLike,
): TaskCalendarEvent | null {
  const start = toValidDate(task.dueDate);
  if (!start) return null;

  const habitId = task.habitId?.trim() || null;
  const base = {
    id: task.id,
    title: task.title || (habitId ? "Untitled habit" : "Untitled task"),
    classNames: taskCalendarEventClassNames(task.status, {
      habit: Boolean(habitId),
    }),
    extendedProps: {
      entityType: "task" as const,
      taskId: task.id,
      status: task.status,
      projectName: task.projectName?.trim() || null,
      inboxUpdatedAt: task.inboxUpdatedAt ?? null,
      habitId,
      habitIcon: habitId ? (task.habitIcon ?? null) : null,
    },
  };

  const end = toValidDate(task.dueEndDate);
  if (end && end.getTime() > start.getTime()) {
    return {
      ...base,
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: false,
    };
  }

  return {
    ...base,
    start: formatLocalYmd(start),
    allDay: true,
  };
}

export function tasksToCalendarEvents(
  tasks: CalendarTaskLike[],
): TaskCalendarEvent[] {
  const events: TaskCalendarEvent[] = [];
  for (const task of tasks) {
    if (!shouldIncludeTaskInCalendarUi(task)) continue;
    const event = taskToCalendarEvent(task);
    if (event) events.push(event);
  }
  return events;
}

/** Calendar events for tasks due on a single local journal day. */
export function tasksToCalendarEventsForDate(
  tasks: CalendarTaskLike[],
  dateSlug: string,
  calendarTimeZone?: string,
): TaskCalendarEvent[] {
  return tasksToCalendarEvents(
    tasks.filter(
      (task) =>
        shouldIncludeTaskInCalendarUi(task) &&
        getTaskDueDateYmd(task.dueDate, calendarTimeZone) === dateSlug,
    ),
  );
}

export type CalendarEventChange = {
  start: Date | null;
  end: Date | null;
  allDay: boolean;
};

/**
 * Convert a FullCalendar drop/resize/receive result into a task patch.
 * All-day placement clears the end time; timed placement without an explicit
 * end gets the default block duration.
 */
export function calendarChangeToTaskPatch(
  change: CalendarEventChange,
): TaskCalendarPatch | null {
  const start = toValidDate(change.start);
  if (!start) return null;

  if (change.allDay) {
    return { dueDate: start.toISOString(), dueEndDate: null };
  }

  const end = toValidDate(change.end);
  const effectiveEnd =
    end && end.getTime() > start.getTime()
      ? end
      : new Date(
          start.getTime() + DEFAULT_TIMED_TASK_DURATION_MINUTES * 60_000,
        );
  return {
    dueDate: start.toISOString(),
    dueEndDate: effectiveEnd.toISOString(),
  };
}

/** Open tasks without a due date — candidates for dragging onto the calendar. */
export function unscheduledCalendarTasks<T extends CalendarTaskLike>(
  tasks: T[],
): T[] {
  return tasks.filter(
    (task) =>
      shouldIncludeTaskInCalendarUi(task) &&
      toValidDate(task.dueDate) == null &&
      !isTerminalCalendarTaskStatus(task.status),
  );
}

export function meetingCalendarEventClassNames(finished = false): string[] {
  const classNames = ["task-calendar-event", "meeting-calendar-event"];
  if (finished) {
    classNames.push("meeting-calendar-event--finished");
  }
  return classNames;
}

export function meetingToCalendarEvent(
  meeting: MeetingCalendarLike,
  now = new Date(),
): TaskCalendarEvent | null {
  const start = toValidDate(meeting.startAt);
  const end = toValidDate(meeting.endAt);
  if (!start || !end || end.getTime() <= start.getTime()) return null;
  const finished = isPastCompletedMeeting(meeting, now);
  return {
    id: `meeting:${meeting.id}`,
    title: meeting.title || "Untitled meeting",
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: false,
    classNames: meetingCalendarEventClassNames(finished),
    extendedProps: {
      entityType: "meeting",
      meetingId: meeting.id,
      projectName: meeting.projectName?.trim() || null,
      status: meeting.status ?? null,
      endAt: end.toISOString(),
      finished,
    },
  };
}

export function meetingsToCalendarEvents(
  meetings: MeetingCalendarLike[],
  now = new Date(),
): TaskCalendarEvent[] {
  const events: TaskCalendarEvent[] = [];
  for (const meeting of meetings) {
    const event = meetingToCalendarEvent(meeting, now);
    if (event) events.push(event);
  }
  return events;
}

/** Calendar events for meetings that start on a single local journal day. */
export function meetingsToCalendarEventsForDate(
  meetings: MeetingCalendarLike[],
  dateSlug: string,
  calendarTimeZone?: string,
  now = new Date(),
): TaskCalendarEvent[] {
  return meetingsToCalendarEvents(
    meetings.filter(
      (meeting) =>
        getTaskDueDateYmd(meeting.startAt, calendarTimeZone) === dateSlug,
    ),
    now,
  );
}

export function calendarEntityFromEvent(event: {
  id: string;
  extendedProps: Record<string, unknown>;
}): { entityType: "task" | "meeting"; entityId: string } {
  const props = event.extendedProps;
  if (props.entityType === "meeting") {
    const meetingId = props.meetingId;
    if (typeof meetingId === "string" && meetingId) {
      return { entityType: "meeting", entityId: meetingId };
    }
  }
  const taskId = props.taskId;
  return {
    entityType: "task",
    entityId: typeof taskId === "string" && taskId ? taskId : event.id,
  };
}

export function calendarChangeToMeetingPatch(
  change: CalendarEventChange,
  now = new Date(),
): MeetingCalendarPatch | null {
  const start = toValidDate(change.start);
  if (!start) return null;
  const end = toValidDate(change.end);
  const effectiveEnd =
    end && end.getTime() > start.getTime()
      ? end
      : new Date(
          start.getTime() + DEFAULT_TIMED_TASK_DURATION_MINUTES * 60_000,
        );
  return {
    startAt: start.toISOString(),
    endAt: effectiveEnd.toISOString(),
    status: deriveMeetingStatusForSchedule(start, effectiveEnd, now),
  };
}

/**
 * Drag-select on the time grid → meeting start/end for create.
 * All-day selections are ignored (month / list); week/day use timed ranges.
 */
export function calendarSelectionToMeetingRange(
  change: CalendarEventChange,
): { startAt: string; endAt: string } | null {
  if (change.allDay) return null;
  const start = toValidDate(change.start);
  if (!start) return null;
  const end = toValidDate(change.end);
  const effectiveEnd =
    end && end.getTime() > start.getTime()
      ? end
      : new Date(
          start.getTime() + DEFAULT_TIMED_TASK_DURATION_MINUTES * 60_000,
        );
  return {
    startAt: start.toISOString(),
    endAt: effectiveEnd.toISOString(),
  };
}

/** Merge task and meeting events for a single FullCalendar feed. */
export function mergeCalendarGridEvents(
  tasks: CalendarTaskLike[],
  meetings: MeetingCalendarLike[],
  now = new Date(),
): TaskCalendarEvent[] {
  return [
    ...tasksToCalendarEvents(tasks),
    ...meetingsToCalendarEvents(meetings, now),
  ];
}

/** Human-readable schedule line for calendar task popovers. */
export function formatCalendarTaskScheduleLabel(
  dueDate: number | Date | string | null | undefined,
  dueEndDate?: number | Date | string | null | undefined,
): string | null {
  const start = toValidDate(dueDate);
  if (!start) return null;

  const end = toValidDate(dueEndDate);
  const timed = end != null && end.getTime() > start.getTime();

  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: timed ? "short" : "long",
    month: "short",
    day: "numeric",
    year:
      start.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  }).format(start);

  if (!timed) {
    return dateLabel;
  }

  const timeFmt = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateLabel} · ${timeFmt.format(start)} – ${timeFmt.format(end)}`;
}
