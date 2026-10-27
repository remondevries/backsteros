import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatConversation } from "@backsteros/contracts";

import type { InboxEmailListItem } from "../inbox/inbox-items.js";
import {
  EMPTY_COMMUNICATION_CHAT_LIST_FILTERS,
  communicationChatListRowMatchesFilters,
  countCommunicationChatListFilters,
  encodeCommunicationChatListPartyValue,
  filterCommunicationChatListGroupsByFilters,
  parseCommunicationChatListPartyValue,
  type CommunicationChatListFilters,
} from "./communication-chat-list-filters.js";
import { groupCommunicationChatListRows } from "./communication-chat-list-row.js";

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
    contactUsername: null,
    contactId: null,
    organizationId: null,
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

describe("communicationChatListFilters", () => {
  it("encodes and parses party values", () => {
    assert.equal(
      encodeCommunicationChatListPartyValue({ kind: "contact", id: "c1" }),
      "contact:c1",
    );
    assert.deepEqual(parseCommunicationChatListPartyValue("organization:o1"), {
      kind: "organization",
      id: "o1",
    });
    assert.equal(parseCommunicationChatListPartyValue("__all__"), null);
  });

  it("counts active filters", () => {
    const filters: CommunicationChatListFilters = {
      ...EMPTY_COMMUNICATION_CHAT_LIST_FILTERS,
      kind: "email",
      activityFromYmd: "2026-01-01",
      priority: 1,
    };
    assert.equal(countCommunicationChatListFilters(filters), 3);
  });

  it("filters by kind, status, project, and party", () => {
    const groups = groupCommunicationChatListRows(
      [chat({ id: "c1", status: "open" })],
      [
        email({
          id: "e1",
          status: "triage",
          projectKey: "BSH",
          contactId: "contact-1",
          organizationId: "org-1",
        }),
        email({
          id: "e2",
          status: "waiting",
          projectKey: null,
        }),
      ],
    );

    const emailOnly = filterCommunicationChatListGroupsByFilters(groups, {
      ...EMPTY_COMMUNICATION_CHAT_LIST_FILTERS,
      kind: "email",
    });
    assert.deepEqual(
      emailOnly.flatMap((group) =>
        group.rows.map((row) =>
          row.kind === "chat" ? row.conversation.id : row.item.id,
        ),
      ),
      ["e1", "e2"],
    );

    const byProject = filterCommunicationChatListGroupsByFilters(groups, {
      ...EMPTY_COMMUNICATION_CHAT_LIST_FILTERS,
      projectKey: "BSH",
    });
    assert.deepEqual(
      byProject.flatMap((group) => group.rows.map((row) => row.item.id)),
      ["e1"],
    );

    const byParty = filterCommunicationChatListGroupsByFilters(groups, {
      ...EMPTY_COMMUNICATION_CHAT_LIST_FILTERS,
      party: { kind: "organization", id: "org-1" },
    });
    assert.deepEqual(
      byParty.flatMap((group) => group.rows.map((row) => row.item.id)),
      ["e1"],
    );
  });

  it("filters WhatsApp and X chats separately from other chats", () => {
    const whatsapp = {
      kind: "chat" as const,
      conversation: chat({
        id: "wa1",
        channelType: "Channel::Whatsapp",
      }),
    };
    const xChat = {
      kind: "chat" as const,
      conversation: chat({
        id: "x1",
        channelType: "Channel::TwitterProfile",
      }),
    };
    const telegram = {
      kind: "chat" as const,
      conversation: chat({
        id: "tg1",
        channelType: "Channel::Telegram",
      }),
    };
    assert.equal(
      communicationChatListRowMatchesFilters(whatsapp, {
        ...EMPTY_COMMUNICATION_CHAT_LIST_FILTERS,
        kind: "whatsapp",
      }),
      true,
    );
    assert.equal(
      communicationChatListRowMatchesFilters(xChat, {
        ...EMPTY_COMMUNICATION_CHAT_LIST_FILTERS,
        kind: "x",
      }),
      true,
    );
    assert.equal(
      communicationChatListRowMatchesFilters(telegram, {
        ...EMPTY_COMMUNICATION_CHAT_LIST_FILTERS,
        kind: "whatsapp",
      }),
      false,
    );
    assert.equal(
      communicationChatListRowMatchesFilters(telegram, {
        ...EMPTY_COMMUNICATION_CHAT_LIST_FILTERS,
        kind: "chat",
      }),
      true,
    );
    assert.equal(
      communicationChatListRowMatchesFilters(whatsapp, {
        ...EMPTY_COMMUNICATION_CHAT_LIST_FILTERS,
        kind: "chat",
      }),
      false,
    );
    assert.equal(
      communicationChatListRowMatchesFilters(xChat, {
        ...EMPTY_COMMUNICATION_CHAT_LIST_FILTERS,
        kind: "chat",
      }),
      false,
    );
  });

  it("matches chat party via resolve helpers", () => {
    const row = {
      kind: "chat" as const,
      conversation: chat({ id: "c1" }),
    };
    assert.equal(
      communicationChatListRowMatchesFilters(
        row,
        {
          ...EMPTY_COMMUNICATION_CHAT_LIST_FILTERS,
          party: { kind: "contact", id: "contact-ada" },
        },
        {
          resolveConversationContactId: () => "contact-ada",
        },
      ),
      true,
    );
    assert.equal(
      communicationChatListRowMatchesFilters(
        row,
        {
          ...EMPTY_COMMUNICATION_CHAT_LIST_FILTERS,
          party: { kind: "contact", id: "someone-else" },
        },
        {
          resolveConversationContactId: () => "contact-ada",
        },
      ),
      false,
    );
  });

  it("matches activity date range and due presets", () => {
    const row = {
      kind: "email" as const,
      item: email({
        id: "e1",
        updatedAt: Date.parse("2026-01-15T12:00:00.000Z"),
        dueDate: Date.parse("2026-01-20T12:00:00.000Z"),
      }),
    };
    assert.equal(
      communicationChatListRowMatchesFilters(row, {
        ...EMPTY_COMMUNICATION_CHAT_LIST_FILTERS,
        activityFromYmd: "2026-01-10",
        activityToYmd: "2026-01-16",
      }),
      true,
    );
    assert.equal(
      communicationChatListRowMatchesFilters(row, {
        ...EMPTY_COMMUNICATION_CHAT_LIST_FILTERS,
        activityFromYmd: "2026-01-16",
      }),
      false,
    );
    assert.equal(
      communicationChatListRowMatchesFilters(
        row,
        {
          ...EMPTY_COMMUNICATION_CHAT_LIST_FILTERS,
          due: "today",
        },
        { referenceDate: new Date("2026-01-20T08:00:00") },
      ),
      true,
    );
    assert.equal(
      communicationChatListRowMatchesFilters(
        {
          kind: "email",
          item: email({ id: "e2", dueDate: null }),
        },
        {
          ...EMPTY_COMMUNICATION_CHAT_LIST_FILTERS,
          due: "none",
        },
      ),
      true,
    );
  });
});
