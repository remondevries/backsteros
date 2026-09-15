import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatMeetingDisplayId,
  getCalendarMeetingHref,
  getCalendarMeetingOverlayHref,
  MEETING_CURRENT_WEEK_ICON_COLOR,
  MEETING_MUTED_WEEK_ICON_COLOR,
  MEETING_NEXT_WEEK_ICON_COLOR,
  meetingScheduleIconTone,
  parseCalendarMeetingOverlayId,
  parseMeetingDisplayId,
  resolveMeetingListIconColor,
  resolveMeetingScheduleIconColor,
} from "./meetings.js";

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

test("meetingScheduleIconTone buckets by Mon-start week relative to now", () => {
  const now = new Date(2026, 8, 15, 12, 0, 0); // Tue Sep 15 → week of Sep 14
  assert.equal(
    meetingScheduleIconTone("2026-09-10T10:00:00.000Z", { now }),
    "past",
  );
  assert.equal(
    meetingScheduleIconTone("2026-09-15T13:00:00.000Z", { now }),
    "current",
  );
  assert.equal(
    meetingScheduleIconTone("2026-09-22T10:00:00.000Z", { now }),
    "next",
  );
  assert.equal(
    meetingScheduleIconTone("2026-09-29T10:00:00.000Z", { now }),
    "later",
  );
});

test("resolveMeetingScheduleIconColor is red only for today, else gray", () => {
  const now = new Date(2026, 8, 15, 12, 0, 0); // local Tue Sep 15
  assert.equal(
    resolveMeetingScheduleIconColor(new Date(2026, 8, 15, 13, 0, 0), { now }),
    MEETING_CURRENT_WEEK_ICON_COLOR,
  );
  // Same week, not today → gray
  assert.equal(
    resolveMeetingScheduleIconColor(new Date(2026, 8, 16, 10, 0, 0), { now }),
    MEETING_MUTED_WEEK_ICON_COLOR,
  );
  assert.equal(
    resolveMeetingScheduleIconColor(new Date(2026, 8, 22, 10, 0, 0), { now }),
    MEETING_MUTED_WEEK_ICON_COLOR,
  );
  assert.equal(
    resolveMeetingScheduleIconColor(new Date(2026, 8, 10, 10, 0, 0), { now }),
    MEETING_MUTED_WEEK_ICON_COLOR,
  );
});

test("resolveMeetingListIconColor prefers today/gray schedule tone when startAt set", () => {
  const now = new Date(2026, 8, 15, 12, 0, 0);
  assert.equal(
    resolveMeetingListIconColor("ready_to_start", {
      startAt: new Date(2026, 8, 16, 10, 0, 0),
      now,
    }),
    MEETING_MUTED_WEEK_ICON_COLOR,
  );
  assert.equal(
    resolveMeetingListIconColor("ready_to_start", {
      startAt: new Date(2026, 8, 15, 13, 0, 0),
      now,
    }),
    MEETING_CURRENT_WEEK_ICON_COLOR,
  );
});

test("resolveMeetingListIconColor keeps triage orange even with startAt", () => {
  const now = new Date(2026, 8, 15, 12, 0, 0);
  const color = resolveMeetingListIconColor("triage", {
    startAt: "2026-09-15T13:00:00.000Z",
    now,
    colorScheme: "dark",
  });
  assert.notEqual(color, MEETING_CURRENT_WEEK_ICON_COLOR);
  assert.equal(
    color,
    resolveMeetingListIconColor("triage", { colorScheme: "dark" }),
  );
});
