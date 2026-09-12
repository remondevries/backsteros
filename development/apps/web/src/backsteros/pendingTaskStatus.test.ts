import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  applyPendingBacksterosTaskStatuses,
  clearAllPendingBacksterosTaskStatuses,
  getPendingBacksterosTaskStatusCount,
  setPendingBacksterosTaskStatus,
} from "./pendingTaskStatus";

afterEach(() => {
  clearAllPendingBacksterosTaskStatuses();
});

describe("applyPendingBacksterosTaskStatuses", () => {
  it("keeps optimistic status while the server is behind", () => {
    setPendingBacksterosTaskStatus("t1", "in_progress");
    const tasks = [
      { id: "t1", status: "in_review", updatedAt: "u1" },
      { id: "t2", status: "triage", updatedAt: "u2" },
    ];
    expect(applyPendingBacksterosTaskStatuses(tasks)).toEqual([
      { id: "t1", status: "in_progress", updatedAt: "u1" },
      { id: "t2", status: "triage", updatedAt: "u2" },
    ]);
    expect(getPendingBacksterosTaskStatusCount()).toBe(1);
  });

  it("clears the overlay once the server matches", () => {
    setPendingBacksterosTaskStatus("t1", "in_review");
    const tasks = [{ id: "t1", status: "in_review", updatedAt: "u1" }];
    expect(applyPendingBacksterosTaskStatuses(tasks)).toBe(tasks);
    expect(getPendingBacksterosTaskStatusCount()).toBe(0);
  });
});
