import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatMeetingDisplayId,
  getCalendarMeetingHref,
  getCalendarMeetingOverlayHref,
  parseCalendarMeetingOverlayId,
  parseMeetingDisplayId,
} from "../dist/meetings.js";

test("formatMeetingDisplayId uses M prefix", () => {
  assert.equal(formatMeetingDisplayId(1), "M-1");
  assert.equal(formatMeetingDisplayId(42), "M-42");
});

test("parseMeetingDisplayId parses M-n ids", () => {
  assert.equal(parseMeetingDisplayId("M-1"), 1);
  assert.equal(parseMeetingDisplayId("m-12"), 12);
  assert.equal(parseMeetingDisplayId("E-1"), null);
});

test("parseCalendarMeetingOverlayId reads meeting query param", () => {
  assert.equal(
    parseCalendarMeetingOverlayId("meeting=abc-123"),
    "abc-123",
  );
  assert.equal(
    parseCalendarMeetingOverlayId("?meeting=abc-123"),
    "abc-123",
  );
  assert.equal(parseCalendarMeetingOverlayId(""), null);
});

test("meeting href helpers split overlay vs full page", () => {
  assert.equal(
    getCalendarMeetingOverlayHref("abc"),
    "/calendar?meeting=abc",
  );
  assert.equal(
    getCalendarMeetingHref("abc"),
    "/calendar/meetings/abc",
  );
});
