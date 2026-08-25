import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCalendarSidePanelKeyboardItemIds,
  calendarSidePanelMeetingItemId,
  calendarSidePanelTaskItemId,
  getSelectedCalendarSidePanelItemId,
  parseCalendarSidePanelKeyboardItemId,
} from "../../dist/calendar/calendar-side-panel-keyboard.js";

test("calendar side panel keyboard ids are prefixed", () => {
  assert.equal(calendarSidePanelMeetingItemId("m1"), "meeting:m1");
  assert.equal(calendarSidePanelTaskItemId("t1"), "task:t1");
});

test("getSelectedCalendarSidePanelItemId reads task path, meeting route, and meeting overlay", () => {
  assert.equal(
    getSelectedCalendarSidePanelItemId("/calendar/tasks/abc", ""),
    "task:abc",
  );
  assert.equal(
    getSelectedCalendarSidePanelItemId("/calendar/meetings/meet-1", ""),
    "meeting:meet-1",
  );
  assert.equal(
    getSelectedCalendarSidePanelItemId("/calendar", "?meeting=meet-1"),
    "meeting:meet-1",
  );
  assert.equal(getSelectedCalendarSidePanelItemId("/calendar", ""), null);
});

test("buildCalendarSidePanelKeyboardItemIds respects collapsed groups and meeting order", () => {
  const ids = buildCalendarSidePanelKeyboardItemIds({
    meetings: [
      { id: "m2", startAt: "2026-08-24T10:00:00.000Z", number: 2 },
      { id: "m1", startAt: "2026-08-23T10:00:00.000Z", number: 1 },
    ],
    tasks: [{ id: "t1" }],
    meetingsCollapsed: false,
    tasksCollapsed: true,
  });
  assert.deepEqual(ids, ["meeting:m1", "meeting:m2"]);
});

test("buildCalendarSidePanelKeyboardItemIds lists inbox triage meetings before scheduled meetings", () => {
  const ids = buildCalendarSidePanelKeyboardItemIds({
    meetings: [
      {
        id: "scheduled",
        status: "on_hold",
        startAt: "2026-08-22T10:00:00.000Z",
        number: 1,
      },
      {
        id: "triage",
        status: "triage",
        startAt: "2026-08-25T10:00:00.000Z",
        number: 2,
      },
    ],
    tasks: [],
    meetingsCollapsed: false,
    tasksCollapsed: false,
  });
  assert.deepEqual(ids, ["meeting:triage", "meeting:scheduled"]);
});

test("parseCalendarSidePanelKeyboardItemId returns entity kind", () => {
  assert.deepEqual(parseCalendarSidePanelKeyboardItemId("meeting:m1"), {
    kind: "meeting",
    entityId: "m1",
  });
  assert.deepEqual(parseCalendarSidePanelKeyboardItemId("task:t1"), {
    kind: "task",
    entityId: "t1",
  });
  assert.equal(parseCalendarSidePanelKeyboardItemId("other"), null);
});
