import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyTaskRowOverride,
  getTaskRowOverride,
  reconcileTaskRowOverride,
  taskPatchToRowFields,
  withTaskRowOverride,
} from "./task-row-overrides.ts";

describe("taskPatchToRowFields", () => {
  it("maps camelCase API fields to list row keys", () => {
    assert.deepEqual(
      taskPatchToRowFields({
        status: "completed",
        dueDate: "2026-07-26T12:00:00.000Z",
        projectId: "p1",
        priority: 2,
      }),
      {
        status: "completed",
        due_date: "2026-07-26T12:00:00.000Z",
        project_id: "p1",
        priority: 2,
      },
    );
  });
});

describe("task row overrides", () => {
  it("applies and merges overrides onto rows", () => {
    applyTaskRowOverride("t1", { status: "in_progress" });
    assert.equal(getTaskRowOverride("t1")?.status, "in_progress");
    assert.equal(
      withTaskRowOverride({ id: "t1", title: "A", status: "triage" }).status,
      "in_progress",
    );
  });

  it("reconciles away matching fields", () => {
    applyTaskRowOverride("t2", { status: "completed", priority: 1 });
    reconcileTaskRowOverride("t2", { status: "completed", priority: 0 });
    assert.deepEqual(getTaskRowOverride("t2"), { priority: 1 });
    reconcileTaskRowOverride("t2", { status: "completed", priority: 1 });
    assert.equal(getTaskRowOverride("t2"), undefined);
  });
});
