import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveMeetingStatusForSchedule,
  EXTERNAL_MEETING_BOOKING_STATUS,
  isIncomingMeetingStatus,
  isManualMeetingStatus,
} from "./meetings-status.js";

test("deriveMeetingStatusForSchedule returns on_hold before start", () => {
  const start = new Date("2026-08-23T14:00:00.000Z");
  const end = new Date("2026-08-23T15:00:00.000Z");
  const now = new Date("2026-08-23T13:00:00.000Z");
  assert.equal(deriveMeetingStatusForSchedule(start, end, now), "on_hold");
});

test("deriveMeetingStatusForSchedule returns in_progress during meeting", () => {
  const start = new Date("2026-08-23T14:00:00.000Z");
  const end = new Date("2026-08-23T15:00:00.000Z");
  const now = new Date("2026-08-23T14:30:00.000Z");
  assert.equal(deriveMeetingStatusForSchedule(start, end, now), "in_progress");
});

test("deriveMeetingStatusForSchedule returns completed after end", () => {
  const start = new Date("2026-08-23T14:00:00.000Z");
  const end = new Date("2026-08-23T15:00:00.000Z");
  const now = new Date("2026-08-23T15:01:00.000Z");
  assert.equal(deriveMeetingStatusForSchedule(start, end, now), "completed");
});

test("isManualMeetingStatus identifies workflow-only statuses", () => {
  assert.equal(isManualMeetingStatus("on_hold"), false);
  assert.equal(isManualMeetingStatus("in_review"), true);
  assert.equal(isManualMeetingStatus("canceled"), true);
  assert.equal(isManualMeetingStatus("in_progress"), false);
  assert.equal(isManualMeetingStatus("completed"), false);
});

test("portal bookings use triage as the incoming status", () => {
  assert.equal(EXTERNAL_MEETING_BOOKING_STATUS, "triage");
  assert.equal(isIncomingMeetingStatus("triage"), true);
  assert.equal(isIncomingMeetingStatus("on_hold"), false);
});
