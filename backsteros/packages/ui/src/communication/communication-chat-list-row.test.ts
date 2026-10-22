import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatConversation } from "@backsteros/contracts";

import type { InboxEmailListItem } from "../inbox/inbox-items.js";
import {
  emailListItemPartyEmail,
  emailListItemPartyName,
  emailStatusToChatListStatus,
  groupCommunicationChatListRows,
} from "./communication-chat-list-row.js";

function chat(
  partial: Partial<ChatConversation> & Pick<ChatConversation, "id">,
): ChatConversation {
  return {
    externalId: partial.externalId ?? "12",
    inboxId: null,
    inboxName: "Website",
    channelType: "web",
    status: "open",
    contactName: "Ada Lovelace",
    contactEmail: "ada@example.com",
    contactPhone: null,
    contactAvatarUrl: null,
    lastMessagePreview: "Hello there",
    lastActivityAt: "2026-01-02T12:00:00.000Z",
    unread: false,
    assigneeId: null,
    priority: 0,
    dueDate: null,
    updatedAt: "2026-01-02T12:00:00.000Z",
    ...partial,
  };
}

function email(
  partial: Partial<InboxEmailListItem> & Pick<InboxEmailListItem, "id">,
): InboxEmailListItem {
  return {
    kind: "email",
    inboxId: "inbox-1",
    messageId: "msg-1",
    threadId: "thread-1",
    title: "Subject line",
    partyLabel: "Ada Lovelace (ada@example.com)",
    status: "triage",
    priority: 0,
    dueDate: null,
    updatedAt: Date.parse("2026-01-02T13:00:00.000Z"),
    assigneeId: null,
    projectId: null,
    projectKey: null,
    projectName: null,
    projectIcon: null,
    ...partial,
  };
}

describe("emailStatusToChatListStatus", () => {
  it("maps task statuses into shared Triage/Waiting/On Hold/Completed buckets", () => {
    assert.equal(emailStatusToChatListStatus("triage"), "open");
    assert.equal(emailStatusToChatListStatus("in_progress"), "open");
    assert.equal(emailStatusToChatListStatus("waiting"), "pending");
    assert.equal(emailStatusToChatListStatus("on_hold"), "snoozed");
    assert.equal(emailStatusToChatListStatus("backlog"), "snoozed");
    assert.equal(emailStatusToChatListStatus("completed"), "resolved");
  });
});

describe("emailListItemParty*", () => {
  it("extracts name and email from party labels", () => {
    const item = email({ id: "e1" });
    assert.equal(emailListItemPartyName(item), "Ada Lovelace");
    assert.equal(emailListItemPartyEmail(item), "ada@example.com");
    assert.equal(
      emailListItemPartyEmail(email({ id: "e2", partyLabel: "bob@x.test" })),
      "bob@x.test",
    );
  });
});

describe("groupCommunicationChatListRows", () => {
  it("interleaves chats and emails by recency within a status group", () => {
    const groups = groupCommunicationChatListRows(
      [
        chat({
          id: "c1",
          status: "open",
          lastActivityAt: "2026-01-02T12:00:00.000Z",
        }),
        chat({
          id: "c2",
          status: "resolved",
          lastActivityAt: "2026-01-01T12:00:00.000Z",
        }),
      ],
      [
        email({
          id: "e1",
          status: "triage",
          updatedAt: Date.parse("2026-01-02T14:00:00.000Z"),
        }),
        email({
          id: "e2",
          status: "waiting",
          updatedAt: Date.parse("2026-01-02T11:00:00.000Z"),
        }),
      ],
    );

    assert.deepEqual(
      groups.map((group) => [
        group.status,
        group.rows.map((row) =>
          row.kind === "chat" ? row.conversation.id : row.item.id,
        ),
      ]),
      [
        ["open", ["e1", "c1"]],
        ["pending", ["e2"]],
        ["resolved", ["c2"]],
      ],
    );
  });
});
