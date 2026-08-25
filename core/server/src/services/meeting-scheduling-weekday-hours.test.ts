import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_WEEKDAY_HOURS,
  legacyWorkingHoursToWeekdayHours,
  normalizeWeekdayHours,
  normalizeWeekdayHoursEntry,
} from "./meeting-scheduling-weekday-hours.js";

test("legacyWorkingHoursToWeekdayHours maps weekdays and times", () => {
  const result = legacyWorkingHoursToWeekdayHours({
    weekdays: [1, 3, 5],
    start: "10:00",
    end: "16:00",
  });
  assert.equal(result.length, 7);
  assert.equal(result[0]?.enabled, true);
  assert.equal(result[0]?.slots[0]?.start, "10:00");
  assert.equal(result[1]?.enabled, false);
  assert.equal(result[2]?.enabled, true);
});

test("normalizeWeekdayHours falls back to defaults when input empty", () => {
  const result = normalizeWeekdayHours(null);
  assert.deepEqual(result, DEFAULT_WEEKDAY_HOURS);
});

test("normalizeWeekdayHoursEntry migrates legacy start/end to slots", () => {
  const result = normalizeWeekdayHoursEntry(
    { weekday: 2, enabled: true, start: "08:00", end: "12:00" },
    2,
  );
  assert.deepEqual(result.slots, [{ start: "08:00", end: "12:00" }]);
});

test("normalizeWeekdayHours merges slots input", () => {
  const result = normalizeWeekdayHours([
    {
      weekday: 2,
      enabled: true,
      slots: [
        { start: "08:00", end: "12:00" },
        { start: "13:00", end: "17:00" },
      ],
    },
  ]);
  assert.equal(result[1]?.slots.length, 2);
  assert.equal(result[0]?.slots[0]?.start, "09:00");
});

test("normalizeWeekdayHours ignores invalid slots", () => {
  const result = normalizeWeekdayHours([
    {
      weekday: 1,
      enabled: true,
      slots: [{ start: "17:00", end: "09:00" }],
    },
    {
      weekday: 2,
      enabled: true,
      slots: [{ start: "08:00", end: "12:00" }],
    },
  ]);
  assert.equal(result[0]?.slots[0]?.start, "09:00");
  assert.equal(result[1]?.slots[0]?.start, "08:00");
});
