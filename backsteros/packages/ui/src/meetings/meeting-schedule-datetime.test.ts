import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatLocalYmd } from "../tasks/task-due-date.js";
import {
  applyMeetingEndTime,
  applyMeetingScheduleDate,
  applyMeetingStartTime,
  formatLocalHm,
  parseLocalHm,
} from "./meeting-schedule-datetime.js";

describe("meeting-schedule-datetime", () => {
  it("formats and parses local HH:MM", () => {
    const date = new Date(2026, 8, 14, 9, 30, 0, 0);
    assert.equal(formatLocalHm(date), "09:30");
    assert.deepEqual(parseLocalHm("9:30"), { hours: 9, minutes: 30 });
    assert.equal(parseLocalHm("25:00"), null);
  });

  it("moves start/end onto a picked date while preserving times", () => {
    const startAt = new Date(2026, 8, 14, 14, 0, 0, 0);
    const endAt = new Date(2026, 8, 14, 15, 0, 0, 0);
    const next = applyMeetingScheduleDate(startAt, endAt, "2026-09-20");
    assert.ok(next);
    assert.equal(formatLocalYmd(next.startAt), "2026-09-20");
    assert.equal(formatLocalHm(next.startAt), "14:00");
    assert.equal(formatLocalYmd(next.endAt), "2026-09-20");
    assert.equal(formatLocalHm(next.endAt), "15:00");
  });

  it("preserves multi-day span when changing the start date", () => {
    const startAt = new Date(2026, 8, 14, 22, 0, 0, 0);
    const endAt = new Date(2026, 8, 15, 1, 0, 0, 0);
    const next = applyMeetingScheduleDate(startAt, endAt, "2026-09-21");
    assert.ok(next);
    assert.equal(formatLocalYmd(next.startAt), "2026-09-21");
    assert.equal(formatLocalYmd(next.endAt), "2026-09-22");
    assert.equal(formatLocalHm(next.endAt), "01:00");
  });

  it("defaults to 9–10am when picking a date with no schedule", () => {
    const next = applyMeetingScheduleDate(null, null, "2026-09-20");
    assert.ok(next);
    assert.equal(formatLocalHm(next.startAt), "09:00");
    assert.equal(formatLocalHm(next.endAt), "10:00");
  });

  it("keeps end after start when start time moves later", () => {
    const startAt = new Date(2026, 8, 14, 9, 0, 0, 0);
    const endAt = new Date(2026, 8, 14, 10, 0, 0, 0);
    const next = applyMeetingStartTime(startAt, endAt, "10:30");
    assert.ok(next);
    assert.equal(formatLocalHm(next.startAt), "10:30");
    assert.equal(formatLocalHm(next.endAt), "11:30");
  });

  it("bumps end to the next day when end time is before start", () => {
    const startAt = new Date(2026, 8, 14, 22, 0, 0, 0);
    const endAt = new Date(2026, 8, 14, 23, 0, 0, 0);
    const next = applyMeetingEndTime(startAt, endAt, "01:00");
    assert.ok(next);
    assert.equal(formatLocalYmd(next.endAt), "2026-09-15");
    assert.equal(formatLocalHm(next.endAt), "01:00");
  });
});
