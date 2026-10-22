import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatConversation } from "@backsteros/contracts";

import {
  chatConversationsShareVisitor,
  previousChatConversations,
} from "./previous-chat-conversations.js";

function row(
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

describe("previousChatConversations", () => {
  it("matches by email and excludes the current thread", () => {
    const current = row({
      id: "c1",
      contactEmail: "Ada <ada@example.com>",
    });
    const older = row({
      id: "c0",
      contactEmail: "ada@example.com",
      lastActivityAt: "2026-01-01T00:00:00.000Z",
    });
    const other = row({
      id: "c2",
      contactEmail: "bob@example.com",
    });
    assert.deepEqual(
      previousChatConversations([current, older, other], current).map(
        (entry) => entry.id,
      ),
      ["c0"],
    );
  });

  it("matches by phone when emails are missing", () => {
    assert.equal(
      chatConversationsShareVisitor(
        { contactEmail: null, contactPhone: "+31 6 1550 8080", contactName: null },
        { contactEmail: null, contactPhone: "+31615508080", contactName: null },
      ),
      true,
    );
  });
});
