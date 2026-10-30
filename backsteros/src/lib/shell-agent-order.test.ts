import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  moveIdInOrder,
  sortAgentsForDisplay,
  writeAgentSortOrderIds,
} from "./shell-agent-order.ts";

const memory = new Map<string, string>();

afterEach(() => {
  memory.clear();
});

describe("shell agent order", () => {
  it("sorts by server sortOrder when any agent is non-zero", () => {
    const sorted = sortAgentsForDisplay(
      [
        { id: "b", name: "B", sortOrder: 2 },
        { id: "a", name: "A", sortOrder: 0 },
        { id: "c", name: "C", sortOrder: 1 },
      ],
      ["b", "c", "a"],
    );
    assert.deepEqual(
      sorted.map((agent) => agent.id),
      ["a", "c", "b"],
    );
  });

  it("uses preferred/local ids when all sortOrders are zero", () => {
    const sorted = sortAgentsForDisplay(
      [
        { id: "a", name: "A", sortOrder: 0 },
        { id: "b", name: "B", sortOrder: 0 },
        { id: "c", name: "C", sortOrder: 0 },
      ],
      ["c", "a", "b"],
    );
    assert.deepEqual(
      sorted.map((agent) => agent.id),
      ["c", "a", "b"],
    );
  });

  it("moveIdInOrder swaps neighbors", () => {
    assert.deepEqual(moveIdInOrder(["a", "b", "c"], "b", -1), ["b", "a", "c"]);
    assert.deepEqual(moveIdInOrder(["a", "b", "c"], "b", 1), ["a", "c", "b"]);
    assert.deepEqual(moveIdInOrder(["a", "b", "c"], "a", -1), ["a", "b", "c"]);
  });

  it("writeAgentSortOrderIds is a no-op without window", () => {
    writeAgentSortOrderIds(["a", "b"]);
  });
});

void memory;
