import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_TIMED_TASK_DURATION_MINUTES,
  MIN_CALENDAR_MEETING_DURATION_MINUTES,
  OPEN_ENDED_MEETING_VISUAL_MS,
  calendarChangeToMeetingPatch,
  calendarChangeToTaskPatch,
  calendarSelectionToMeetingRange,
  isCalendarMeetingDuplicateModifier,
  taskCalendarEventClassNames,
  taskCalendarEventColors,
  taskCalendarEventNeutralColors,
  taskToCalendarEvent,
  tasksToCalendarEvents,
  formatCalendarTaskScheduleLabel,
  meetingToCalendarEvent,
  meetingsToCalendarEventsForDate,
  mergeCalendarGridEvents,
  birthdaysToCalendarEvents,
  externalCalendarEventsToCalendarEvents,
  unscheduledCalendarTasks,
} from "./calendar-events.js";

const baseTask = {
  id: "task-1",
  title: "Write report",
  status: "ready_to_start",
  dueDate: null,
  dueEndDate: null,
};

test("taskToCalendarEvent returns null without a due date", () => {
  assert.equal(taskToCalendarEvent(baseTask), null);
  assert.equal(
    taskToCalendarEvent({ ...baseTask, dueDate: Number.NaN }),
    null,
  );
});

test("taskToCalendarEvent maps a due date without end to an all-day event", () => {
  const due = new Date(2026, 7, 24, 15, 30);
  const event = taskToCalendarEvent({ ...baseTask, dueDate: due.getTime() });
  assert.ok(event);
  assert.equal(event.allDay, true);
  assert.equal(event.start, "2026-08-24");
  assert.equal(event.end, undefined);
  assert.equal(event.extendedProps.entityType, "task");
  assert.equal(event.extendedProps.taskId, "task-1");
});

test("taskToCalendarEvent maps a start and end to a timed event", () => {
  const start = new Date(2026, 7, 24, 9, 0);
  const end = new Date(2026, 7, 24, 10, 30);
  const event = taskToCalendarEvent({
    ...baseTask,
    dueDate: start,
    dueEndDate: end,
  });
  assert.ok(event);
  assert.equal(event.allDay, false);
  assert.equal(event.start, start.toISOString());
  assert.equal(event.end, end.toISOString());
});

test("taskToCalendarEvent treats an end at or before the start as all-day", () => {
  const start = new Date(2026, 7, 24, 9, 0);
  const event = taskToCalendarEvent({
    ...baseTask,
    dueDate: start,
    dueEndDate: start,
  });
  assert.ok(event);
  assert.equal(event.allDay, true);
  assert.equal(event.start, "2026-08-24");
});

test("taskToCalendarEvent falls back to a title for untitled tasks", () => {
  const event = taskToCalendarEvent({
    ...baseTask,
    title: "",
    dueDate: new Date(2026, 7, 24),
  });
  assert.ok(event);
  assert.equal(event.title, "Untitled task");
});

test("taskCalendarEventColors uses the task status color", () => {
  const colors = taskCalendarEventColors("in_progress");
  assert.equal(colors.borderColor, "#e9c141");
  assert.match(colors.backgroundColor, /color-mix/);
  assert.match(colors.backgroundColor, /#e9c141/);
});

test("taskCalendarEventNeutralColors returns muted foreground mixes", () => {
  const colors = taskCalendarEventNeutralColors();
  assert.match(colors.borderColor, /var\(--foreground\)/);
  assert.match(colors.backgroundColor, /var\(--foreground\)/);
});

test("taskCalendarEventClassNames flags terminal statuses", () => {
  assert.deepEqual(taskCalendarEventClassNames("ready_to_start"), [
    "task-calendar-event",
  ]);
  assert.deepEqual(taskCalendarEventClassNames("completed"), [
    "task-calendar-event",
    "task-calendar-event-done",
  ]);
  assert.deepEqual(taskCalendarEventClassNames("done"), [
    "task-calendar-event",
    "task-calendar-event-done",
  ]);
});

test("tasksToCalendarEvents skips all-day habit-linked day tasks", () => {
  const due = new Date(2026, 7, 24);
  const events = tasksToCalendarEvents([
    { ...baseTask, id: "habit", dueDate: due, habitId: "habit-1" },
    { ...baseTask, id: "task", dueDate: due },
  ]);
  assert.deepEqual(events.map((event) => event.id), ["task"]);
});

test("tasksToCalendarEvents includes timed habit-linked blocks", () => {
  const start = new Date(2026, 7, 24, 9, 0);
  const end = new Date(2026, 7, 24, 10, 0);
  const events = tasksToCalendarEvents([
    {
      ...baseTask,
      id: "habit",
      dueDate: start,
      dueEndDate: end,
      habitId: "habit-1",
      habitIcon: "flame",
    },
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.id, "habit");
  assert.equal(events[0]?.allDay, false);
  assert.ok(events[0]?.classNames.includes("habit-calendar-event"));
  assert.equal(events[0]?.extendedProps.entityType, "task");
  if (events[0]?.extendedProps.entityType === "task") {
    assert.equal(events[0].extendedProps.habitId, "habit-1");
    assert.equal(events[0].extendedProps.habitIcon, "flame");
  }
});

test("tasksToCalendarEvents skips email rows, undated tasks, and hidden statuses", () => {
  const due = new Date(2026, 7, 24);
  const events = tasksToCalendarEvents([
    { ...baseTask, id: "a", dueDate: due },
    { ...baseTask, id: "b", dueDate: null },
    { ...baseTask, id: "c", dueDate: due, listKind: "email" },
    { ...baseTask, id: "canceled", dueDate: due, status: "canceled" },
    { ...baseTask, id: "dup", dueDate: due, status: "duplicated" },
  ]);
  assert.deepEqual(
    events.map((event) => event.id),
    ["a"],
  );
});

test("taskToCalendarEvent uses class-based neutral styling without inline colors", () => {
  const event = taskToCalendarEvent({
    ...baseTask,
    status: "in_progress",
    dueDate: new Date(2026, 7, 24, 9, 0),
    dueEndDate: new Date(2026, 7, 24, 10, 0),
  });
  assert.ok(event);
  assert.equal(event.backgroundColor, undefined);
  assert.equal(event.borderColor, undefined);
  assert.deepEqual(event.classNames, ["task-calendar-event"]);
});

test("calendarChangeToTaskPatch returns null without a start", () => {
  assert.equal(
    calendarChangeToTaskPatch({ start: null, end: null, allDay: false }),
    null,
  );
});

test("calendarChangeToTaskPatch clears the end for all-day placement", () => {
  const start = new Date(2026, 7, 24);
  const patch = calendarChangeToTaskPatch({
    start,
    end: new Date(2026, 7, 25),
    allDay: true,
  });
  assert.ok(patch);
  assert.equal(patch.dueDate, start.toISOString());
  assert.equal(patch.dueEndDate, null);
});

test("calendarChangeToTaskPatch keeps an explicit end for timed placement", () => {
  const start = new Date(2026, 7, 24, 9, 0);
  const end = new Date(2026, 7, 24, 11, 0);
  const patch = calendarChangeToTaskPatch({ start, end, allDay: false });
  assert.ok(patch);
  assert.equal(patch.dueDate, start.toISOString());
  assert.equal(patch.dueEndDate, end.toISOString());
});

test("calendarChangeToTaskPatch defaults the block length without an end", () => {
  const start = new Date(2026, 7, 24, 9, 0);
  const patch = calendarChangeToTaskPatch({ start, end: null, allDay: false });
  assert.ok(patch);
  assert.equal(patch.dueDate, start.toISOString());
  assert.equal(
    patch.dueEndDate,
    new Date(
      start.getTime() + DEFAULT_TIMED_TASK_DURATION_MINUTES * 60_000,
    ).toISOString(),
  );
});

test("unscheduledCalendarTasks keeps only open tasks without a due date", () => {
  const tasks = [
    { ...baseTask, id: "open" },
    { ...baseTask, id: "scheduled", dueDate: new Date(2026, 7, 24) },
    { ...baseTask, id: "done", status: "completed" },
    { ...baseTask, id: "canceled", status: "canceled" },
    { ...baseTask, id: "email", listKind: "email" as const },
  ];
  assert.deepEqual(
    unscheduledCalendarTasks(tasks).map((task) => task.id),
    ["open"],
  );
});

test("formatCalendarTaskScheduleLabel formats all-day and timed schedules", () => {
  const allDay = new Date(2026, 7, 24, 15, 30);
  assert.ok(
    formatCalendarTaskScheduleLabel(allDay.getTime(), null)?.includes("24"),
  );

  const start = new Date(2026, 7, 24, 9, 0);
  const end = new Date(2026, 7, 24, 10, 30);
  const timed = formatCalendarTaskScheduleLabel(start, end);
  assert.ok(timed);
  assert.match(timed!, /9/);
  assert.match(timed!, /10/);
});

test("isCalendarMeetingDuplicateModifier reads altKey at drop", () => {
  assert.equal(isCalendarMeetingDuplicateModifier({ altKey: true }), true);
  assert.equal(isCalendarMeetingDuplicateModifier({ altKey: false }), false);
  assert.equal(isCalendarMeetingDuplicateModifier(null), false);
  assert.equal(isCalendarMeetingDuplicateModifier(undefined), false);
});

test("calendarChangeToMeetingPatch derives status from schedule", () => {
  const now = new Date("2026-08-23T12:00:00.000Z");
  const futureStart = new Date("2026-08-23T14:00:00.000Z");
  const futureEnd = new Date("2026-08-23T15:00:00.000Z");
  const futurePatch = calendarChangeToMeetingPatch(
    {
      start: futureStart,
      end: futureEnd,
      allDay: false,
    },
    now,
  );
  assert.equal(futurePatch?.status, "on_hold");

  const liveStart = new Date("2026-08-23T11:30:00.000Z");
  const liveEnd = new Date("2026-08-23T12:30:00.000Z");
  const livePatch = calendarChangeToMeetingPatch(
    {
      start: liveStart,
      end: liveEnd,
      allDay: false,
    },
    now,
  );
  assert.equal(livePatch?.status, "in_progress");

  const pastStart = new Date("2026-08-23T09:00:00.000Z");
  const pastEnd = new Date("2026-08-23T10:00:00.000Z");
  const pastPatch = calendarChangeToMeetingPatch(
    {
      start: pastStart,
      end: pastEnd,
      allDay: false,
    },
    now,
  );
  assert.equal(pastPatch?.status, "completed");
});

test("calendarSelectionToMeetingRange enforces a 15-minute minimum", () => {
  const start = new Date("2026-08-23T14:00:00.000Z");
  const shortEnd = new Date("2026-08-23T14:05:00.000Z");
  const range = calendarSelectionToMeetingRange({
    start,
    end: shortEnd,
    allDay: false,
  });

  assert.ok(range);
  assert.equal(
    new Date(range.endAt).getTime() - new Date(range.startAt).getTime(),
    MIN_CALENDAR_MEETING_DURATION_MINUTES * 60_000,
  );
});

test("meetingToCalendarEvent maps timed meetings", () => {
  const start = new Date(2026, 7, 24, 9, 0);
  const end = new Date(2026, 7, 24, 10, 0);
  const event = meetingToCalendarEvent({
    id: "m-1",
    title: "Standup",
    startAt: start,
    endAt: end,
  });
  assert.ok(event);
  assert.equal(event.id, "meeting:m-1");
  assert.equal(event.extendedProps.entityType, "meeting");
  assert.equal(event.extendedProps.meetingId, "m-1");
  assert.equal(event.extendedProps.finished, false);
  if (event.extendedProps.entityType === "meeting") {
    assert.equal(event.extendedProps.externalCalendarEventId, null);
    assert.equal(event.extendedProps.providerEventId, null);
  }
});

test("meetingToCalendarEvent carries the linked Google event ids", () => {
  const start = new Date(2026, 7, 24, 9, 0);
  const end = new Date(2026, 7, 24, 10, 0);
  const event = meetingToCalendarEvent(
    {
      id: "m-1",
      title: "Standup",
      startAt: start,
      endAt: end,
      externalCalendarEventId: "ext-row-1",
    },
    new Date(2026, 7, 24, 8, 0),
    { providerEventId: "google-event-abc" },
  );
  assert.ok(event);
  assert.equal(event.extendedProps.entityType, "meeting");
  if (event.extendedProps.entityType === "meeting") {
    assert.equal(event.extendedProps.externalCalendarEventId, "ext-row-1");
    assert.equal(event.extendedProps.providerEventId, "google-event-abc");
  }
});

test("meetingToCalendarEvent maps unscheduled meetings as all-day", () => {
  const createdAt = new Date(2026, 7, 24, 8, 0);
  const event = meetingToCalendarEvent({
    id: "m-all-day",
    title: "Quick call",
    startAt: null,
    endAt: null,
    createdAt,
  });
  assert.ok(event);
  assert.equal(event.allDay, true);
  assert.equal(event.start, "2026-08-24");
  assert.equal(event.extendedProps.openEnded, false);
  assert.ok(event.classNames?.includes("meeting-calendar-event--all-day"));
});

test("meetingToCalendarEvent maps start-only meetings as open-ended fade blocks", () => {
  const start = new Date(2026, 7, 24, 9, 0);
  const now = new Date(2026, 7, 24, 9, 5);
  const event = meetingToCalendarEvent(
    {
      id: "m-live",
      title: "Live call",
      startAt: start,
      endAt: null,
    },
    now,
  );
  assert.ok(event);
  assert.equal(event.allDay, false);
  assert.equal(event.start, start.toISOString());
  assert.equal(
    new Date(event.end!).getTime(),
    now.getTime() + OPEN_ENDED_MEETING_VISUAL_MS,
  );
  assert.equal(event.extendedProps.openEnded, true);
  assert.equal(event.extendedProps.active, true);
  assert.ok(event.classNames?.includes("meeting-calendar-event--open-ended"));
  assert.equal(
    event.classNames?.includes("meeting-calendar-event--active"),
    false,
  );
});

test("meetingToCalendarEvent keeps open-ended blocks covering now while still live", () => {
  const start = new Date(2026, 7, 24, 9, 0);
  const now = new Date(2026, 7, 24, 11, 0);
  const event = meetingToCalendarEvent(
    {
      id: "m-live-long",
      title: "Long live call",
      startAt: start,
      endAt: null,
      status: "in_progress",
    },
    now,
  );
  assert.ok(event);
  assert.equal(event.extendedProps.active, true);
  assert.equal(
    new Date(event.end!).getTime(),
    now.getTime() + OPEN_ENDED_MEETING_VISUAL_MS,
  );
});

test("meetingToCalendarEvent marks timed in-window meetings as active", () => {
  const start = new Date("2026-08-23T14:00:00.000Z");
  const end = new Date("2026-08-23T15:00:00.000Z");
  const now = new Date("2026-08-23T14:30:00.000Z");
  const event = meetingToCalendarEvent(
    {
      id: "m-active",
      title: "Standup",
      startAt: start,
      endAt: end,
    },
    now,
  );
  assert.ok(event);
  assert.equal(event.extendedProps.active, true);
  assert.equal(
    event.classNames?.includes("meeting-calendar-event--active"),
    false,
  );
});

test("meetingToCalendarEvent marks past completed meetings as finished", () => {
  const start = new Date("2026-08-23T14:00:00.000Z");
  const end = new Date("2026-08-23T15:00:00.000Z");
  const now = new Date("2026-08-23T16:00:00.000Z");
  const event = meetingToCalendarEvent(
    {
      id: "m-2",
      title: "Retro",
      startAt: start,
      endAt: end,
      status: "completed",
    },
    now,
  );
  assert.ok(event);
  assert.equal(event.extendedProps.finished, true);
  assert.ok(event.classNames?.includes("meeting-calendar-event--finished"));
});

test("meetingsToCalendarEventsForDate keeps meetings that start on the day", () => {
  const dayStart = new Date(2026, 7, 25, 9, 0);
  const dayEnd = new Date(2026, 7, 25, 10, 0);
  const otherStart = new Date(2026, 7, 26, 9, 0);
  const otherEnd = new Date(2026, 7, 26, 10, 0);
  const events = meetingsToCalendarEventsForDate(
    [
      { id: "today", title: "Today", startAt: dayStart, endAt: dayEnd },
      { id: "tomorrow", title: "Tomorrow", startAt: otherStart, endAt: otherEnd },
    ],
    "2026-08-25",
  );
  assert.deepEqual(
    events.map((event) => event.extendedProps.meetingId),
    ["today"],
  );
});

test("mergeCalendarGridEvents includes tasks and meetings", () => {
  const start = new Date(2026, 7, 24, 9, 0);
  const end = new Date(2026, 7, 24, 10, 0);
  const events = mergeCalendarGridEvents(
    [{ ...baseTask, dueDate: start, dueEndDate: end }],
    [{ id: "m-1", title: "Sync", startAt: start, endAt: end }],
  );
  assert.equal(events.length, 2);
});

test("birthdaysToCalendarEvents emits yearly all-day markers", () => {
  const events = birthdaysToCalendarEvents(
    [{ id: "c1", name: "Ada", birthday: "1990-03-15" }],
    2026,
    2027,
  );
  assert.equal(events.length, 2);
  assert.equal(events[0]?.id, "birthday:c1:2026");
  assert.equal(events[0]?.allDay, true);
  assert.equal(events[0]?.start, "2026-03-15");
  assert.equal(events[0]?.extendedProps.entityType, "birthday");
});

test("birthdaysToCalendarEvents accepts ISO datetime birthday strings", () => {
  const events = birthdaysToCalendarEvents(
    [{ id: "c1", name: "Ada", birthday: "1990-03-15T00:00:00.000Z" }],
    2026,
    2026,
  );
  assert.equal(events.length, 1);
  assert.equal(events[0]?.start, "2026-03-15");
});

test("mergeCalendarGridEvents includes birthday markers", () => {
  const events = mergeCalendarGridEvents(
    [],
    [],
    new Date(2026, 7, 28),
    [{ id: "c1", name: "Remon", birthday: "1990-08-28" }],
  );
  assert.equal(events.length, 3);
  assert.ok(events.some((event) => event.start === "2026-08-28"));
});

test("mergeCalendarGridEvents puts birthdays before same-day all-day tasks", () => {
  const dayStart = new Date(2026, 7, 28, 12, 0);
  const events = mergeCalendarGridEvents(
    [
      {
        id: "task-1",
        title: "All-day chore",
        status: "ready_to_start",
        dueDate: dayStart,
        dueEndDate: null,
      },
    ],
    [],
    new Date(2026, 7, 28),
    [{ id: "c1", name: "Remon", birthday: "1990-08-28" }],
  );
  const sameDay = events.filter((event) => event.start === "2026-08-28");
  assert.equal(sameDay[0]?.extendedProps.entityType, "birthday");
  assert.equal(sameDay[0]?.order, 0);
  assert.equal(sameDay[1]?.extendedProps.entityType, "task");
  assert.ok((sameDay[1]?.order ?? 0) > (sameDay[0]?.order ?? 0));
});

test("externalCalendarEventsToCalendarEvents maps timed and all-day Google events", () => {
  const events = externalCalendarEventsToCalendarEvents([
    {
      id: "e1",
      provider: "google_calendar",
      externalId: "google-event-1",
      title: "Standup",
      startAt: "2026-10-08T09:00:00.000Z",
      endAt: "2026-10-08T09:30:00.000Z",
      allDay: false,
      htmlLink: "https://calendar.google.com/event?eid=1",
    },
    {
      id: "e2",
      provider: "google_calendar",
      title: "Offsite",
      allDay: true,
      startDate: "2026-10-09",
      endDate: "2026-10-10",
    },
  ]);
  assert.equal(events.length, 2);
  assert.equal(events[0]?.extendedProps.entityType, "external");
  assert.equal(events[0]?.editable, false);
  if (events[0]?.extendedProps.entityType === "external") {
    assert.equal(events[0].extendedProps.providerEventId, "google-event-1");
  }
  assert.equal(events[1]?.allDay, true);
  assert.equal(events[1]?.start, "2026-10-09");
});

test("merge attaches Google providerEventId onto the linked meeting chip", () => {
  const events = mergeCalendarGridEvents(
    [],
    [
      {
        id: "m1",
        title: "Google meet",
        startAt: "2026-10-08T12:00:00.000Z",
        endAt: "2026-10-08T13:00:00.000Z",
        externalCalendarEventId: "e1",
      },
    ],
    new Date(2026, 9, 8),
    [],
    undefined,
    [
      {
        id: "e1",
        provider: "google_calendar",
        externalId: "gcal-abc",
        title: "Google meet",
        startAt: "2026-10-08T12:00:00.000Z",
        endAt: "2026-10-08T13:00:00.000Z",
        allDay: false,
        linkedMeetingId: "m1",
      },
    ],
  );
  const meeting = events.find(
    (event) => event.extendedProps.entityType === "meeting",
  );
  assert.ok(meeting);
  if (meeting?.extendedProps.entityType === "meeting") {
    assert.equal(meeting.extendedProps.externalCalendarEventId, "e1");
    assert.equal(meeting.extendedProps.providerEventId, "gcal-abc");
  }
  assert.equal(
    events.filter((event) => event.extendedProps.entityType === "external")
      .length,
    0,
  );
});

test("mergeCalendarGridEvents includes external calendar events", () => {
  const events = mergeCalendarGridEvents(
    [],
    [],
    new Date(2026, 9, 8),
    [],
    undefined,
    [
      {
        id: "e1",
        provider: "google_calendar",
        title: "Google meet",
        startAt: "2026-10-08T12:00:00.000Z",
        endAt: "2026-10-08T13:00:00.000Z",
        allDay: false,
      },
    ],
  );
  assert.ok(
    events.some(
      (event) =>
        event.extendedProps.entityType === "external" &&
        event.title === "Google meet",
    ),
  );
});

test("linkedMeetingId alone does not hide Google until a meeting owns the link", () => {
  const withStickyLinkOnly = mergeCalendarGridEvents(
    [],
    [],
    new Date(2026, 9, 8),
    [],
    undefined,
    [
      {
        id: "e1",
        provider: "google_calendar",
        title: "Google meet",
        startAt: "2026-10-08T12:00:00.000Z",
        endAt: "2026-10-08T13:00:00.000Z",
        allDay: false,
        linkedMeetingId: "m1",
      },
    ],
  );
  assert.ok(
    withStickyLinkOnly.some(
      (event) => event.extendedProps.entityType === "external",
    ),
    "Google chip must stay visible while the meeting row is still missing",
  );

  const withLinkedMeeting = mergeCalendarGridEvents(
    [],
    [
      {
        id: "m1",
        title: "Google meet",
        startAt: "2026-10-08T12:00:00.000Z",
        endAt: "2026-10-08T13:00:00.000Z",
        externalCalendarEventId: "e1",
      },
    ],
    new Date(2026, 9, 8),
    [],
    undefined,
    [
      {
        id: "e1",
        provider: "google_calendar",
        title: "Google meet",
        startAt: "2026-10-08T12:00:00.000Z",
        endAt: "2026-10-08T13:00:00.000Z",
        allDay: false,
        linkedMeetingId: "m1",
      },
    ],
  );
  assert.equal(
    withLinkedMeeting.filter(
      (event) => event.extendedProps.entityType === "external",
    ).length,
    0,
  );
  assert.ok(
    withLinkedMeeting.some(
      (event) =>
        event.extendedProps.entityType === "meeting" &&
        event.extendedProps.meetingId === "m1",
    ),
  );
});

test("API linkedMeetingId hides Google when meeting is on the grid without local external id", () => {
  const events = mergeCalendarGridEvents(
    [],
    [
      {
        id: "m1",
        title: "Google meet",
        startAt: "2026-10-08T12:00:00.000Z",
        endAt: "2026-10-08T13:00:00.000Z",
        // PowerSync may omit externalCalendarEventId while REST already linked.
      },
    ],
    new Date(2026, 9, 8),
    [],
    undefined,
    [
      {
        id: "e1",
        provider: "google_calendar",
        title: "Google meet",
        startAt: "2026-10-08T12:00:00.000Z",
        endAt: "2026-10-08T13:00:00.000Z",
        allDay: false,
        linkedMeetingId: "m1",
      },
    ],
  );
  assert.equal(
    events.filter((event) => event.extendedProps.entityType === "external")
      .length,
    0,
  );
  assert.ok(
    events.some((event) => event.extendedProps.entityType === "meeting"),
  );
});

test("same title and start hides unlinked Google beside a meeting (Simone Verjaardag)", () => {
  const events = mergeCalendarGridEvents(
    [],
    [
      {
        id: "Mx6ynVI1J8aZ9oQrW9EZs",
        title: "Verjaardag Simone de Vries",
        startAt: "2026-10-02T14:30:00.000Z",
        endAt: "2026-10-02T18:00:00.000Z",
        externalCalendarEventId: null,
      },
    ],
    new Date(2026, 9, 2),
    [],
    undefined,
    [
      {
        id: "57e8fb1a4ac37c958ce33",
        provider: "google_calendar",
        title: "Verjaardag Simone de Vries",
        startAt: "2026-10-02T14:30:00.000Z",
        endAt: "2026-10-02T18:00:00.000Z",
        allDay: false,
        linkedMeetingId: null,
      },
    ],
  );
  assert.equal(
    events.filter((event) => event.extendedProps.entityType === "external")
      .length,
    0,
  );
  assert.ok(
    events.some(
      (event) =>
        event.extendedProps.entityType === "meeting" &&
        event.extendedProps.meetingId === "Mx6ynVI1J8aZ9oQrW9EZs",
    ),
  );
});

test("same start but different title keeps Google beside a meeting", () => {
  const events = mergeCalendarGridEvents(
    [],
    [
      {
        id: "m1",
        title: "Standup",
        startAt: "2026-10-02T14:30:00.000Z",
        endAt: "2026-10-02T15:00:00.000Z",
      },
    ],
    new Date(2026, 9, 2),
    [],
    undefined,
    [
      {
        id: "e1",
        provider: "google_calendar",
        title: "Verjaardag Simone de Vries",
        startAt: "2026-10-02T14:30:00.000Z",
        endAt: "2026-10-02T18:00:00.000Z",
        allDay: false,
      },
    ],
  );
  assert.equal(
    events.filter((event) => event.extendedProps.entityType === "external")
      .length,
    1,
  );
});
