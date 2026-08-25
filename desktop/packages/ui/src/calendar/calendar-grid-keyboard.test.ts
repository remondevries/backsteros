import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCalendarDayColumnNavIds,
  buildCalendarEventKeyboardGrid,
  calendarMoreLinkItemId,
  getSelectedCalendarGridEventId,
  parseCalendarMoreLinkItemId,
  resolveCalendarGridKeyboardNextItemId,
} from "../../dist/calendar/calendar-grid-keyboard.js";
import { stepBoardTaskId } from "../../dist/list-nav/board-keyboard-nav.js";
import type { TaskCalendarEvent } from "../../dist/calendar/calendar-events.js";

const rangeStart = new Date(2026, 7, 18);
const rangeEnd = new Date(2026, 7, 25);

test("getSelectedCalendarGridEventId reads task and meeting selections", () => {
  assert.equal(
    getSelectedCalendarGridEventId("/calendar/tasks/task-1", ""),
    "task-1",
  );
  assert.equal(
    getSelectedCalendarGridEventId("/calendar", "?task=task-2"),
    "task-2",
  );
  assert.equal(
    getSelectedCalendarGridEventId("/calendar", "?meeting=meet-1"),
    "meeting:meet-1",
  );
});

test("calendarMoreLinkItemId round-trips through parseCalendarMoreLinkItemId", () => {
  assert.equal(calendarMoreLinkItemId("2026-08-23"), "more:2026-08-23");
  assert.equal(
    parseCalendarMoreLinkItemId("more:2026-08-23"),
    "2026-08-23",
  );
  assert.equal(parseCalendarMoreLinkItemId("task-1"), null);
});

test("buildCalendarEventKeyboardGrid groups events by day with all-day first", () => {
  const events: TaskCalendarEvent[] = [
    {
      id: "timed",
      title: "Timed",
      start: new Date(2026, 7, 20, 10, 0).toISOString(),
      allDay: false,
      classNames: [],
      extendedProps: { entityType: "task", taskId: "timed", status: "ready_to_start" },
    },
    {
      id: "allday",
      title: "All day",
      start: "2026-08-20",
      allDay: true,
      classNames: [],
      extendedProps: { entityType: "task", taskId: "allday", status: "ready_to_start" },
    },
  ];

  const grid = buildCalendarEventKeyboardGrid(events, rangeStart, rangeEnd);
  const wednesday = grid[2];
  assert.deepEqual(wednesday, ["allday", "timed"]);
});

test("buildCalendarDayColumnNavIds orders visible all-day, more link, then timed", () => {
  assert.deepEqual(
    buildCalendarDayColumnNavIds({
      visibleAllDayIds: ["a", "b", "c", "d"],
      moreLinkYmd: "2026-08-23",
      popoverAllDayIds: [],
      popoverOpen: false,
      timedIds: ["timed-1", "timed-2"],
    }),
    [
      "a",
      "b",
      "c",
      "d",
      calendarMoreLinkItemId("2026-08-23"),
      "timed-1",
      "timed-2",
    ],
  );
});

test("buildCalendarDayColumnNavIds uses popover overflow list when open", () => {
  assert.deepEqual(
    buildCalendarDayColumnNavIds({
      visibleAllDayIds: ["a", "b", "c", "d"],
      moreLinkYmd: "2026-08-23",
      popoverAllDayIds: ["e", "f", "g"],
      popoverOpen: true,
      timedIds: ["timed-1"],
    }),
    ["e", "f", "g", "timed-1"],
  );
});

test("stepBoardTaskId moves down from more link to timed events", () => {
  const grid = [["allday-1", calendarMoreLinkItemId("2026-08-23"), "timed-1"]];
  assert.equal(
    stepBoardTaskId(grid, calendarMoreLinkItemId("2026-08-23"), "down"),
    "timed-1",
  );
});

test("resolveCalendarGridKeyboardNextItemId moves across day columns with h/l", () => {
  const events: TaskCalendarEvent[] = [
    {
      id: "mon",
      title: "Mon",
      start: "2026-08-18",
      allDay: true,
      classNames: [],
      extendedProps: { entityType: "task", taskId: "mon", status: "ready_to_start" },
    },
    {
      id: "tue",
      title: "Tue",
      start: "2026-08-19",
      allDay: true,
      classNames: [],
      extendedProps: { entityType: "task", taskId: "tue", status: "ready_to_start" },
    },
  ];

  assert.equal(
    resolveCalendarGridKeyboardNextItemId({
      key: "l",
      currentId: "mon",
      events,
      rangeStart,
      rangeEnd,
      viewMode: "week",
    }),
    "tue",
  );
});
