import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyTaskOptimisticPatches,
  pruneConfirmedTaskOptimisticPatches,
  type TaskListOptimisticPatch,
} from "./merge-task-list-optimistic.js";

describe("pruneConfirmedTaskOptimisticPatches", () => {
  it("drops patches when server status matches", () => {
    const pending = new Map<string, TaskListOptimisticPatch>([
      ["t1", { status: "completed" }],
    ]);
    const next = pruneConfirmedTaskOptimisticPatches(
      [{ id: "t1", status: "completed", priority: 0 }],
      pending,
    );
    assert.equal(next.size, 0);
  });

  it("keeps patches when server status differs", () => {
    const pending = new Map<string, TaskListOptimisticPatch>([
      ["t1", { status: "completed" }],
    ]);
    const next = pruneConfirmedTaskOptimisticPatches(
      [{ id: "t1", status: "in_progress", priority: 0 }],
      pending,
    );
    assert.equal(next.size, 1);
    assert.equal(next.get("t1")?.status, "completed");
  });
});

describe("applyTaskOptimisticPatches", () => {
  it("overlays pending fields onto server rows", () => {
    const pending = new Map<string, TaskListOptimisticPatch>([
      ["t1", { status: "completed", priority: 2 }],
    ]);
    const rows = applyTaskOptimisticPatches(
      [{ id: "t1", status: "ready_to_start", priority: 0 }],
      pending,
    );
    assert.equal(rows[0]?.status, "completed");
    assert.equal(rows[0]?.priority, 2);
  });
});
