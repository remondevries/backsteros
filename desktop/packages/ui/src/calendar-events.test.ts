import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_TIMED_TASK_DURATION_MINUTES,
  calendarChangeToTaskPatch,
  taskCalendarEventClassNames,
  taskCalendarEventColors,
  taskCalendarEventNeutralColors,
  taskToCalendarEvent,
  tasksToCalendarEvents,
  formatCalendarTaskScheduleLabel,
  meetingToCalendarEvent,
  mergeCalendarGridEvents,
  unscheduledCalendarTasks,
} from "../dist/calendar-events.js";

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

test("tasksToCalendarEvents skips habit-linked day tasks", () => {
  const due = new Date(2026, 7, 24);
  const events = tasksToCalendarEvents([
    { ...baseTask, id: "habit", dueDate: due, habitId: "habit-1" },
    { ...baseTask, id: "task", dueDate: due },
  ]);
  assert.deepEqual(events.map((event) => event.id), ["task"]);
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
