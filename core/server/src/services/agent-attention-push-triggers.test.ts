import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildAgentAttentionNotification,
  collectAgentAttentionTransitions,
  taskStatusChangeQualifiesForAgentAttentionPush,
} from "@backsteros/contracts";

test("buildAgentAttentionNotification for in_review", () => {
  const payload = buildAgentAttentionNotification({
    id: "task-1",
    title: "Ship feature",
    status: "in_review",
    displayId: "BSH-12",
    href: "/inbox/bsh-12",
  });
  assert.equal(payload.kind, "agent_task");
  assert.equal(payload.title, "Agent finished");
  assert.match(payload.body, /ready for review/);
  assert.equal(payload.key, "agent:in_review:task-1");
});

test("taskStatusChangeQualifiesForAgentAttentionPush requires agent actor", () => {
  assert.equal(
    taskStatusChangeQualifiesForAgentAttentionPush({
      previousStatus: "in_progress",
      nextStatus: "in_review",
      actorKind: "agent",
    }),
    true,
  );
  assert.equal(
    taskStatusChangeQualifiesForAgentAttentionPush({
      previousStatus: "in_progress",
      nextStatus: "in_review",
      actorKind: "user",
    }),
    false,
  );
});

test("collectAgentAttentionTransitions detects status moves", () => {
  const previous = new Map([["a", "in_progress"]]);
  const next = [{ id: "a", status: "in_review", title: "Done" }];
  assert.deepEqual(
    collectAgentAttentionTransitions({ previous, next }).map((row) => row.id),
    ["a"],
  );
});
