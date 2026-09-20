import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calendarDayStripDates,
  CALENDAR_DAY_STRIP_CENTER_INDEX,
  CALENDAR_DAY_STRIP_PANE_COUNT,
  formatCalendarDayStripHeaderLabel,
  startOfLocalDayDate,
} from "./calendar-day-strip.js";
import { formatLocalYmd } from "./calendar-week-strip.js";

test("startOfLocalDayDate zeros the clock", () => {
  assert.equal(
    formatLocalYmd(startOfLocalDayDate(new Date(2026, 8, 15, 14, 30))),
    "2026-09-15",
  );
});

test("calendarDayStripDates returns a week of days around the anchor", () => {
  const dates = calendarDayStripDates(new Date(2026, 8, 15, 9, 0));
  assert.equal(dates.length, CALENDAR_DAY_STRIP_PANE_COUNT);
  assert.equal(
    formatLocalYmd(dates[CALENDAR_DAY_STRIP_CENTER_INDEX]!),
    "2026-09-15",
  );
  assert.equal(formatLocalYmd(dates[0]!), "2026-09-12");
  assert.equal(formatLocalYmd(dates[dates.length - 1]!), "2026-09-18");
});

test("formatCalendarDayStripHeaderLabel includes weekday and date", () => {
  const label = formatCalendarDayStripHeaderLabel(new Date(2026, 8, 19));
  assert.match(label, /Saturday/i);
  assert.match(label, /19/);
});
