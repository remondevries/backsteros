import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatLocalYmd,
  getTaskDueDateYmd,
  parseYmdLocal,
} from "./task-due-date.js";

test("formatLocalYmd pads month and day", () => {
  assert.equal(formatLocalYmd(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(formatLocalYmd(new Date(2026, 11, 31)), "2026-12-31");
});

test("parseYmdLocal accepts valid YMD and rejects junk", () => {
  const parsed = parseYmdLocal("2026-08-26");
  assert.ok(parsed);
  assert.equal(parsed.getFullYear(), 2026);
  assert.equal(parsed.getMonth(), 7);
  assert.equal(parsed.getDate(), 26);

  assert.equal(parseYmdLocal("2026-13-01"), null);
  assert.equal(parseYmdLocal("not-a-date"), null);
  assert.equal(parseYmdLocal("2026-08-26T12:00:00Z"), null);
});

test("getTaskDueDateYmd keeps bare YMD strings", () => {
  assert.equal(getTaskDueDateYmd("2026-08-26"), "2026-08-26");
  assert.equal(getTaskDueDateYmd(" 2026-08-26 "), "2026-08-26");
});

test("getTaskDueDateYmd formats Date / epoch / ISO with local calendar", () => {
  const local = new Date(2026, 7, 26, 15, 30);
  assert.equal(getTaskDueDateYmd(local), "2026-08-26");
  assert.equal(getTaskDueDateYmd(local.getTime()), "2026-08-26");
  assert.equal(getTaskDueDateYmd(null), null);
  assert.equal(getTaskDueDateYmd("not-a-date"), null);
});

test("getTaskDueDateYmd accepts PowerSync/Postgres timestamp text", () => {
  assert.equal(
    getTaskDueDateYmd("2026-09-05 22:00:00+00", "Europe/Amsterdam"),
    "2026-09-06",
  );
  assert.equal(
    getTaskDueDateYmd("2026-09-05 22:00:00+00:00", "Europe/Amsterdam"),
    "2026-09-06",
  );
});

test("getTaskDueDateYmd respects optional timeZone", () => {
  // 2026-08-26T22:00:00Z is still 26 Aug in UTC, but 27 Aug in Tokyo.
  const utcEvening = new Date("2026-08-26T22:00:00.000Z");
  assert.equal(getTaskDueDateYmd(utcEvening, "UTC"), "2026-08-26");
  assert.equal(getTaskDueDateYmd(utcEvening, "Asia/Tokyo"), "2026-08-27");
});

test("getTaskDueDateYmd reuses timezone formatter across many calls", () => {
  const utcEvening = new Date("2026-08-26T22:00:00.000Z");
  for (let i = 0; i < 200; i += 1) {
    assert.equal(getTaskDueDateYmd(utcEvening, "UTC"), "2026-08-26");
    assert.equal(getTaskDueDateYmd(utcEvening, "Asia/Tokyo"), "2026-08-27");
  }
});
