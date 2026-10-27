import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildInboxEmailListItem,
  buildInboxTaskListItem,
} from "./inbox-items.js";
import {
  filterInboxItemsByListMode,
  inboxItemIsAgentMode,
  inboxItemIsChatMessage,
  inboxItemIsMessageMode,
  inboxItemIsSupportMessage,
  parseInboxListMode,
  resolveInboxListModeFromShortcutKey,
} from "./inbox-list-mode.js";

test("parseInboxListMode defaults to notifications", () => {
  assert.equal(parseInboxListMode(null), "notifications");
  assert.equal(parseInboxListMode("agents"), "agents");
  assert.equal(parseInboxListMode("messages"), "messages");
  assert.equal(parseInboxListMode("nope"), "notifications");
});

test("Messages is emails + support + chats — never plain inbox tasks", () => {
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
  const projectTask = buildInboxTaskListItem({
    id: "rl-47",
    title: "Project task",
    number: 47,
    status: "triage",
    projectKey: "RL",
  });
  const support = buildInboxTaskListItem({
    id: "support",
    title: "Support ticket",
    number: 4,
    status: "triage",
    support: true,
  });
  const chat = buildInboxTaskListItem({
    id: "chat-uuid",
    title: "Visitor",
    number: 12,
    status: "triage",
    projectKey: "CH",
    chat: true,
  });
  const email = buildInboxEmailListItem({
    inboxId: "inbox-1",
    messageId: "msg-1",
    title: "Hello",
    status: "triage",
  });
  const conceptEmail = buildInboxEmailListItem({
    inboxId: "inbox-1",
    messageId: "msg-3",
    draftId: "draft-1",
    title: "Draft",
    status: "concept",
  });

  assert.equal(inboxItemIsAgentMode(agent), true);
  assert.equal(inboxItemIsSupportMessage(support), true);
  assert.equal(inboxItemIsSupportMessage(chat), false);
  assert.equal(inboxItemIsChatMessage(chat), true);
  assert.equal(inboxItemIsMessageMode(email), true);
  assert.equal(inboxItemIsMessageMode(conceptEmail), true);
  assert.equal(inboxItemIsMessageMode(support), true);
  assert.equal(inboxItemIsMessageMode(chat), true);
  assert.equal(inboxItemIsMessageMode(triage), false);
  assert.equal(inboxItemIsMessageMode(projectTask), false);
  assert.equal(inboxItemIsMessageMode(agent), false);

  const all = [triage, agent, projectTask, support, chat, email, conceptEmail];

  assert.deepEqual(
    filterInboxItemsByListMode(all, "notifications").map((item) => item.id),
    ["triage", "rl-47"],
  );
  assert.deepEqual(
    filterInboxItemsByListMode(all, "messages").map((item) => item.id),
    ["support", "chat-uuid", email.id, conceptEmail.id],
  );
  assert.deepEqual(
    filterInboxItemsByListMode(all, "agents").map((item) => item.id),
    ["agent"],
  );
});

test("resolveInboxListModeFromShortcutKey maps 1/2/3 without modifiers", () => {
  assert.equal(resolveInboxListModeFromShortcutKey("1"), "notifications");
  assert.equal(resolveInboxListModeFromShortcutKey("2"), "messages");
  assert.equal(resolveInboxListModeFromShortcutKey("3"), "agents");
  assert.equal(resolveInboxListModeFromShortcutKey("4"), null);
  assert.equal(
    resolveInboxListModeFromShortcutKey("1", { metaKey: true }),
    null,
  );
});
