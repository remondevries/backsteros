import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  moveIdInOrder,
  sortAgentsForDisplay,
  writeAgentSortOrderIds,
} from "./shell-agent-order.ts";

afterEach(() => {
  // no-op without window
});

describe("shell agent order", () => {
  it("prefers preferred/local ids over server sortOrder so edits cannot jump", () => {
    const sorted = sortAgentsForDisplay(
      [
        { id: "b", name: "B", sortOrder: 0 },
        { id: "a", name: "A", sortOrder: 2 },
        { id: "c", name: "C", sortOrder: 1 },
      ],
      ["b", "c", "a"],
    );
    assert.deepEqual(
      sorted.map((agent) => agent.id),
      ["b", "c", "a"],
    );
  });

  it("falls back to sortOrder when no preferred ids", () => {
    const sorted = sortAgentsForDisplay(
      [
        { id: "b", name: "B", sortOrder: 2 },
        { id: "a", name: "A", sortOrder: 0 },
        { id: "c", name: "C", sortOrder: 1 },
      ],
      [],
    );
    assert.deepEqual(
      sorted.map((agent) => agent.id),
      ["a", "c", "b"],
    );
  });

  it("keeps an edited agent at its preferred index even with sortOrder 0", () => {
    const sorted = sortAgentsForDisplay(
      [
        { id: "a", name: "A", sortOrder: 0 },
        { id: "b", name: "B", sortOrder: 0 },
        { id: "c", name: "C", sortOrder: 0 },
      ],
      ["a", "b", "c"],
    );
    // Simulate PATCH returning sortOrder 0 for middle agent — still stays put.
    const afterEdit = sortAgentsForDisplay(
      sorted.map((agent) =>
        agent.id === "b" ? { ...agent, sortOrder: 0, name: "B2" } : agent,
      ),
      ["a", "b", "c"],
    );
    assert.deepEqual(
      afterEdit.map((agent) => agent.id),
      ["a", "b", "c"],
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
