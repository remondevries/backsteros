import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getTasksDueFilterWeekDays,
  groupTasksByWeekDay,
  resolveTaskWeekDayKey,
  taskDayColumnReorderPatches,
} from "./tasks-week-view.js";

describe("tasks week view", () => {
  it("returns seven week days for this-week starting on Monday", () => {
    const days = getTasksDueFilterWeekDays(
      "this-week",
      new Date(2026, 7, 19),
    );
    assert.equal(days.length, 7);
    assert.equal(days[0]?.ymd, "2026-08-17");
    assert.equal(days[6]?.ymd, "2026-08-23");
  });

  it("groups tasks into their due day buckets", () => {
    const days = getTasksDueFilterWeekDays(
      "this-week",
      new Date(2026, 7, 19),
    );
    const groups = groupTasksByWeekDay(
      [
        { dueDate: "2026-08-18" },
        { dueDate: "2026-08-20" },
        { dueDate: null },
      ],
      days,
    );
    assert.equal(groups[1]?.tasks.length, 1);
    assert.equal(groups[3]?.tasks.length, 1);
    assert.equal(groups[0]?.tasks.length, 1);
  });

  it("reorders tasks within a day column", () => {
    const weekDays = ["2026-08-17", "2026-08-18"];
    const tasks = [
      { id: "a", dueDate: "2026-08-18", sortOrder: 0 },
      { id: "b", dueDate: "2026-08-18", sortOrder: 10 },
      { id: "c", dueDate: "2026-08-18", sortOrder: 20 },
    ];
    const patches = taskDayColumnReorderPatches(
      tasks,
      { taskId: "c", dayYmd: "2026-08-18", beforeTaskId: "a" },
      weekDays,
    );
    assert.deepEqual(patches, [
      { id: "c", sortOrder: 0 },
      { id: "a", sortOrder: 10 },
      { id: "b", sortOrder: 20 },
    ]);
    assert.equal(resolveTaskWeekDayKey({ dueDate: "2026-08-18" }, weekDays), "2026-08-18");
  });
});
