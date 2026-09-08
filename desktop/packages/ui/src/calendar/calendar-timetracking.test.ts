import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildTimetrackingDayGroups,
  readTimetrackingPeriodFromSearch,
} from "./calendar-timetracking-days.js";
import {
  collectTimetrackingEntries,
  formatTimetrackingLeadingStamp,
  withLiveTimetrackingEntries,
} from "./calendar-timetracking-entries.js";

test("buildTimetrackingDayGroups nests days under weeks and months", () => {
  const groups = buildTimetrackingDayGroups({
    endYmd: "2026-08-25",
    monthsBack: 1,
    todayYmd: "2026-08-25",
  });
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.monthKey, "2026-08");
  assert.equal(groups[0]?.monthLabel, "August 2026");
  assert.ok((groups[0]?.weeks.length ?? 0) > 0);
  const firstDay = groups[0]?.weeks[0]?.days[0];
  assert.equal(firstDay?.ymd, "2026-08-25");
  assert.equal(firstDay?.label, "Tue 25 Aug 2026");
  assert.equal(firstDay?.isToday, true);
});

test("collectTimetrackingEntries keeps only positive tracked totals", () => {
  const entries = collectTimetrackingEntries({
    tasks: [
      {
        id: "t1",
        title: "Ship",
        displayId: "BSH-1",
        trackedDurationSeconds: 90,
        scheduleAt: "2026-08-25",
      },
      {
        id: "t2",
        title: "Skip",
        trackedDurationSeconds: 0,
        scheduleAt: "2026-08-25",
      },
    ],
    meetings: [
      {
        id: "m1",
        title: "Sync",
        displayId: "M-1",
        trackedDurationSeconds: 3600,
        scheduleAt: "2026-08-25T10:00:00.000Z",
      },
    ],
  });
  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["m1", "t1"],
  );
});

test("collectTimetrackingEntries filters by schedule day when selected", () => {
  const entries = collectTimetrackingEntries({
    selectedDateYmd: "2026-08-25",
    tasks: [
      {
        id: "today-task",
        title: "Today",
        trackedDurationSeconds: 120,
        scheduleAt: "2026-08-25",
      },
      {
        id: "other-day",
        title: "Tomorrow",
        trackedDurationSeconds: 600,
        scheduleAt: "2026-08-26",
      },
      {
        id: "undated",
        title: "No due",
        trackedDurationSeconds: 300,
        scheduleAt: null,
      },
    ],
    meetings: [
      {
        id: "today-meeting",
        title: "Standup",
        trackedDurationSeconds: 1800,
        scheduleAt: new Date(2026, 7, 25, 9, 0, 0),
      },
      {
        id: "other-meeting",
        title: "Later",
        trackedDurationSeconds: 900,
        scheduleAt: new Date(2026, 7, 26, 9, 0, 0),
      },
    ],
  });
  assert.deepEqual(
    entries.map((entry) => entry.id).sort(),
    ["today-meeting", "today-task"],
  );
  assert.ok(entries.every((entry) => entry.groupDateYmd === "2026-08-25"));
});

test("collectTimetrackingEntries filters by week and month period", () => {
  const sources = {
    tasks: [
      {
        id: "mon",
        title: "Mon",
        trackedDurationSeconds: 60,
        scheduleAt: "2026-08-24",
      },
      {
        id: "next-week",
        title: "Next",
        trackedDurationSeconds: 60,
        scheduleAt: "2026-08-31",
      },
      {
        id: "sep",
        title: "Sep",
        trackedDurationSeconds: 60,
        scheduleAt: "2026-09-01",
      },
    ],
  };
  const weekEntries = collectTimetrackingEntries({
    ...sources,
    period: { kind: "week", weekKey: "2026-08-24", weekNumber: 35 },
  });
  assert.deepEqual(
    weekEntries.map((entry) => entry.id),
    ["mon"],
  );
  const monthEntries = collectTimetrackingEntries({
    ...sources,
    period: { kind: "month", monthKey: "2026-08", monthLabel: "August 2026" },
  });
  assert.deepEqual(
    monthEntries.map((entry) => entry.id).sort(),
    ["mon", "next-week"],
  );
});

test("formatTimetrackingLeadingStamp uses schedule day and tracked duration", () => {
  assert.equal(
    formatTimetrackingLeadingStamp("2026-08-25", 7200),
    "2026-08-25 · tracked 02:00:00",
  );
  assert.equal(
    formatTimetrackingLeadingStamp(null, 90),
    "tracked 00:01:30",
  );
});

test("withLiveTimetrackingEntries prepends live-only rows and marks matches", () => {
  const base = collectTimetrackingEntries({
    tasks: [
      {
        id: "stored",
        title: "Stored",
        trackedDurationSeconds: 60,
        scheduleAt: "2026-08-25",
      },
    ],
  });
  const merged = withLiveTimetrackingEntries(base, [
    {
      id: "stored",
      kind: "task",
      title: "Stored",
      href: "/calendar?task=stored",
      trackedDurationSeconds: 60,
    },
    {
      id: "fresh",
      kind: "task",
      title: "Fresh",
      href: "/calendar?task=fresh",
      trackedDurationSeconds: 0,
    },
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0]?.id, "fresh");
  assert.equal(merged[0]?.isLive, true);
  assert.equal(merged[0]?.trackedDurationSeconds, 0);
  assert.equal(merged[1]?.id, "stored");
  assert.equal(merged[1]?.isLive, true);
  assert.equal(merged[1]?.trackedDurationSeconds, 60);
});

test("readTimetrackingPeriodFromSearch prefers week then month then day", () => {
  assert.deepEqual(readTimetrackingPeriodFromSearch("?week=2026-08-24"), {
    kind: "week",
    weekKey: "2026-08-24",
    weekNumber: 35,
  });
  assert.deepEqual(readTimetrackingPeriodFromSearch("?month=2026-08"), {
    kind: "month",
    monthKey: "2026-08",
    monthLabel: "August 2026",
  });
  assert.deepEqual(readTimetrackingPeriodFromSearch("?date=2026-08-25"), {
    kind: "day",
    ymd: "2026-08-25",
  });
});
