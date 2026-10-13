import { describe, expect, it } from "vite-plus/test";

import { applyProjectSortOrderPatches, projectSortOrderPatchesForGroup } from "./project-reorder";

describe("project-reorder", () => {
  it("assigns stride-10 sort orders in group order", () => {
    expect(
      projectSortOrderPatchesForGroup([
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

  it("merges patches into the full list without touching other rows", () => {
    const next = applyProjectSortOrderPatches(
      [
        { id: "x", sortOrder: 5, name: "X" },
        { id: "a", sortOrder: 0, name: "A" },
        { id: "b", sortOrder: 10, name: "B" },
      ],
      [
        { id: "b", sortOrder: 0 },
        { id: "a", sortOrder: 10 },
      ],
    );
    expect(next).toEqual([
      { id: "x", sortOrder: 5, name: "X" },
      { id: "a", sortOrder: 10, name: "A" },
      { id: "b", sortOrder: 0, name: "B" },
    ]);
  });
});
