import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCalendarPageHref,
  DEFAULT_CALENDAR_PAGE_MODE,
  parseCalendarPageModeParam,
  readCalendarPageModeFromSearch,
  resolveCalendarPageModeFromShortcutKey,
} from "./calendar-page-mode.js";

test("DEFAULT_CALENDAR_PAGE_MODE is calendar grid", () => {
  assert.equal(DEFAULT_CALENDAR_PAGE_MODE, "calendar");
});

test("parseCalendarPageModeParam falls back to calendar", () => {
  assert.equal(parseCalendarPageModeParam("calendar"), "calendar");
  assert.equal(parseCalendarPageModeParam("meetings"), "calendar");
  assert.equal(parseCalendarPageModeParam("timetracking"), "timetracking");
  assert.equal(parseCalendarPageModeParam("availability"), "availability");
  assert.equal(parseCalendarPageModeParam("invalid"), "calendar");
  assert.equal(parseCalendarPageModeParam(null), "calendar");
});

test("buildCalendarPageHref omits default calendar mode", () => {
  assert.equal(buildCalendarPageHref(), "/calendar");
  assert.equal(buildCalendarPageHref({ pageMode: "calendar" }), "/calendar");
  assert.equal(
    buildCalendarPageHref({ pageMode: "timetracking" }),
    "/calendar?mode=timetracking",
  );
  assert.equal(
    buildCalendarPageHref({ pageMode: "availability", viewMode: "month" }),
    "/calendar?view=month&mode=availability",
  );
});

test("readCalendarPageModeFromSearch reads mode query param", () => {
  assert.equal(readCalendarPageModeFromSearch(""), "calendar");
  assert.equal(readCalendarPageModeFromSearch("?mode=meetings"), "calendar");
  assert.equal(
    readCalendarPageModeFromSearch("?mode=timetracking"),
    "timetracking",
  );
  assert.equal(
    readCalendarPageModeFromSearch("?mode=availability"),
    "availability",
  );
});

test("resolveCalendarPageModeFromShortcutKey maps digit keys to page modes", () => {
  assert.equal(resolveCalendarPageModeFromShortcutKey("1"), "calendar");
  assert.equal(resolveCalendarPageModeFromShortcutKey("2"), "timetracking");
  assert.equal(resolveCalendarPageModeFromShortcutKey("3"), "availability");
  assert.equal(resolveCalendarPageModeFromShortcutKey("4"), null);
  assert.equal(
    resolveCalendarPageModeFromShortcutKey("1", { metaKey: true }),
    null,
  );
});
