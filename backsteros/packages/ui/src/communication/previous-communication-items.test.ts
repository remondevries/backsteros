import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatConversation } from "@backsteros/contracts";

import {
  previousCommunicationItemKind,
  previousCommunicationItems,
} from "./previous-communication-items.js";
import {
  buildInboxEmailListItem,
  buildInboxTaskListItem,
} from "../inbox/inbox-items.js";

function chat(
  partial: Partial<ChatConversation> & Pick<ChatConversation, "id">,
): ChatConversation {
  return {
    externalId: partial.externalId ?? partial.id,
    inboxId: null,
    inboxName: null,
    channelType: null,
    status: "open",
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    contactUsername: null,
    contactId: null,
    organizationId: null,
    contactAvatarUrl: null,
    lastMessagePreview: null,
    lastActivityAt: "2026-01-02T00:00:00.000Z",
    unread: false,
    assigneeId: null,
    priority: 0,
    dueDate: null,
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...partial,
  };
}

describe("previousCommunicationItems", () => {
  it("interleaves chats, emails, and support by activity and excludes current", () => {
    const current = chat({
      id: "chat-now",
      lastActivityAt: "2026-01-04T00:00:00.000Z",
    });
    const olderChat = chat({
      id: "chat-old",
      channelType: "Channel::Telegram",
      lastActivityAt: "2026-01-01T00:00:00.000Z",
    });
    const email = buildInboxEmailListItem({
      inboxId: "box",
      messageId: "m1",
      threadId: "t1",
      title: "Invoice",
      status: "triage",
      updatedAt: Date.parse("2026-01-03T00:00:00.000Z"),
    });
    const support = buildInboxTaskListItem({
      id: "sup-1",
      title: "Broken widget",
      number: 12,
      status: "waiting",
      support: true,
      updatedAt: Date.parse("2026-01-02T00:00:00.000Z"),
    });

    const rows = previousCommunicationItems({
      conversations: [current, olderChat],
      emails: [email],
      supportTasks: [support],
      excludeId: current.id,
    });

    assert.deepEqual(
      rows.map((row) =>
        row.kind === "chat" ? row.conversation.id : row.item.id,
      ),
      [email.id, support.id, olderChat.id],
    );
    assert.equal(previousCommunicationItemKind(rows[2]!), "telegram");
    assert.equal(previousCommunicationItemKind(rows[0]!), "email");
    assert.equal(previousCommunicationItemKind(rows[1]!), "support");
  });
});
