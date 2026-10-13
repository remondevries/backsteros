import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calendarMeetingDragDurationFromElement,
  calendarMeetingDragEventData,
  calendarTaskDragDurationFromElement,
  calendarTaskDragEventData,
  fullCalendarDurationToMinutes,
  minutesToFullCalendarDuration,
} from "./calendar-task-drag.js";

function mockDragElement(attrs: Record<string, string>): HTMLElement {
  return {
    getAttribute: (name: string) => attrs[name] ?? null,
  } as HTMLElement;
}

test("calendarMeetingDragEventData sets meeting id and entity type", () => {
  const el = mockDragElement({
    "data-calendar-meeting-id": "meet-abc",
    "data-calendar-meeting-title": "Standup",
    "data-calendar-meeting-start-ms": String(Date.UTC(2026, 7, 24, 9, 0)),
    "data-calendar-meeting-end-ms": String(Date.UTC(2026, 7, 24, 10, 0)),
  });
  const data = calendarMeetingDragEventData(el);
  assert.equal(data.id, "meeting:meet-abc");
  assert.equal(data.extendedProps.entityType, "meeting");
  assert.equal(data.extendedProps.meetingId, "meet-abc");
  assert.equal(data.title, "Standup");
  assert.equal(data.duration, "1:00");
  assert.deepEqual(data.classNames, [
    "task-calendar-event",
    "meeting-calendar-event",
  ]);
});

test("calendarMeetingDragDurationFromElement uses meeting block length", () => {
  const el = mockDragElement({
    "data-calendar-meeting-start-ms": String(Date.UTC(2026, 7, 24, 9, 0)),
    "data-calendar-meeting-end-ms": String(Date.UTC(2026, 7, 24, 10, 30)),
  });
  assert.equal(calendarMeetingDragDurationFromElement(el), "1:30");
});

test("calendarTaskDragEventData sets id and taskId for FullCalendar", () => {
  const el = mockDragElement({
    "data-calendar-task-id": "task-abc",
    "data-calendar-task-title": "Ship feature",
    "data-calendar-task-status": "in_progress",
  });
  const data = calendarTaskDragEventData(el);
  assert.equal(data.id, "task-abc");
  assert.equal(data.extendedProps.entityType, "task");
  assert.equal(data.extendedProps.taskId, "task-abc");
  assert.equal(data.extendedProps.status, "in_progress");
  assert.equal(data.title, "Ship feature");
  assert.deepEqual(data.classNames, ["task-calendar-event"]);
});

test("calendarTaskDragDurationFromElement uses timed block length when present", () => {
  const el = mockDragElement({
    "data-calendar-task-due-ms": String(Date.UTC(2026, 7, 24, 9, 0)),
    "data-calendar-task-due-end-ms": String(Date.UTC(2026, 7, 24, 10, 30)),
  });
  assert.equal(calendarTaskDragDurationFromElement(el), "1:30");
});

test("calendarTaskDragDurationFromElement defaults to one hour", () => {
  const el = mockDragElement({});
  assert.equal(calendarTaskDragDurationFromElement(el), "1:00");
});

test("minutesToFullCalendarDuration clamps to minimum block", () => {
  assert.equal(minutesToFullCalendarDuration(5), "0:15");
});

test("fullCalendarDurationToMinutes parses drag duration", () => {
  assert.equal(fullCalendarDurationToMinutes("1:30"), 90);
  assert.equal(fullCalendarDurationToMinutes("0:15"), 15);
});
