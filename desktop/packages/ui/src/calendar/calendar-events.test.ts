import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_TIMED_TASK_DURATION_MINUTES,
  calendarChangeToMeetingPatch,
  calendarChangeToTaskPatch,
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
