import { formatLocalYmd } from "../tasks/task-due-date.js";
import { getTaskDueDateYmd } from "../tasks/tasks-due-filters.js";
import { resolveTaskStatusColor } from "../tasks/task-status-color.js";
import { migrateLegacyTaskStatus } from "../tasks/task-status.js";
import { deriveMeetingStatusForSchedule, isPastCompletedMeeting } from "../meetings/meeting-status.js";

/** Default block length when a task is dropped on a time slot. */
export const DEFAULT_TIMED_TASK_DURATION_MINUTES = 60;
/** Shortest calendar meeting created from a click or drag selection. */
export const MIN_CALENDAR_MEETING_DURATION_MINUTES = 15;

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
  /** Support tickets use a support-ring glyph. */
  support?: boolean | null;
  /** Notification-style tasks use a bell glyph. */
  notification?: boolean | null;
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

/** Lower sorts above in the all-day lane (FullCalendar `eventOrder`). */
export const CALENDAR_EVENT_ORDER_BIRTHDAY = 0;
export const CALENDAR_EVENT_ORDER_DEFAULT = 100;

export type TaskCalendarEvent = {
  id: string;
  title: string;
  /** ISO datetime for timed blocks, local `YYYY-MM-DD` for all-day. */
  start: string;
  end?: string;
  allDay: boolean;
  /**
   * Same-day stack order for FullCalendar (`eventOrder: "order,…"`).
   * Birthdays use {@link CALENDAR_EVENT_ORDER_BIRTHDAY} so they stay on top.
   */
  order?: number;
  /** Birthdays are display-only markers. */
  editable?: boolean;
  startEditable?: boolean;
  durationEditable?: boolean;
  classNames: string[];
  extendedProps:
    | {
        entityType: "task";
        taskId: string;
        status: string;
        projectName?: string | null;
        inboxUpdatedAt?: number | Date | string | null;
        support?: boolean;
        notification?: boolean;
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
        openEnded?: boolean;
        /** Happening now (started, not yet ended). */
        active?: boolean;
        /** Local-only meeting draft; never resolve it as a persisted entity. */
        draft?: boolean;
        /** Backster `external_calendar_events.id` this meeting replaced. */
        externalCalendarEventId?: string | null;
        /** Provider-native id (Google Calendar `event.id`) when known. */
        providerEventId?: string | null;
      }
    | {
        entityType: "birthday";
        contactId: string;
        contactName: string;
      }
    | {
        entityType: "external";
        externalEventId: string;
        provider: string;
        /** Provider-native id (Google Calendar `event.id`). */
        providerEventId?: string | null;
        htmlLink?: string | null;
        location?: string | null;
        description?: string | null;
        linkedMeetingId?: string | null;
        allDay?: boolean;
        startDate?: string | null;
        endDate?: string | null;
        endAt?: string | null;
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

/**
 * Alt/Option held at drop → duplicate the meeting (Google Calendar / Outlook).
 * Intent is read at drop time only: releasing Alt mid-drag before drop moves.
 */
export function isCalendarMeetingDuplicateModifier(
  jsEvent: { altKey?: boolean } | null | undefined,
): boolean {
  return Boolean(jsEvent?.altKey);
}

export type MeetingCalendarLike = {
  id: string;
  title: string;
  startAt: number | Date | string | null;
  endAt: number | Date | string | null;
  /** Linked Google block — schedule syncs both ways; chip is this meeting. */
  externalCalendarEventId?: string | null;
  createdAt?: number | Date | string | null;
  status?: string | null;
  projectName?: string | null;
};

/** Timed blocks at least this long show project name + extra top padding. */
export const CALENDAR_EVENT_EXPANDED_MIN_DURATION_MS = 45 * 60 * 1000;

/** Open-ended live meetings (start only) render this long with a fade-out. */
export const OPEN_ENDED_MEETING_VISUAL_MS = 60 * 60 * 1000;

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
    order: CALENDAR_EVENT_ORDER_DEFAULT,
    classNames: taskCalendarEventClassNames(task.status, {
      habit: Boolean(habitId),
    }),
    extendedProps: {
      entityType: "task" as const,
      taskId: task.id,
      status: task.status,
      projectName: task.projectName?.trim() || null,
      inboxUpdatedAt: task.inboxUpdatedAt ?? null,
      support: Boolean(task.support),
      notification: Boolean(task.notification),
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

export function meetingCalendarEventClassNames(
  finished = false,
  openEnded = false,
): string[] {
  const classNames = ["task-calendar-event", "meeting-calendar-event"];
  if (finished) {
    classNames.push("meeting-calendar-event--finished");
  }
  if (openEnded) {
    classNames.push("meeting-calendar-event--open-ended");
  }
  return classNames;
}

/** Meeting has started and has not ended yet (open-ended or within the window). */
export function isMeetingCurrentlyActive(
  meeting: Pick<MeetingCalendarLike, "startAt" | "endAt" | "status">,
  now = new Date(),
): boolean {
  const stored = (meeting.status ?? "").trim().toLowerCase();
  if (
    stored === "canceled" ||
    stored === "completed" ||
    stored === "duplicated"
  ) {
    return false;
  }
  const start = toValidDate(meeting.startAt);
  if (!start || start.getTime() > now.getTime()) return false;
  const end = toValidDate(meeting.endAt);
  if (end && end.getTime() <= now.getTime()) return false;
  return true;
}

/**
 * Visual end for start-only meetings: at least 1h from start, and while live
 * always stretch at least 1h past `now` so the block covers the current time.
 */
export function openEndedMeetingVisualEnd(
  start: Date,
  now = new Date(),
): Date {
  const fromStart = start.getTime() + OPEN_ENDED_MEETING_VISUAL_MS;
  if (start.getTime() > now.getTime()) {
    return new Date(fromStart);
  }
  const fromNow = now.getTime() + OPEN_ENDED_MEETING_VISUAL_MS;
  return new Date(Math.max(fromStart, fromNow));
}

function meetingCalendarExtendedProps(
  meeting: MeetingCalendarLike,
  extras: {
    finished: boolean;
    openEnded: boolean;
    active: boolean;
    endAt?: string;
    draft?: boolean;
    providerEventId?: string | null;
  },
): Extract<TaskCalendarEvent["extendedProps"], { entityType: "meeting" }> {
  const externalCalendarEventId =
    meeting.externalCalendarEventId?.trim() || null;
  return {
    entityType: "meeting",
    meetingId: meeting.id,
    projectName: meeting.projectName?.trim() || null,
    status: meeting.status ?? null,
    finished: extras.finished,
    openEnded: extras.openEnded,
    active: extras.active,
    ...(extras.endAt ? { endAt: extras.endAt } : {}),
    ...(extras.draft ? { draft: true } : {}),
    externalCalendarEventId,
    providerEventId: extras.providerEventId?.trim() || null,
  };
}

export function meetingToCalendarEvent(
  meeting: MeetingCalendarLike,
  now = new Date(),
  options?: { providerEventId?: string | null },
): TaskCalendarEvent | null {
  const start = toValidDate(meeting.startAt);
  const end = toValidDate(meeting.endAt);
  const title = meeting.title || "Untitled meeting";
  const active = isMeetingCurrentlyActive(meeting, now);
  const providerEventId = options?.providerEventId ?? null;

  // No schedule yet — all-day on the created day (or today).
  if (!start && !end) {
    const daySource = toValidDate(meeting.createdAt) ?? now;
    return {
      id: `meeting:${meeting.id}`,
      title,
      start: formatLocalYmd(daySource),
      allDay: true,
      order: CALENDAR_EVENT_ORDER_DEFAULT,
      classNames: [
        ...meetingCalendarEventClassNames(false, false),
        "meeting-calendar-event--all-day",
      ],
      extendedProps: meetingCalendarExtendedProps(meeting, {
        finished: false,
        openEnded: false,
        active: false,
        providerEventId,
      }),
    };
  }

  // Live / open-ended: start only — timed block that fades out visually.
  if (start && !end) {
    const visualEnd = openEndedMeetingVisualEnd(start, now);
    return {
      id: `meeting:${meeting.id}`,
      title,
      start: start.toISOString(),
      end: visualEnd.toISOString(),
      allDay: false,
      order: CALENDAR_EVENT_ORDER_DEFAULT,
      classNames: meetingCalendarEventClassNames(false, true),
      extendedProps: meetingCalendarExtendedProps(meeting, {
        finished: false,
        openEnded: true,
        active,
        providerEventId,
      }),
    };
  }

  if (!start || !end || end.getTime() <= start.getTime()) return null;
  const finished = isPastCompletedMeeting(meeting, now);
  return {
    id: `meeting:${meeting.id}`,
    title,
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: false,
    order: CALENDAR_EVENT_ORDER_DEFAULT,
    classNames: meetingCalendarEventClassNames(finished, false),
    extendedProps: meetingCalendarExtendedProps(meeting, {
      finished,
      openEnded: false,
      active,
      endAt: end.toISOString(),
      providerEventId,
    }),
  };
}

export function meetingsToCalendarEvents(
  meetings: MeetingCalendarLike[],
  now = new Date(),
  providerEventIdByExternalId?: ReadonlyMap<string, string>,
): TaskCalendarEvent[] {
  const events: TaskCalendarEvent[] = [];
  for (const meeting of meetings) {
    // Linked meetings own the editable grid chip (Google stays in sync via API).
    const linkId = meeting.externalCalendarEventId?.trim() || "";
    const providerEventId = linkId
      ? (providerEventIdByExternalId?.get(linkId) ?? null)
      : null;
    const event = meetingToCalendarEvent(meeting, now, { providerEventId });
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
    meetings.filter((meeting) => {
      const startYmd = getTaskDueDateYmd(meeting.startAt, calendarTimeZone);
      if (startYmd === dateSlug) return true;
      // Unscheduled (all-day) meetings: place on created day.
      if (toValidDate(meeting.startAt) == null && toValidDate(meeting.endAt) == null) {
        const createdYmd = getTaskDueDateYmd(
          meeting.createdAt ?? now,
          calendarTimeZone,
        );
        return createdYmd === dateSlug;
      }
      return false;
    }),
    now,
  );
}

export function calendarEntityFromEvent(event: {
  id: string;
  extendedProps: Record<string, unknown>;
}): {
  entityType: "task" | "meeting" | "birthday" | "external";
  entityId: string;
} {
  const props = event.extendedProps;
  if (props.entityType === "meeting") {
    const meetingId = props.meetingId;
    if (typeof meetingId === "string" && meetingId) {
      return { entityType: "meeting", entityId: meetingId };
    }
  }
  if (props.entityType === "birthday") {
    const contactId = props.contactId;
    if (typeof contactId === "string" && contactId) {
      return { entityType: "birthday", entityId: contactId };
    }
    // `birthday:{contactId}:{year}` — recover if extendedProps were dropped.
    const fromId = /^birthday:([^:]+):\d{4}$/.exec(event.id);
    if (fromId?.[1]) {
      return { entityType: "birthday", entityId: fromId[1] };
    }
  }
  if (props.entityType === "external") {
    const externalEventId = props.externalEventId;
    if (typeof externalEventId === "string" && externalEventId) {
      return { entityType: "external", entityId: externalEventId };
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
  const minimumEnd = new Date(
    start.getTime() + MIN_CALENDAR_MEETING_DURATION_MINUTES * 60_000,
  );
  const effectiveEnd =
    end && end.getTime() >= minimumEnd.getTime()
      ? end
      : minimumEnd;
  return {
    startAt: start.toISOString(),
    endAt: effectiveEnd.toISOString(),
  };
}

function normalizeCalendarEventTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/** External event ids that already have a Backster meeting shell on the grid. */
export function linkedExternalCalendarEventIds(
  meetings: MeetingCalendarLike[],
  externalEvents: ExternalCalendarEventLike[] = [],
): Set<string> {
  const ids = new Set<string>();
  for (const meeting of meetings) {
    const externalId = meeting.externalCalendarEventId?.trim();
    if (externalId) ids.add(externalId);
  }
  // Also honor API `linkedMeetingId` when that meeting is actually on the grid.
  // PowerSync can lag the meeting.externalCalendarEventId column; without this
  // Convert leaves the Google chip beside the meeting chip.
  if (externalEvents.length === 0) return ids;
  const meetingIds = new Set(meetings.map((meeting) => meeting.id));
  for (const event of externalEvents) {
    const linkedMeetingId = event.linkedMeetingId?.trim();
    if (linkedMeetingId && meetingIds.has(linkedMeetingId)) {
      ids.add(event.id);
    }
  }
  // Meetings created outside Convert (or before the link column existed) share
  // title + start with the Google row but have no ids — e.g. Simone's
  // "Verjaardag Simone de Vries" on Oct 2. Hide the Google duplicate.
  const unmatchedMeetings = meetings.filter(
    (meeting) => !meeting.externalCalendarEventId?.trim(),
  );
  if (unmatchedMeetings.length === 0) return ids;
  for (const event of externalEvents) {
    if (ids.has(event.id)) continue;
    if (event.allDay) continue;
    const extStart = toValidDate(event.startAt);
    if (!extStart) continue;
    const extStartIso = extStart.toISOString();
    const extTitle = normalizeCalendarEventTitle(event.title);
    if (!extTitle) continue;
    for (const meeting of unmatchedMeetings) {
      const meetingStart = toValidDate(meeting.startAt);
      if (!meetingStart) continue;
      if (meetingStart.toISOString() !== extStartIso) continue;
      if (normalizeCalendarEventTitle(meeting.title) !== extTitle) continue;
      ids.add(event.id);
      break;
    }
  }
  return ids;
}

/** Merge task, meeting, birthday, and optional external calendar events. */
export function mergeCalendarGridEvents(
  tasks: CalendarTaskLike[],
  meetings: MeetingCalendarLike[],
  now = new Date(),
  birthdays: BirthdayCalendarLike[] = [],
  yearSpan?: { fromYear: number; toYear: number },
  externalEvents: ExternalCalendarEventLike[] = [],
): TaskCalendarEvent[] {
  const year = now.getFullYear();
  const fromYear = yearSpan?.fromYear ?? year - 1;
  const toYear = yearSpan?.toYear ?? year + 1;
  // Hide Google only once the linked meeting is actually in `meetings` — never
  // on a sticky client-side `linkedMeetingId` alone (that raced Convert and
  // blanked the chip before the meeting row landed).
  const linkedExternalIds = linkedExternalCalendarEventIds(
    meetings,
    externalEvents,
  );
  const providerEventIdByExternalId = new Map<string, string>();
  for (const event of externalEvents) {
    const providerEventId = event.externalId?.trim() || event.providerEventId?.trim();
    if (providerEventId) {
      providerEventIdByExternalId.set(event.id, providerEventId);
    }
  }
  return [
    // Birthdays first so all-day stack keeps them above tasks when `order` ties.
    ...birthdaysToCalendarEvents(birthdays, fromYear, toYear),
    ...tasksToCalendarEvents(tasks),
    ...meetingsToCalendarEvents(meetings, now, providerEventIdByExternalId),
    ...externalCalendarEventsToCalendarEvents(externalEvents, linkedExternalIds),
  ];
}

export type ExternalCalendarEventLike = {
  id: string;
  provider: string;
  /** Provider-native event id (Google Calendar `event.id`). */
  externalId?: string | null;
  /** Alias used by some client caches for `externalId`. */
  providerEventId?: string | null;
  title: string;
  startAt?: string | null;
  endAt?: string | null;
  allDay: boolean;
  startDate?: string | null;
  endDate?: string | null;
  htmlLink?: string | null;
  location?: string | null;
  description?: string | null;
  linkedMeetingId?: string | null;
};

/** Read-only remote calendar blocks (Google Calendar first — ADR-037). */
export function externalCalendarEventsToCalendarEvents(
  events: ExternalCalendarEventLike[],
  /** When set, skip blocks that already have a meeting chip on the grid. */
  linkedExternalIds?: ReadonlySet<string>,
): TaskCalendarEvent[] {
  const result: TaskCalendarEvent[] = [];
  for (const event of events) {
    // Prefer the editable meeting chip once that meeting is in the meetings list.
    if (linkedExternalIds?.has(event.id)) continue;
    const title = event.title.trim() || "(No title)";
    const linkedMeetingId = event.linkedMeetingId?.trim() || null;
    const providerEventId =
      event.externalId?.trim() || event.providerEventId?.trim() || null;
    if (event.allDay && event.startDate?.trim()) {
      const startDate = event.startDate.trim();
      // Include start in the FC id so a moved block is remove+add (FullCalendar
      // can keep the old instance range when only `start` changes for same id).
      result.push({
        id: `external:${event.id}:${startDate}`,
        title,
        start: startDate,
        end: event.endDate?.trim() || undefined,
        allDay: true,
        order: CALENDAR_EVENT_ORDER_DEFAULT,
        editable: false,
        startEditable: false,
        durationEditable: false,
        classNames: [
          "task-calendar-event",
          "external-calendar-event",
          `external-calendar-event--${event.provider}`,
        ],
        extendedProps: {
          entityType: "external",
          externalEventId: event.id,
          provider: event.provider,
          providerEventId,
          htmlLink: event.htmlLink ?? null,
          location: event.location ?? null,
          description: event.description ?? null,
          linkedMeetingId,
          allDay: true,
          startDate,
          endDate: event.endDate?.trim() || null,
        },
      });
      continue;
    }
    const start = toValidDate(event.startAt);
    if (!start) continue;
    const end = toValidDate(event.endAt);
    const startIso = start.toISOString();
    const endIso = end ? end.toISOString() : null;
    result.push({
      id: `external:${event.id}:${startIso}`,
      title,
      start: startIso,
      end: endIso ?? undefined,
      allDay: false,
      order: CALENDAR_EVENT_ORDER_DEFAULT,
      editable: false,
      startEditable: false,
      durationEditable: false,
      classNames: [
        "task-calendar-event",
        "external-calendar-event",
        `external-calendar-event--${event.provider}`,
      ],
      extendedProps: {
        entityType: "external",
        externalEventId: event.id,
        provider: event.provider,
        providerEventId,
        htmlLink: event.htmlLink ?? null,
        location: event.location ?? null,
        description: event.description ?? null,
        linkedMeetingId,
        allDay: false,
        endAt: endIso,
      },
    });
  }
  return result;
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
        order: CALENDAR_EVENT_ORDER_BIRTHDAY,
        editable: false,
        startEditable: false,
        durationEditable: false,
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
