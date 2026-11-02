import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  agentIdsForApiKeyOrder,
  moveIdInOrder,
  reconcileAgentApiKeyOrderIds,
  resetAgentOrderMemoryForTests,
  sortAgentsForDisplay,
  writeAgentApiKeySortOrderIds,
  writeAgentSortOrderIds,
} from "./shell-agent-order.ts";

afterEach(() => {
  resetAgentOrderMemoryForTests();
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

  it("follows the Settings API key order over stale agent ids (recreated Judith)", () => {
    // Agent-id order still lists an old Judith row; the live one is unranked.
    const sorted = sortAgentsForDisplay(
      [
        { id: "jaap", apiKeyId: "k-jaap", name: "Jaap", sortOrder: 1 },
        { id: "judith-new", apiKeyId: "k-judith", name: "Judith", sortOrder: 9 },
        { id: "niels", apiKeyId: "k-niels", name: "Niels", sortOrder: 2 },
      ],
      ["judith-old", "jaap", "niels"],
      ["k-judith", "k-jaap", "k-niels"],
    );
    assert.deepEqual(
      sorted.map((agent) => agent.id),
      ["judith-new", "jaap", "niels"],
    );
  });

  it("puts agents without a ranked API key after ranked ones, in agent-id order", () => {
    const sorted = sortAgentsForDisplay(
      [
        { id: "x", apiKeyId: null, name: "X", sortOrder: 0 },
        { id: "y", apiKeyId: "k-y", name: "Y", sortOrder: 5 },
        { id: "z", apiKeyId: "k-unranked", name: "Z", sortOrder: 1 },
      ],
      ["z", "x"],
      ["k-y"],
    );
    assert.deepEqual(
      sorted.map((agent) => agent.id),
      ["y", "z", "x"],
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

  it("session memory keeps api key order without window localStorage", () => {
    writeAgentApiKeySortOrderIds(["k-b", "k-a"]);
    const sorted = sortAgentsForDisplay(
      [
        { id: "a", apiKeyId: "k-a", name: "A", sortOrder: 0 },
        { id: "b", apiKeyId: "k-b", name: "B", sortOrder: 1 },
      ],
      [],
    );
    assert.deepEqual(
      sorted.map((agent) => agent.id),
      ["b", "a"],
    );
  });

  it("reconcileAgentApiKeyOrderIds drops revoked keys and appends new ones", () => {
    assert.deepEqual(
      reconcileAgentApiKeyOrderIds(["k-a", "k-c", "k-d"], ["k-b", "k-a", "k-c"]),
      ["k-a", "k-c", "k-d"],
    );
    assert.deepEqual(
      reconcileAgentApiKeyOrderIds(["k-a", "k-b"], []),
      [],
    );
  });

  it("agentIdsForApiKeyOrder follows key order and falls back to contactId", () => {
    const ids = agentIdsForApiKeyOrder(
      [
        { id: "agent-a", apiKeyId: null, contactId: "c-a", enabled: true },
        { id: "agent-b", apiKeyId: "k-b", contactId: "c-b", enabled: true },
        { id: "agent-c", apiKeyId: "k-c", contactId: "c-c", enabled: true },
      ],
      ["k-a", "k-c", "k-b"],
      [
        { id: "k-a", contactId: "c-a" },
        { id: "k-b", contactId: "c-b" },
        { id: "k-c", contactId: "c-c" },
      ],
    );
    assert.deepEqual(ids, ["agent-a", "agent-c", "agent-b"]);
  });
});
