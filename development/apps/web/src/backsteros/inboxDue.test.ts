import { describe, expect, it } from "vite-plus/test";

import { isBacksterosInboxDueTask, partitionBacksterosInboxTasks } from "./inboxDue";

describe("isBacksterosInboxDueTask", () => {
  const wednesday = new Date(2026, 8, 9, 12, 0, 0); // Wed Sep 9 2026 local

  it("includes overdue and due-today open tasks", () => {
    expect(isBacksterosInboxDueTask({ dueDate: "2026-09-08", status: "backlog" }, wednesday)).toBe(
      true,
    );
    expect(
      isBacksterosInboxDueTask({ dueDate: "2026-09-09", status: "in_progress" }, wednesday),
    ).toBe(true);
  });

  it("excludes future due dates and inactive statuses", () => {
    expect(isBacksterosInboxDueTask({ dueDate: "2026-09-10", status: "triage" }, wednesday)).toBe(
      false,
    );
    expect(
      isBacksterosInboxDueTask({ dueDate: "2026-09-01", status: "completed" }, wednesday),
    ).toBe(false);
    expect(isBacksterosInboxDueTask({ dueDate: null, status: "in_progress" }, wednesday)).toBe(
      false,
    );
  });
});

describe("partitionBacksterosInboxTasks", () => {
  const wednesday = new Date(2026, 8, 9, 12, 0, 0);

  it("keeps attention statuses in status groups; Due only gets the rest", () => {
    const tasks = [
      {
        id: "a",
        status: "in_progress",
        title: "Working",
        dueDate: null as string | null,
        sortOrder: 1,
      },
      {
        id: "b",
        status: "backlog",
        title: "Late",
        dueDate: "2026-09-08",
        sortOrder: 2,
      },
      {
        id: "c",
        status: "in_progress",
        title: "Due today",
        dueDate: "2026-09-09",
        sortOrder: 0,
      },
      {
        id: "d",
        status: "triage",
        title: "Later",
        dueDate: "2026-09-12",
        sortOrder: 3,
      },
    ];

    const { attentionTasks, dueTasks } = partitionBacksterosInboxTasks(tasks, wednesday);

    // Status wins: in_progress due-today stays with attention, not Due.
    expect(attentionTasks.map((task) => task.id)).toEqual(["a", "c", "d"]);
    expect(dueTasks.map((task) => task.id)).toEqual(["b"]);
  });
});
