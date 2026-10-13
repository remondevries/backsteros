import assert from "node:assert/strict";
import { test } from "node:test";

import {
  listTimetrackingChartDayYmds,
  resolveTimetrackingChartPeriod,
} from "./calendar-timetracking-days.js";
import {
  buildTimetrackingHoursChartSeries,
  formatTimetrackingChartHours,
  timetrackingHoursChartHasActivity,
} from "./calendar-timetracking-hours-chart-series.js";
import type { TimetrackingEntry } from "./calendar-timetracking-entries.js";

const sampleEntries: TimetrackingEntry[] = [
  {
    id: "t1",
    kind: "task",
    title: "Ship",
    trackedDurationSeconds: 7200,
    groupDateYmd: "2026-08-25",
    href: "/t1",
  },
  {
    id: "m1",
    kind: "meeting",
    title: "Sync",
    trackedDurationSeconds: 1800,
    groupDateYmd: "2026-08-25",
    href: "/m1",
  },
  {
    id: "t2",
    kind: "task",
    title: "Other",
    trackedDurationSeconds: 3600,
    groupDateYmd: "2026-08-26",
    href: "/t2",
  },
];

test("listTimetrackingChartDayYmds expands day to ISO week", () => {
  const days = listTimetrackingChartDayYmds({
    kind: "day",
    ymd: "2026-08-25",
  });
  assert.equal(days.length, 7);
  assert.equal(days[0], "2026-08-24");
  assert.equal(days[6], "2026-08-30");
});

test("listTimetrackingChartDayYmds lists month days", () => {
  const days = listTimetrackingChartDayYmds({
    kind: "month",
    monthKey: "2026-02",
    monthLabel: "February 2026",
  });
  assert.equal(days.length, 28);
  assert.equal(days[0], "2026-02-01");
  assert.equal(days[27], "2026-02-28");
});

test("resolveTimetrackingChartPeriod expands day to week", () => {
  assert.deepEqual(
    resolveTimetrackingChartPeriod({ kind: "day", ymd: "2026-08-25" }),
    { kind: "week", weekKey: "2026-08-24", weekNumber: 35 },
  );
});

test("buildTimetrackingHoursChartSeries buckets seconds into hours", () => {
  const series = buildTimetrackingHoursChartSeries({
    entries: sampleEntries,
    period: { kind: "week", weekKey: "2026-08-24", weekNumber: 35 },
  });
  assert.ok(series);
  assert.equal(series!.data.length, 7);
  const tue = series!.data.find((point) => point.x === "2026-08-25");
  const wed = series!.data.find((point) => point.x === "2026-08-26");
  assert.equal(tue?.y, 2.5);
  assert.equal(wed?.y, 1);
  assert.equal(timetrackingHoursChartHasActivity(series), true);
});

test("formatTimetrackingChartHours", () => {
  assert.equal(formatTimetrackingChartHours(0), "0h");
  assert.equal(formatTimetrackingChartHours(0.5), "30m");
  assert.equal(formatTimetrackingChartHours(2.5), "2.5h");
  assert.equal(formatTimetrackingChartHours(12.4), "12h");
});
