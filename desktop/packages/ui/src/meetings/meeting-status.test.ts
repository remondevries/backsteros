import assert from "node:assert/strict";
import { test } from "node:test";

import {
  deriveMeetingStatusForSchedule,
  isPastCompletedMeeting,
  meetingStatusNeedsReconcile,
  resolveMeetingEffectiveStatus,
} from "../../dist/meetings/meeting-status.js";

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

test("resolveMeetingEffectiveStatus derives from schedule", () => {
  const meeting = {
    status: "on_hold",
    startAt: "2026-08-23T14:00:00.000Z",
    endAt: "2026-08-23T15:00:00.000Z",
  };
  const now = new Date("2026-08-23T14:30:00.000Z");
  assert.equal(resolveMeetingEffectiveStatus(meeting, now), "in_progress");
});

test("resolveMeetingEffectiveStatus keeps manual workflow statuses", () => {
  const meeting = {
    status: "canceled",
    startAt: "2026-08-23T14:00:00.000Z",
    endAt: "2026-08-23T15:00:00.000Z",
  };
  const now = new Date("2026-08-23T14:30:00.000Z");
  assert.equal(resolveMeetingEffectiveStatus(meeting, now), "canceled");
});

test("meetingStatusNeedsReconcile returns next status when stale", () => {
  const meeting = {
    status: "on_hold",
    startAt: "2026-08-23T14:00:00.000Z",
    endAt: "2026-08-23T15:00:00.000Z",
  };
  const now = new Date("2026-08-23T14:30:00.000Z");
  assert.equal(meetingStatusNeedsReconcile(meeting, now), "in_progress");
});

test("incoming triage bookings stay in triage until reviewed", () => {
  const meeting = {
    status: "triage",
    startAt: "2026-08-23T14:00:00.000Z",
    endAt: "2026-08-23T15:00:00.000Z",
  };
  const now = new Date("2026-08-23T14:30:00.000Z");
  assert.equal(resolveMeetingEffectiveStatus(meeting, now), "triage");
  assert.equal(meetingStatusNeedsReconcile(meeting, now), null);
});

test("isPastCompletedMeeting is true only when ended and completed", () => {
  const now = new Date("2026-08-23T16:00:00.000Z");
  const meeting = {
    status: "completed",
    endAt: "2026-08-23T15:00:00.000Z",
  };
  assert.equal(isPastCompletedMeeting(meeting, now), true);
  assert.equal(
    isPastCompletedMeeting({ ...meeting, status: "in_progress" }, now),
    false,
  );
  assert.equal(
    isPastCompletedMeeting(
      { ...meeting, endAt: "2026-08-23T17:00:00.000Z" },
      now,
    ),
    false,
  );
});
