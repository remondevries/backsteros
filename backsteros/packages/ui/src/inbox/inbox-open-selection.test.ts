import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildInboxEmailListItem,
  buildInboxTaskListItem,
} from "./inbox-items.js";
import {
  resolveInboxListItemIdFromPathname,
  resolveInboxModeListItems,
  resolveInboxOpenTarget,
  resolveInboxPanelPathname,
} from "./inbox-open-selection.js";

const triage = buildInboxTaskListItem({
  id: "task-triage",
  title: "Triage me",
  number: 1,
  status: "triage",
  inbox: true,
});
const agent = buildInboxTaskListItem({
  id: "task-agent",
  title: "Agent",
  number: 2,
  status: "triage",
  agentCreatedAt: Date.now(),
});
const email = buildInboxEmailListItem({
  inboxId: "box",
  messageId: "msg-1",
  title: "Hello",
  status: "triage",
});

const all = [triage, agent, email];

test("resolveInboxModeListItems filters and sorts per mode", () => {
  assert.deepEqual(
    resolveInboxModeListItems(all, "notifications").map((item) => item.id),
    ["task-triage"],
  );
  assert.deepEqual(
    resolveInboxModeListItems(all, "agents").map((item) => item.id),
    ["task-agent"],
  );
  assert.deepEqual(
    resolveInboxModeListItems(all, "messages").map((item) => item.id),
    [email.id],
  );
});

test("resolveInboxListItemIdFromPathname matches inbox slug and email paths", () => {
  const notifications = resolveInboxModeListItems(all, "notifications");
  assert.equal(
    resolveInboxListItemIdFromPathname("/inbox/in-1", notifications),
    "task-triage",
  );
  assert.equal(
    resolveInboxListItemIdFromPathname("/email/box/msg-1", notifications),
    null,
  );
  const messages = resolveInboxModeListItems(all, "messages");
  assert.equal(
    resolveInboxListItemIdFromPathname("/email/box/msg-1", messages),
    email.id,
  );
});

test("resolveInboxOpenTarget leaves matching shell selection alone", () => {
  const items = resolveInboxModeListItems(all, "notifications");
  assert.equal(
    resolveInboxOpenTarget({
      mode: "notifications",
      shellPathname: "/inbox/in-1",
      items,
    }),
    null,
  );
});

test("resolveInboxOpenTarget opens highlight when shell is elsewhere", () => {
  const items = resolveInboxModeListItems(all, "notifications");
  const target = resolveInboxOpenTarget({
    mode: "notifications",
    shellPathname: "/email/box/msg-1",
    items,
    highlightedId: "task-triage",
  });
  assert.equal(target?.itemId, "task-triage");
  assert.equal(target?.reason, "highlight");
  assert.match(target?.href ?? "", /^\/inbox\//);
});

test("resolveInboxOpenTarget leaves email when Notifications is active", () => {
  const items = resolveInboxModeListItems(all, "notifications");
  const target = resolveInboxOpenTarget({
    mode: "notifications",
    shellPathname: "/email/box/msg-1",
    items,
  });
  assert.equal(target?.reason, "email-outside-messages");
  assert.equal(target?.itemId, "task-triage");
});

test("resolveInboxOpenTarget opens first row at inbox root", () => {
  const items = resolveInboxModeListItems(all, "notifications");
  const target = resolveInboxOpenTarget({
    mode: "notifications",
    shellPathname: "/inbox",
    items,
  });
  assert.equal(target?.reason, "inbox-root");
  assert.equal(target?.itemId, "task-triage");
});

test("resolveInboxPanelPathname drops email seed outside Messages", () => {
  const items = resolveInboxModeListItems(all, "notifications");
  const path = resolveInboxPanelPathname({
    shellPathname: "/email/box/msg-1",
    mode: "notifications",
    items,
  });
  assert.match(path, /^\/inbox\//);
});
