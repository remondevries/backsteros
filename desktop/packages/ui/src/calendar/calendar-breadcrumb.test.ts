import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCalendarBreadcrumbItems } from "./calendar-breadcrumb.js";
import {
  buildCalendarViewHref,
  getCalendarViewModeLabel,
  parseCalendarViewModeParam,
  readCalendarViewModeFromSearch,
  withCalendarViewSearch,
} from "./calendar-view-modes.js";

test("getCalendarViewModeLabel returns view labels", () => {
  assert.equal(getCalendarViewModeLabel("month"), "Month");
  assert.equal(getCalendarViewModeLabel("week"), "Week");
  assert.equal(getCalendarViewModeLabel("day"), "Day");
  assert.equal(getCalendarViewModeLabel("list"), "List");
});

test("parseCalendarViewModeParam falls back to week", () => {
  assert.equal(parseCalendarViewModeParam("month"), "month");
  assert.equal(parseCalendarViewModeParam("invalid"), "week");
  assert.equal(parseCalendarViewModeParam(null), "week");
});

test("buildCalendarViewHref encodes view and extra params", () => {
  assert.equal(buildCalendarViewHref("week"), "/calendar");
  assert.equal(buildCalendarViewHref("month"), "/calendar?view=month");
  assert.equal(
    buildCalendarViewHref("day", { meeting: "abc" }),
    "/calendar?view=day&meeting=abc",
  );
});

test("readCalendarViewModeFromSearch reads view query param", () => {
  assert.equal(readCalendarViewModeFromSearch("?view=list"), "list");
  assert.equal(readCalendarViewModeFromSearch(""), "week");
});

test("withCalendarViewSearch preserves unrelated params", () => {
  assert.equal(
    withCalendarViewSearch("/calendar/tasks/1", "?meeting=abc", "month"),
    "/calendar/tasks/1?meeting=abc&view=month",
  );
});

test("buildCalendarBreadcrumbItems includes view and detail labels", () => {
  assert.deepEqual(buildCalendarBreadcrumbItems({ viewMode: "month" }), [
    { label: "Calendar", href: "/calendar" },
    { label: "Month", href: "/calendar?view=month" },
  ]);
  assert.deepEqual(
    buildCalendarBreadcrumbItems({
      viewMode: "week",
      rangeTitle: "Aug 17 – 23, 2026",
    }),
    [
      { label: "Calendar", href: "/calendar" },
      { label: "Aug 17 – 23, 2026", href: "/calendar" },
    ],
  );
  assert.deepEqual(
    buildCalendarBreadcrumbItems({
      viewMode: "week",
      detailLabel: "BSH-3 Fix calendar",
    }),
    [
      { label: "Calendar", href: "/calendar" },
      { label: "Week", href: "/calendar" },
      { label: "BSH-3 Fix calendar" },
    ],
  );
});

test("buildCalendarBreadcrumbItems for availability mode", () => {
  assert.deepEqual(
    buildCalendarBreadcrumbItems({
      viewMode: "week",
      pageMode: "availability",
      rangeTitle: "Aug 17 – 23, 2026",
    }),
    [
      { label: "Calendar", href: "/calendar" },
      { label: "Aug 17 – 23, 2026", href: "/calendar" },
      {
        label: "Availability",
        href: "/calendar?mode=availability",
      },
    ],
  );
});

test("buildCalendarBreadcrumbItems for timetracking mode", () => {
  assert.deepEqual(
    buildCalendarBreadcrumbItems({
      viewMode: "week",
      pageMode: "timetracking",
      rangeTitle: "Aug 17 – 23, 2026",
    }),
    [
      { label: "Calendar", href: "/calendar" },
      { label: "Aug 17 – 23, 2026", href: "/calendar" },
      {
        label: "Timetracking",
        href: "/calendar?mode=timetracking",
      },
    ],
  );
});
