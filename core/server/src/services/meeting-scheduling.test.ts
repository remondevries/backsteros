import assert from "node:assert/strict";
import test from "node:test";

import {
  expandInterval,
  generateSlotsForRange,
  intervalsOverlap,
  isoWeekdayInTimeZone,
  parseTimeToMinutes,
  zonedLocalToUtc,
} from "./meeting-scheduling-slots.js";

test("parseTimeToMinutes accepts HH:mm", () => {
  assert.equal(parseTimeToMinutes("09:00"), 540);
  assert.equal(parseTimeToMinutes("17:30"), 1050);
  assert.equal(parseTimeToMinutes("25:00"), null);
});

test("intervalsOverlap detects partial overlap", () => {
  assert.equal(intervalsOverlap(0, 60, 30, 90), true);
  assert.equal(intervalsOverlap(0, 30, 30, 60), false);
  assert.equal(intervalsOverlap(0, 30, 60, 90), false);
});

test("expandInterval pads both sides", () => {
  const expanded = expandInterval({ startMs: 1000, endMs: 2000 }, 15);
  assert.equal(expanded.startMs, 1000 - 15 * 60_000);
  assert.equal(expanded.endMs, 2000 + 15 * 60_000);
});

test("zonedLocalToUtc maps Amsterdam wall clock to UTC", () => {
  const winter = zonedLocalToUtc("2026-01-15", 9, 0, "Europe/Amsterdam");
  assert.ok(winter);
  assert.equal(winter.toISOString(), "2026-01-15T08:00:00.000Z");

  const summer = zonedLocalToUtc("2026-08-15", 9, 0, "Europe/Amsterdam");
  assert.ok(summer);
  assert.equal(summer.toISOString(), "2026-08-15T07:00:00.000Z");
});

test("isoWeekdayInTimeZone returns Monday for a known Monday", () => {
  const monday = new Date("2026-08-24T12:00:00.000Z");
  assert.equal(isoWeekdayInTimeZone(monday, "Europe/Amsterdam"), 1);
});

test("generateSlotsForRange skips weekends and busy blocks", () => {
  const settings = {
    label: "Book",
    timezone: "Europe/Amsterdam",
    weekdayHours: [
      {
        weekday: 1,
        enabled: true,
        slots: [{ start: "09:00", end: "10:00" }],
      },
      { weekday: 2, enabled: false, slots: [{ start: "09:00", end: "17:00" }] },
      { weekday: 3, enabled: false, slots: [{ start: "09:00", end: "17:00" }] },
      { weekday: 4, enabled: false, slots: [{ start: "09:00", end: "17:00" }] },
      { weekday: 5, enabled: false, slots: [{ start: "09:00", end: "17:00" }] },
      { weekday: 6, enabled: false, slots: [{ start: "09:00", end: "17:00" }] },
      { weekday: 7, enabled: false, slots: [{ start: "09:00", end: "17:00" }] },
    ],
    durationsMinutes: [30] as (30 | 60)[],
    minNoticeMinutes: 0,
    bufferMinutes: 0,
    horizonDays: 7,
    enabled: true,
  };

  const mondayNine = zonedLocalToUtc("2026-08-24", 9, 0, "Europe/Amsterdam");
  assert.ok(mondayNine);

  const slots = generateSlotsForRange({
    settings,
    from: new Date("2026-08-24T00:00:00.000Z"),
    to: new Date("2026-08-25T00:00:00.000Z"),
    durationMinutes: 30,
    busyIntervals: [
      {
        startMs: mondayNine.getTime(),
        endMs: mondayNine.getTime() + 30 * 60_000,
      },
    ],
    now: new Date("2026-08-23T00:00:00.000Z"),
  });

  assert.equal(slots.length, 1);
  assert.equal(slots[0]?.startAt, new Date(mondayNine.getTime() + 30 * 60_000).toISOString());
});
