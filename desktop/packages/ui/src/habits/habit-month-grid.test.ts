import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildHabitDayHeatByYmd,
  buildHabitMonthGrids,
  buildHabitTimelineGrids,
  buildHabitYearMonthGrids,
  earliestHabitInstanceYmd,
  focusYmdForHabitSort,
  habitInstanceCounts,
  isoWeekNumber,
  startOfWeekYmd,
} from "./habit-month-grid.js";

describe("buildHabitMonthGrids", () => {
  it("builds January through December with day squares", () => {
    const grids = buildHabitMonthGrids(
      [
        { dueYmd: "2026-07-30", status: "completed" },
        { dueYmd: "2026-08-01", status: "canceled" },
        { dueYmd: "2026-08-16", status: "ready_to_start" },
      ],
      "2026-08-16",
      2026,
    );

    assert.equal(grids.length, 12);
    assert.equal(grids[0]?.label, "January 2026");
    assert.equal(grids[11]?.label, "December 2026");
    assert.equal(grids[6]?.cells[29]?.state, "completed");
    assert.equal(grids[7]?.cells[0]?.state, "canceled");
    assert.equal(grids[7]?.cells[15]?.state, "empty");
    assert.equal(grids[7]?.cells[16]?.state, "future");
  });
});

describe("buildHabitTimelineGrids", () => {
  it("builds weekly sections with 7 day squares", () => {
    const grids = buildHabitTimelineGrids({
      instances: [
        { dueYmd: "2026-08-10", status: "completed" },
        { dueYmd: "2026-08-12", status: "canceled" },
      ],
      todayYmd: "2026-08-16",
      year: 2026,
      sort: "weekly",
      activeFromYmd: "2026-01-01",
    });
    assert.ok(grids.length >= 52);
    const week = grids.find((grid) =>
      grid.cells.some((cell) => cell.ymd === "2026-08-10"),
    );
    assert.ok(week);
    assert.equal(week?.cells.length, 7);
    assert.match(week?.label ?? "", /^Week \d+$/);
    assert.equal(week?.secondaryLabel, "August");
    assert.equal(
      week?.cells.find((cell) => cell.ymd === "2026-08-10")?.state,
      "completed",
    );
  });

  it("builds monthly sections with day squares", () => {
    const grids = buildHabitTimelineGrids({
      instances: [{ dueYmd: "2026-08-10", status: "completed" }],
      todayYmd: "2026-08-16",
      year: 2026,
      sort: "monthly",
      activeFromYmd: "2026-01-01",
    });
    assert.equal(grids.length, 12);
    assert.equal(grids[7]?.label, "August 2026");
    assert.equal(grids[7]?.cells.length, 31);
    assert.equal(grids[7]?.cells[9]?.state, "completed");
  });

  it("marks future cadence due days as scheduled when not daily", () => {
    const grids = buildHabitTimelineGrids({
      instances: [{ dueYmd: "2026-08-10", status: "completed" }],
      todayYmd: "2026-08-16",
      year: 2026,
      sort: "monthly",
      activeFromYmd: "2026-08-10",
      cadence: "weekly",
      cadenceAnchorYmd: "2026-08-10",
    });
    // 2026-08-17 is next weekly due after Aug 10.
    assert.equal(grids[7]?.cells[16]?.state, "scheduled");
    assert.equal(grids[7]?.cells[17]?.state, "future");
    assert.equal(grids[7]?.cells[23]?.state, "scheduled");
  });

  it("keeps future daily days as plain dashed future", () => {
    const grids = buildHabitTimelineGrids({
      instances: [{ dueYmd: "2026-08-10", status: "completed" }],
      todayYmd: "2026-08-16",
      year: 2026,
      sort: "monthly",
      activeFromYmd: "2026-08-10",
      cadence: "daily",
      cadenceAnchorYmd: "2026-08-10",
    });
    assert.equal(grids[7]?.cells[16]?.state, "future");
  });

  it("allows backfilling past empty days before the habit start", () => {
    const grids = buildHabitTimelineGrids({
      instances: [{ dueYmd: "2026-08-16", status: "completed" }],
      todayYmd: "2026-08-16",
      year: 2026,
      sort: "monthly",
      activeFromYmd: "2026-08-10",
      cadence: "daily",
      cadenceAnchorYmd: "2026-08-10",
    });
    // Aug 1 is before habit start but in the past → empty (recordable).
    assert.equal(grids[7]?.cells[0]?.state, "empty");
    // Aug 9 likewise.
    assert.equal(grids[7]?.cells[8]?.state, "empty");
    assert.equal(grids[7]?.cells[15]?.state, "completed");
  });

  it("builds a single yearly group with every day square", () => {
    const grids = buildHabitTimelineGrids({
      instances: [{ dueYmd: "2026-08-10", status: "completed" }],
      todayYmd: "2026-08-16",
      year: 2026,
      sort: "yearly",
      activeFromYmd: "2026-01-01",
    });
    assert.equal(grids.length, 1);
    assert.equal(grids[0]?.label, "2026");
    assert.equal(grids[0]?.cells.length, 365);
    assert.equal(
      grids[0]?.cells.find((cell) => cell.ymd === "2026-08-10")?.state,
      "completed",
    );
  });
});

describe("buildHabitYearMonthGrids", () => {
  it("builds empty months for the selected year", () => {
    const grids = buildHabitYearMonthGrids("2026-08-16", 2026);
    assert.equal(grids.length, 12);
    assert.equal(grids[7]?.cells[15]?.state, "empty");
    assert.equal(grids[7]?.cells[16]?.state, "future");
  });
});

describe("buildHabitDayHeatByYmd", () => {
  it("maps completed-only days to green heat and scales by volume", () => {
    const heat = buildHabitDayHeatByYmd([
      { dueYmd: "2026-08-01", status: "completed", title: "Run" },
      { dueYmd: "2026-08-02", status: "completed", title: "Run" },
      { dueYmd: "2026-08-02", status: "completed", title: "Meditate" },
      { dueYmd: "2026-08-02", status: "completed", title: "Read" },
      { dueYmd: "2026-08-02", status: "completed", title: "Write" },
    ]);
    assert.equal(heat.get("2026-08-01")?.tone, "completed");
    assert.equal(heat.get("2026-08-01")?.level, 1);
    assert.equal(heat.get("2026-08-02")?.tone, "completed");
    assert.equal(heat.get("2026-08-02")?.level, 4);
    assert.equal(heat.get("2026-08-02")?.entries.length, 4);
  });

  it("maps canceled-only days to red and mixed days to orange", () => {
    const heat = buildHabitDayHeatByYmd([
      { dueYmd: "2026-08-10", status: "canceled", title: "Run" },
      { dueYmd: "2026-08-10", status: "canceled", title: "Read" },
      { dueYmd: "2026-08-11", status: "completed", title: "Run" },
      { dueYmd: "2026-08-11", status: "canceled", title: "Read" },
    ]);
    assert.equal(heat.get("2026-08-10")?.tone, "canceled");
    assert.equal(heat.get("2026-08-11")?.tone, "mixed");
    assert.deepEqual(
      heat.get("2026-08-11")?.entries.map((entry) => entry.status),
      ["completed", "canceled"],
    );
  });
});

describe("buildHabitTimelineGrids aggregate", () => {
  it("attaches heat cells for the All habits view", () => {
    const grids = buildHabitTimelineGrids({
      instances: [
        { dueYmd: "2026-08-10", status: "completed", title: "Run" },
        { dueYmd: "2026-08-10", status: "canceled", title: "Read" },
      ],
      todayYmd: "2026-08-16",
      year: 2026,
      sort: "monthly",
      activeFromYmd: "2026-01-01",
      aggregate: true,
    });
    const august = grids.find((grid) => grid.month === 8);
    const day = august?.cells.find((cell) => cell.ymd === "2026-08-10");
    assert.equal(day?.state, "heat");
    assert.equal(day?.heat?.tone, "mixed");
    assert.equal(day?.heat?.entries[0]?.title, "Run");
  });
});

describe("habit helpers", () => {
  it("starts weeks on Monday and reports ISO week numbers", () => {
    assert.equal(startOfWeekYmd("2026-08-16"), "2026-08-10");
    assert.equal(isoWeekNumber("2026-08-10"), 33);
  });

  it("returns earliest due day", () => {
    assert.equal(
      earliestHabitInstanceYmd([
        { dueYmd: "2026-08-10", status: "completed" },
        { dueYmd: "2026-01-02", status: "canceled" },
      ]),
      "2026-01-02",
    );
  });

  it("counts completed and canceled instances", () => {
    assert.deepEqual(
      habitInstanceCounts([
        { dueYmd: "2026-08-10", status: "completed" },
        { dueYmd: "2026-08-11", status: "canceled" },
      ]),
      { completed: 1, canceled: 1 },
    );
  });

  it("picks a focus day for each sort mode", () => {
    assert.equal(focusYmdForHabitSort("weekly", "2026-08-16", 2026), "2026-08-16");
    assert.equal(focusYmdForHabitSort("monthly", "2026-08-16", 2026), "2026-08-16");
    assert.equal(focusYmdForHabitSort("yearly", "2026-08-16", 2026), "2026-08-16");
  });
});
