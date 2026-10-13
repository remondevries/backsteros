import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { orderTaskLabelsForDropdown } from "./task-label-dropdown-order.js";

describe("orderTaskLabelsForDropdown", () => {
  it("clusters children under their group and leaves ungrouped labels flat", () => {
    const ordered = orderTaskLabelsForDropdown([
      {
        id: "iphone",
        name: "iPhone",
        color: "#22c55e",
        isGroup: false,
        parentId: "device",
      },
      {
        id: "device",
        name: "Device",
        color: null,
        isGroup: true,
        parentId: null,
      },
      {
        id: "bug",
        name: "Bug",
        color: "#ef4444",
        isGroup: false,
        parentId: null,
      },
      {
        id: "ipad",
        name: "iPad",
        color: "#3b82f6",
        isGroup: false,
        parentId: "device",
      },
      {
        id: "empty",
        name: "Empty",
        color: null,
        isGroup: true,
        parentId: null,
      },
    ]);

    assert.deepEqual(
      ordered.map((label) => ({
        name: label.name,
        group: label.group,
      })),
      [
        { name: "Bug", group: null },
        { name: "iPad", group: "Device" },
        { name: "iPhone", group: "Device" },
      ],
    );
  });

  it("ignores a parent that is not a group", () => {
    const ordered = orderTaskLabelsForDropdown([
      {
        id: "child",
        name: "Child",
        color: null,
        isGroup: false,
        parentId: "missing",
      },
    ]);

    assert.equal(ordered[0]?.group, null);
  });
});
