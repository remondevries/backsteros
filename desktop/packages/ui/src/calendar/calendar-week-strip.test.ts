import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addDaysDate,
  calendarWeekStripAnchorShiftWeeks,
  calendarWeekStripDates,
  calendarWeekStripPaneIndex,
  CALENDAR_WEEK_STRIP_CENTER_INDEX,
  CALENDAR_WEEK_STRIP_PANE_COUNT,
  formatLocalYmd,
  startOfWeekMondayDate,
} from "./calendar-week-strip.js";

test("startOfWeekMondayDate uses Monday start", () => {
  assert.equal(
    formatLocalYmd(startOfWeekMondayDate(new Date(2026, 8, 16))),
    "2026-09-14",
  );
  assert.equal(
    formatLocalYmd(startOfWeekMondayDate(new Date(2026, 8, 20))),
    "2026-09-14",
  );
});

test("calendarWeekStripDates returns panes around the anchor Monday", () => {
  const dates = calendarWeekStripDates(new Date(2026, 8, 16));
  assert.equal(dates.length, CALENDAR_WEEK_STRIP_PANE_COUNT);
  assert.equal(
    formatLocalYmd(dates[CALENDAR_WEEK_STRIP_CENTER_INDEX]!),
    "2026-09-14",
  );
  assert.equal(formatLocalYmd(dates[0]!), "2026-08-31");
  assert.equal(formatLocalYmd(dates[dates.length - 1]!), "2026-09-28");
});

test("calendarWeekStripPaneIndex snaps to nearest pane", () => {
  assert.equal(calendarWeekStripPaneIndex(0, 400), 0);
  assert.equal(calendarWeekStripPaneIndex(800, 400), 2);
  assert.equal(calendarWeekStripPaneIndex(1600, 400), 4);
});

test("calendarWeekStripAnchorShiftWeeks maps pane to week delta", () => {
  assert.equal(calendarWeekStripAnchorShiftWeeks(0), -2);
  assert.equal(calendarWeekStripAnchorShiftWeeks(2), 0);
  assert.equal(calendarWeekStripAnchorShiftWeeks(4), 2);
});

test("addDaysDate shifts calendar days", () => {
  assert.equal(
    formatLocalYmd(addDaysDate(new Date(2026, 8, 14), 7)),
    "2026-09-21",
  );
});
