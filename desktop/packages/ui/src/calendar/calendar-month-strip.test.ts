import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addMonthsDate,
  calendarMonthStripDates,
  CALENDAR_MONTH_STRIP_CENTER_INDEX,
  CALENDAR_MONTH_STRIP_PANE_COUNT,
  formatLocalYm,
  formatMonthAnchorYmd,
  startOfMonthDate,
} from "./calendar-month-strip.js";
import { formatLocalYmd } from "./calendar-week-strip.js";

test("startOfMonthDate clamps to the 1st", () => {
  assert.equal(
    formatLocalYmd(startOfMonthDate(new Date(2026, 8, 15))),
    "2026-09-01",
  );
});

test("calendarMonthStripDates returns a rolling year around the anchor", () => {
  const dates = calendarMonthStripDates(new Date(2026, 8, 15));
  assert.equal(dates.length, CALENDAR_MONTH_STRIP_PANE_COUNT);
  assert.equal(
    formatLocalYmd(dates[CALENDAR_MONTH_STRIP_CENTER_INDEX]!),
    "2026-09-01",
  );
  assert.equal(formatLocalYmd(dates[0]!), "2026-04-01");
  assert.equal(formatLocalYmd(dates[dates.length - 1]!), "2027-03-01");
});

test("addMonthsDate crosses year boundaries", () => {
  assert.equal(
    formatLocalYm(addMonthsDate(new Date(2026, 11, 1), 1)),
    "2027-01",
  );
});

test("formatMonthAnchorYmd normalizes mid-month dates", () => {
  assert.equal(formatMonthAnchorYmd(new Date(2026, 8, 23)), "2026-09-01");
});
