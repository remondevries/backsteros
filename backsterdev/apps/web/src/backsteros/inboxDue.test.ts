import { describe, expect, it } from "vite-plus/test";

import {
  isBacksterosInboxDueTask,
  isBacksterosInboxMemberTask,
  mergeBacksterosInboxTasksWithWorking,
} from "./inboxDue";

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

describe("isBacksterosInboxMemberTask", () => {
  const wednesday = new Date(2026, 8, 9, 12, 0, 0);

  it("includes attention statuses and due tasks without working", () => {
    expect(
      isBacksterosInboxMemberTask(
        { id: "a", status: "in_progress", dueDate: "2026-09-20" },
        { referenceDate: wednesday },
      ),
    ).toBe(true);
    expect(
      isBacksterosInboxMemberTask(
        { id: "b", status: "backlog", dueDate: "2026-09-08" },
        { referenceDate: wednesday },
      ),
    ).toBe(true);
    expect(
      isBacksterosInboxMemberTask(
        { id: "c", status: "ready_to_start", dueDate: "2026-09-20" },
        { referenceDate: wednesday },
      ),
    ).toBe(false);
    expect(
      isBacksterosInboxMemberTask(
        { id: "hold", status: "on_hold", dueDate: null },
        { referenceDate: wednesday },
      ),
    ).toBe(false);
    expect(
      isBacksterosInboxMemberTask(
        { id: "hold-due", status: "on_hold", dueDate: "2026-09-08" },
        { referenceDate: wednesday },
      ),
    ).toBe(true);
  });

  it("always includes live agent-working tasks regardless of due date or status", () => {
    const working = new Set(["live"]);
    expect(
      isBacksterosInboxMemberTask(
        { id: "live", status: "ready_to_start", dueDate: "2026-09-20" },
        { workingTaskIds: working, referenceDate: wednesday },
      ),
    ).toBe(true);
    expect(
      isBacksterosInboxMemberTask(
        { id: "other", status: "ready_to_start", dueDate: "2026-09-20" },
        { workingTaskIds: working, referenceDate: wednesday },
      ),
    ).toBe(false);
  });
});

describe("mergeBacksterosInboxTasksWithWorking", () => {
  it("appends working extras that soft-poll membership missed", () => {
    const inbox = [{ id: "a" }, { id: "b" }];
    const extras = new Map([["live", { id: "live" }]]);
    const merged = mergeBacksterosInboxTasksWithWorking({
      inboxTasks: inbox,
      workingTasksById: extras,
      workingTaskIds: new Set(["live", "a"]),
    });
    expect(merged.map((task) => task.id)).toEqual(["a", "b", "live"]);
  });

  it("skips extras that are already in the inbox payload", () => {
    const inbox = [{ id: "live" }];
    const extras = new Map([["live", { id: "live-dup" }]]);
    const merged = mergeBacksterosInboxTasksWithWorking({
      inboxTasks: inbox,
      workingTasksById: extras,
      workingTaskIds: new Set(["live"]),
    });
    expect(merged).toEqual(inbox);
  });
});
