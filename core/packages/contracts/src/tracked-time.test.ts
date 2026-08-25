import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatTrackedDuration,
  formatTrackedMinutes,
  formatTrackedTimeInput,
  parseTrackedTimeInput,
  resolveTrackedDurationSeconds,
  resolveTrackedMinutes,
  trackedDurationSecondsFromElapsed,
  trackedMinutesFromDurationSeconds,
  trackedMinutesFromMeetingSchedule,
  trackedMinutesFromTaskSchedule,
} from "./tracked-time.js";

test("formatTrackedMinutes and parseTrackedTimeInput round-trip", () => {
  assert.equal(formatTrackedMinutes(90), "01:30");
  assert.equal(parseTrackedTimeInput("01:30"), 90 * 60);
  assert.equal(parseTrackedTimeInput("01:30:45"), 5445);
  assert.equal(formatTrackedTimeInput(5445), "01:30:45");
  assert.equal(parseTrackedTimeInput(""), null);
  assert.equal(parseTrackedTimeInput("99:99"), null);
  assert.equal(parseTrackedTimeInput("00:00:45"), 45);
});

test("trackedMinutesFromTaskSchedule uses timed calendar blocks", () => {
  const start = new Date(2026, 7, 24, 10, 0);
  const end = new Date(2026, 7, 24, 11, 30);
  assert.equal(trackedMinutesFromTaskSchedule(start, end), 90);
  assert.equal(trackedMinutesFromTaskSchedule(start, null), null);
});

test("resolveTrackedMinutes prefers stored value over schedule", () => {
  assert.equal(
    resolveTrackedMinutes({ trackedMinutes: 45, scheduleMinutes: 90 }),
    45,
  );
  assert.equal(
    resolveTrackedMinutes({ trackedMinutes: null, scheduleMinutes: 90 }),
    90,
  );
});

test("resolveTrackedDurationSeconds prefers precise seconds", () => {
  assert.equal(
    resolveTrackedDurationSeconds({
      trackedDurationSeconds: 45,
      trackedMinutes: 90,
      scheduleMinutes: 120,
    }),
    45,
  );
  assert.equal(
    resolveTrackedDurationSeconds({
      trackedDurationSeconds: null,
      trackedMinutes: 2,
      scheduleMinutes: 120,
    }),
    120,
  );
});

test("trackedMinutesFromMeetingSchedule", () => {
  const start = new Date(2026, 7, 24, 8, 0);
  const end = new Date(2026, 7, 24, 9, 0);
  assert.equal(trackedMinutesFromMeetingSchedule(start, end), 60);
});

test("formatTrackedDuration and tracked duration persistence", () => {
  assert.equal(formatTrackedDuration(3661), "01:01:01");
  assert.equal(trackedDurationSecondsFromElapsed(45), 45);
  assert.equal(trackedDurationSecondsFromElapsed(0), null);
  assert.equal(trackedMinutesFromDurationSeconds(90), 2);
  assert.equal(trackedMinutesFromDurationSeconds(0), null);
});
