import assert from "node:assert/strict";
import { test } from "node:test";

import { buildInboxTaskListItem } from "./inbox-items.js";
import {
  filterInboxItemsByListMode,
  inboxItemIsAgentMode,
  parseInboxListMode,
} from "./inbox-list-mode.js";

test("parseInboxListMode defaults to notifications", () => {
  assert.equal(parseInboxListMode(null), "notifications");
  assert.equal(parseInboxListMode("agents"), "agents");
  assert.equal(parseInboxListMode("nope"), "notifications");
});

test("filterInboxItemsByListMode splits agents from notifications", () => {
  const triage = buildInboxTaskListItem({
    id: "triage",
    title: "Triage",
    number: 1,
    status: "triage",
    inbox: true,
  });
  const agent = buildInboxTaskListItem({
    id: "agent",
    title: "Agent",
    number: 2,
    status: "triage",
    agentCreatedAt: Date.now(),
  });
  const approved = buildInboxTaskListItem({
    id: "approved",
    title: "Approved",
    number: 3,
    status: "triage",
    inbox: true,
    agentCreatedAt: Date.now() - 1000,
    agentInboxApprovedAt: Date.now(),
  });

  assert.equal(inboxItemIsAgentMode(agent), true);
  assert.equal(inboxItemIsAgentMode(triage), false);
  assert.equal(inboxItemIsAgentMode(approved), false);

  const notifications = filterInboxItemsByListMode(
    [triage, agent, approved],
    "notifications",
  );
  assert.deepEqual(
    notifications.map((item) => item.id),
    ["triage", "approved"],
  );

  const agents = filterInboxItemsByListMode(
    [triage, agent, approved],
    "agents",
  );
  assert.deepEqual(
    agents.map((item) => item.id),
    ["agent"],
  );
});
