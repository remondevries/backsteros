import assert from "node:assert/strict";
import { test } from "node:test";

import type { ChatConversation } from "@backsteros/contracts";

import {
  buildInboxEmailListItem,
  buildInboxItemHrefById,
  buildInboxTaskListItem,
  getInboxItemHref,
} from "./inbox-items.js";
import { buildInboxMessagesModeItems } from "./inbox-messages-mode.js";
import {
  resolveInboxListItemIdFromPathname,
  resolveInboxOpenTarget,
} from "./inbox-open-selection.js";

function conversation(
  id: string,
  status: ChatConversation["status"],
  lastActivityAt: string,
): ChatConversation {
  return {
    id,
    externalId: id,
    status,
    contactName: `Visitor ${id}`,
    contactEmail: null,
    contactPhone: null,
    contactUsername: null,
    contactId: null,
    organizationId: null,
    lastMessagePreview: "hi",
    lastActivityAt,
    updatedAt: lastActivityAt,
    unread: false,
    dueDate: null,
    priority: 0,
    assigneeId: null,
  } as unknown as ChatConversation;
}

const openChat = conversation("chat-open", "open", "2026-10-20T10:00:00Z");
const resolvedChat = conversation("chat-done", "resolved", "2026-10-21T10:00:00Z");
const triageEmail = buildInboxEmailListItem({
  inboxId: "box",
  messageId: "msg-triage",
  title: "Hello",
  status: "triage",
  updatedAt: Date.parse("2026-10-19T10:00:00Z"),
});
const completedEmail = buildInboxEmailListItem({
  inboxId: "box",
  messageId: "msg-done",
  title: "Done",
  status: "completed",
  updatedAt: Date.parse("2026-10-22T10:00:00Z"),
});
const waitingSupport = buildInboxTaskListItem({
  id: "support-waiting",
  title: "Help",
  number: 9,
  status: "waiting",
  support: true,
});

test("buildInboxMessagesModeItems hides Completed and keeps list order", () => {
  const items = buildInboxMessagesModeItems({
    conversations: [openChat, resolvedChat],
    emails: [triageEmail, completedEmail],
    supportTasks: [waitingSupport],
  });
  // Triage (chat newer than email) → Waiting; no Completed rows.
  assert.deepEqual(
    items.map((item) => item.id),
    ["chat-open", triageEmail.id, "support-waiting"],
  );
  const chatRow = items[0];
  assert.equal(chatRow?.kind === "task" && chatRow.chat, true);
});

test("chat rows open inside Inbox, not Communication", () => {
  const [chatRow] = buildInboxMessagesModeItems({
    conversations: [openChat],
    emails: [],
    supportTasks: [],
  });
  assert.ok(chatRow);
  assert.equal(getInboxItemHref(chatRow), "/inbox/chat-open");
  assert.equal(
    buildInboxItemHrefById([chatRow]).get("chat-open"),
    "/inbox/chat-open",
  );
  assert.equal(
    resolveInboxListItemIdFromPathname("/inbox/chat-open", [chatRow]),
    "chat-open",
  );
});

test("resolveInboxOpenTarget treats a Communication path as a mode mismatch", () => {
  const items = buildInboxMessagesModeItems({
    conversations: [openChat],
    emails: [],
    supportTasks: [],
  });
  const target = resolveInboxOpenTarget({
    mode: "messages",
    shellPathname: "/communication/chat-open",
    items,
  });
  assert.equal(target?.href, "/inbox/chat-open");
  assert.equal(target?.reason, "mode-mismatch");
});
