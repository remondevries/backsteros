import { formatLocalYmd, getTaskDueDateYmd } from "../task-due-date";
import { migrateLegacyTaskStatus, TASK_STATUS_COLORS } from "../task-status";
import {
  deriveMeetingStatusForSchedule,
  isPastCompletedMeeting,
} from "../meeting-status";

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
  dueDate: number | Date | string | null;
  dueEndDate?: number | Date | string | null;
  inboxUpdatedAt?: number | Date | string | null;
  listKind?: "task" | "email" | "meeting";
  habitId?: string | null;
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
  start: string;
  end?: string;
  allDay: boolean;
  classNames: string[];
  backgroundColor?: string;
  borderColor?: string;
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
      }
    | {
        entityType: "birthday";
        contactId: string;
        contactName: string;
      };
};

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

/** Status-tinted fill + border — for callers that want accented chips. */
export function taskCalendarEventColors(status: string): {
  backgroundColor: string;
  borderColor: string;
} {
  const statusKey = migrateLegacyTaskStatus(status);
  const borderColor = TASK_STATUS_COLORS[statusKey];
  return {
    borderColor,
    backgroundColor: `color-mix(in srgb, ${borderColor} 26%, transparent)`,
  };
}

/** Neutral chip styling — status color lives on the icon/dot (matches desktop). */
export function taskCalendarEventNeutralColors(): {
  backgroundColor: string;
  borderColor: string;
} {
  return {
    borderColor: "color-mix(in srgb, var(--foreground) 22%, transparent)",
    backgroundColor: "color-mix(in srgb, var(--foreground) 7%, transparent)",
  };
}

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

export function mergeCalendarGridEvents(
  tasks: CalendarTaskLike[],
  meetings: MeetingCalendarLike[],
  now = new Date(),
  birthdays: BirthdayCalendarLike[] = [],
  yearSpan?: { fromYear: number; toYear: number },
): TaskCalendarEvent[] {
  const year = now.getFullYear();
  const fromYear = yearSpan?.fromYear ?? year - 1;
  const toYear = yearSpan?.toYear ?? year + 1;
  return [
    ...tasksToCalendarEvents(tasks),
    ...meetingsToCalendarEvents(meetings, now),
    ...birthdaysToCalendarEvents(birthdays, fromYear, toYear),
  ];
}

export type BirthdayCalendarLike = {
  id: string;
  name: string;
  /** YYYY-MM-DD */
  birthday: string | null | undefined;
};

/** Normalize contact.birthday to `YYYY-MM-DD` (PowerSync may send ISO datetimes). */
export function normalizeBirthdayYmd(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const isoDay = raw.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (isoDay?.[1]) return isoDay[1];
  return null;
}

/** Virtual yearly all-day birthday markers derived from contact.birthday. */
export function birthdaysToCalendarEvents(
  contacts: BirthdayCalendarLike[],
  fromYear: number,
  toYear: number,
): TaskCalendarEvent[] {
  const events: TaskCalendarEvent[] = [];
  for (const contact of contacts) {
    const ymd = normalizeBirthdayYmd(contact.birthday);
    if (!ymd) continue;
    const monthDay = ymd.slice(5);
    for (let year = fromYear; year <= toYear; year += 1) {
      const start = `${year}-${monthDay}`;
      // Skip impossible calendar days (e.g. Feb 29 in non-leap years).
      if (Number.isNaN(Date.parse(`${start}T12:00:00`))) continue;
      events.push({
        id: `birthday:${contact.id}:${year}`,
        title: `${contact.name.trim() || "Contact"}'s birthday`,
        start,
        allDay: true,
        classNames: ["task-calendar-event", "birthday-calendar-event"],
        extendedProps: {
          entityType: "birthday",
          contactId: contact.id,
          contactName: contact.name,
        },
      });
    }
  }
  return events;
}

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
