import assert from "node:assert/strict";
import { test } from "node:test";

import {
  collectAgentAttentionTransitions,
  noteLocalTaskStatusPatch,
} from "./agent-status-notifications.js";

test("collectAgentAttentionTransitions notifies remote in_review / on_hold moves", () => {
  const previous = new Map([
    ["a", "in_progress"],
    ["b", "in_progress"],
    ["c", "ready_to_start"],
  ]);
  const next = [
    { id: "a", status: "in_review", title: "Review me" },
    { id: "b", status: "on_hold", title: "Hold me" },
    { id: "c", status: "ready_to_start", title: "Unchanged" },
    { id: "d", status: "in_review", title: "New row" },
  ];
  const transitions = collectAgentAttentionTransitions({ previous, next });
  assert.deepEqual(
    transitions.map((entry) => entry.id),
    ["a", "b"],
  );
});

test("collectAgentAttentionTransitions suppresses local patches", () => {
  noteLocalTaskStatusPatch("local");
  const previous = new Map([["local", "in_progress"]]);
  const next = [{ id: "local", status: "in_review", title: "Mine" }];
  assert.deepEqual(
    collectAgentAttentionTransitions({ previous, next }),
    [],
  );
});
