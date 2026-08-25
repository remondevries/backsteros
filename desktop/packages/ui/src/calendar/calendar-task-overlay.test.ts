import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getCalendarTaskOverlayHref,
  parseCalendarTaskOverlayId,
} from "../../dist/calendar/calendar-task-overlay.js";

test("parseCalendarTaskOverlayId reads task overlay search param", () => {
  assert.equal(parseCalendarTaskOverlayId("?task=task-1"), "task-1");
  assert.equal(parseCalendarTaskOverlayId(""), null);
});

test("getCalendarTaskOverlayHref builds calendar task overlay link", () => {
  assert.equal(
    getCalendarTaskOverlayHref("abc"),
    "/calendar?task=abc",
  );
  assert.equal(
    getCalendarTaskOverlayHref("abc", "month"),
    "/calendar?view=month&task=abc",
  );
});
