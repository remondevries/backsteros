import { describe, expect, it } from "vite-plus/test";

import { groupBacksterosTasksByStatus, migrateBacksterosTaskStatus } from "./taskStatus";

describe("groupBacksterosTasksByStatus", () => {
  it("groups tasks by status and skips empty groups", () => {
    const groups = groupBacksterosTasksByStatus([
      { id: "1", title: "Ship", status: "in_progress", sortOrder: 1 },
      { id: "2", title: "Plan", status: "todo", sortOrder: 0 },
      { id: "3", title: "Done", status: "done", sortOrder: 0, dueDate: "2026-01-02" },
      { id: "4", title: "Older done", status: "completed", sortOrder: 0, dueDate: "2026-01-01" },
      { id: "5", title: "Review", status: "in_review", sortOrder: 0 },
    ]);

    expect(groups.map((group) => group.status)).toEqual([
      "in_review",
      "in_progress",
      "ready_to_start",
      "completed",
    ]);
    expect(groups[2]?.tasks.map((task) => task.title)).toEqual(["Plan"]);
    expect(groups[3]?.tasks.map((task) => task.title)).toEqual(["Done", "Older done"]);
  });

  it("orders status groups for active-work-first scanning", () => {
    const groups = groupBacksterosTasksByStatus([
      { id: "1", title: "A", status: "triage" },
      { id: "2", title: "B", status: "duplicated" },
      { id: "3", title: "C", status: "backlog" },
      { id: "4", title: "D", status: "on_hold" },
      { id: "5", title: "E", status: "canceled" },
      { id: "6", title: "F", status: "ready_to_start" },
      { id: "7", title: "G", status: "in_progress" },
      { id: "8", title: "H", status: "in_review" },
      { id: "9", title: "I", status: "completed" },
    ]);

    expect(groups.map((group) => group.status)).toEqual([
      "triage",
      "in_review",
      "in_progress",
      "on_hold",
      "backlog",
      "ready_to_start",
      "completed",
      "canceled",
      "duplicated",
    ]);
  });

  it("migrates legacy statuses", () => {
    expect(migrateBacksterosTaskStatus("todo")).toBe("ready_to_start");
    expect(migrateBacksterosTaskStatus("done")).toBe("completed");
  });
});
