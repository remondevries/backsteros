import { describe, expect, it } from "vite-plus/test";

import { upsertBacksterosTaskInList } from "./taskListUpsert";
import type { BacksterosTask } from "./types";

function task(partial: Partial<BacksterosTask> & Pick<BacksterosTask, "id">): BacksterosTask {
  return {
    projectId: "p1",
    number: 1,
    title: "Title",
    status: "triage",
    dueDate: null,
    updatedAt: "u1",
    ...partial,
  };
}

describe("upsertBacksterosTaskInList", () => {
  it("prepends unknown tasks", () => {
    const existing = [task({ id: "a" })];
    const created = task({ id: "b", title: "New" });
    expect(upsertBacksterosTaskInList(existing, created)).toEqual([created, existing[0]]);
  });

  it("replaces an existing row in place", () => {
    const existing = [task({ id: "a", status: "triage" }), task({ id: "b" })];
    const updated = task({ id: "a", status: "in_progress", title: "Moved" });
    expect(upsertBacksterosTaskInList(existing, updated)).toEqual([
      { ...existing[0], ...updated },
      existing[1],
    ]);
  });
});
