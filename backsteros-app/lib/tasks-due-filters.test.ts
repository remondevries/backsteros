import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { filterTasksByDueFilter } from "./tasks-due-filters";

describe("filterTasksByDueFilter", () => {
  const wednesday = new Date(2026, 6, 22, 12, 0, 0); // Wed Jul 22, 2026

  it("keeps completed, canceled, and duplicated tasks in the today window", () => {
    const tasks = [
      { id: "active", dueDate: "2026-07-22", status: "in_progress" },
      { id: "done", dueDate: "2026-07-22", status: "completed" },
      { id: "canceled", dueDate: "2026-07-22", status: "canceled" },
      { id: "dup", dueDate: "2026-07-22", status: "duplicated" },
      { id: "other-day", dueDate: "2026-07-20", status: "completed" },
    ];

    const filtered = filterTasksByDueFilter(tasks, "today", wednesday);
    assert.deepEqual(
      filtered.map((task) => task.id).sort(),
      ["active", "canceled", "done", "dup"],
    );
  });

  it("overdue keeps open past-due tasks only", () => {
    const tasks = [
      { id: "late-open", dueDate: "2026-07-20", status: "in_progress" },
      { id: "late-done", dueDate: "2026-07-20", status: "completed" },
      { id: "late-canceled", dueDate: "2026-07-19", status: "canceled" },
      { id: "today-open", dueDate: "2026-07-22", status: "ready_to_start" },
    ];

    const filtered = filterTasksByDueFilter(tasks, "overdue", wednesday);
    assert.deepEqual(
      filtered.map((task) => task.id),
      ["late-open"],
    );
  });
});
