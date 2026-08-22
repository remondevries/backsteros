import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groupTasksByStatus } from "../../dist/tasks/group-tasks-by-status.js";

describe("groupTasksByStatus", () => {
  it("sorts due-date columns newest-first", () => {
    const groups = groupTasksByStatus([
      {
        id: "old",
        status: "completed",
        sortOrder: 1,
        dueDate: "2026-01-01",
      },
      {
        id: "new",
        status: "completed",
        sortOrder: 2,
        dueDate: "2026-07-20",
      },
      {
        id: "mid-review",
        status: "in_review",
        sortOrder: 1,
        dueDate: "2026-03-01",
      },
      {
        id: "new-review",
        status: "in_review",
        sortOrder: 2,
        dueDate: "2026-06-01",
      },
      {
        id: "canceled-old",
        status: "canceled",
        dueDate: "2026-02-01",
      },
      {
        id: "canceled-new",
        status: "canceled",
        dueDate: "2026-05-01",
      },
      {
        id: "dup-old",
        status: "duplicated",
        dueDate: "2026-01-15",
      },
      {
        id: "dup-new",
        status: "duplicated",
        dueDate: "2026-04-15",
      },
    ]);

    const byStatus = Object.fromEntries(
      groups.map((group) => [group.status, group.tasks.map((task) => task.id)]),
    );

    assert.deepEqual(byStatus.completed, ["new", "old"]);
    assert.deepEqual(byStatus.in_review, ["new-review", "mid-review"]);
    assert.deepEqual(byStatus.canceled, ["canceled-new", "canceled-old"]);
    assert.deepEqual(byStatus.duplicated, ["dup-new", "dup-old"]);
  });

  it("keeps sortOrder for active columns", () => {
    const groups = groupTasksByStatus([
      { id: "b", status: "in_progress", sortOrder: 20, dueDate: "2026-07-01" },
      { id: "a", status: "in_progress", sortOrder: 10, dueDate: "2026-07-20" },
    ]);
    const inProgress = groups.find((group) => group.status === "in_progress");
    assert.deepEqual(
      inProgress?.tasks.map((task) => task.id),
      ["a", "b"],
    );
  });

  it("places tasks without due dates after dated ones in due-date columns", () => {
    const groups = groupTasksByStatus([
      { id: "dated", status: "completed", dueDate: "2026-04-01" },
      { id: "undated", status: "completed", dueDate: null },
    ]);
    const completed = groups.find((group) => group.status === "completed");
    assert.deepEqual(
      completed?.tasks.map((task) => task.id),
      ["dated", "undated"],
    );
  });
});
