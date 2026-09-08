import { describe, expect, it } from "vitest";

import { applyTaskSortOrderPatches, taskSortOrderPatchesForGroup } from "./task-reorder";

describe("task-reorder", () => {
  it("reindexes a group with stride 10", () => {
    expect(
      taskSortOrderPatchesForGroup([
        { id: "a", sortOrder: 99 },
        { id: "b", sortOrder: 1 },
        { id: "c" },
      ]),
    ).toEqual([
      { id: "a", sortOrder: 0 },
      { id: "b", sortOrder: 10 },
      { id: "c", sortOrder: 20 },
    ]);
  });

  it("applies patches without touching other rows", () => {
    expect(
      applyTaskSortOrderPatches(
        [
          { id: "x", sortOrder: 5, title: "X" },
          { id: "a", sortOrder: 0, title: "A" },
          { id: "b", sortOrder: 10, title: "B" },
        ],
        [
          { id: "b", sortOrder: 0 },
          { id: "a", sortOrder: 10 },
        ],
      ),
    ).toEqual([
      { id: "x", sortOrder: 5, title: "X" },
      { id: "a", sortOrder: 10, title: "A" },
      { id: "b", sortOrder: 0, title: "B" },
    ]);
  });
});
