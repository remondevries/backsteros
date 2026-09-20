import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildTaskDueDatePatch,
  parseCalendarMeetingOverlayLayout,
  withCalendarMeetingSearch,
} from "./calendar-meeting-overlay.js";

test("buildTaskDueDatePatch clears dueEndDate when dueDate is cleared", () => {
  assert.deepEqual(buildTaskDueDatePatch(null), {
    dueDate: null,
    dueEndDate: null,
  });
});

test("buildTaskDueDatePatch leaves dueEndDate unset when setting a start only", () => {
  const patch = buildTaskDueDatePatch("2026-08-24T09:00:00.000Z");
  assert.equal(patch.dueDate, "2026-08-24T09:00:00.000Z");
  assert.equal(patch.dueEndDate, undefined);
});

test("withCalendarMeetingSearch preserves page layout when switching meetings", () => {
  const href = withCalendarMeetingSearch(
    "meeting-b",
    "?view=week&meeting=meeting-a&meetingLayout=page",
  );
  assert.equal(
    href,
    "/calendar?view=week&meeting=meeting-b&meetingLayout=page",
  );
});

test("withCalendarMeetingSearch defaults to panel when no layout in search", () => {
  assert.equal(
    withCalendarMeetingSearch("meeting-b", "?view=week&meeting=meeting-a"),
    "/calendar?view=week&meeting=meeting-b",
  );
});

test("withCalendarMeetingSearch honors explicit layout override", () => {
  assert.equal(
    withCalendarMeetingSearch(
      "meeting-b",
      "?meeting=meeting-a&meetingLayout=page",
      "panel",
    ),
    "/calendar?meeting=meeting-b",
  );
  assert.equal(
    parseCalendarMeetingOverlayLayout(
      withCalendarMeetingSearch(
        "meeting-b",
        "?meeting=meeting-a",
        "page",
      ).split("?")[1] ?? "",
    ),
    "page",
  );
});
