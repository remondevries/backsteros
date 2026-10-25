import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatConversation } from "@backsteros/contracts";

import type { InboxEmailListItem } from "../inbox/inbox-items.js";
import type { InboxTaskListItem } from "../inbox/inbox-items.js";
import {
  communicationChatListRowMatchesQuery,
  communicationChatListVisibleRowIds,
  emailListItemPartyEmail,
  emailListItemPartyName,
  emailStatusToChatListStatus,
  isCommunicationEmailDraft,
  peelCommunicationDraftEmailRows,
  filterCommunicationChatListGroups,
  groupCommunicationChatListRows,
  supportListItemPartyName,
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
    assert.equal(emailStatusToChatListStatus("concept"), "open");
  });
});

describe("peelCommunicationDraftEmailRows", () => {
  it("lifts draft/concept emails out of status groups", () => {
    const draft = email({
      id: "d1",
      draftId: "draft-1",
      status: "concept",
      updatedAt: 200,
    });
    const sent = email({ id: "e1", status: "triage", updatedAt: 100 });
    const peeled = peelCommunicationDraftEmailRows([
      {
        status: "open",
        label: "Triage",
        rows: [
          { kind: "email", item: draft },
          { kind: "email", item: sent },
        ],
      },
    ]);
    assert.equal(peeled.drafts.length, 1);
    assert.equal(peeled.drafts[0]?.item.id, "d1");
    assert.equal(peeled.groups.length, 1);
    assert.equal(peeled.groups[0]?.rows.length, 1);
    assert.equal(
      peeled.groups[0]?.rows[0]?.kind === "email"
        ? peeled.groups[0].rows[0].item.id
        : null,
      "e1",
    );
    assert.equal(isCommunicationEmailDraft(draft), true);
    assert.equal(isCommunicationEmailDraft(sent), false);
  });
});

describe("communicationChatListVisibleRowIds", () => {
  it("lists drafts first, then status groups in on-screen order", () => {
    const groups = groupCommunicationChatListRows(
      [chat({ id: "c-done", status: "resolved" })],
      [
        email({ id: "d1", draftId: "draft-1", status: "concept" }),
        email({ id: "e-wait", status: "waiting" }),
        email({ id: "e-triage", status: "triage" }),
      ],
    );
    assert.deepEqual(
      communicationChatListVisibleRowIds(
        peelCommunicationDraftEmailRows(groups),
      ),
      ["d1", "e-triage", "e-wait", "c-done"],
    );
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

  it("prefers organization name when no contact is linked", () => {
    assert.equal(
      emailListItemPartyName(
        email({
          id: "e3",
          contactName: null,
          organizationName: "Acme Corp",
          partyLabel: "ops@acme.com",
        }),
      ),
      "Acme Corp",
    );
  });
});

function support(
  partial: Partial<InboxTaskListItem> & Pick<InboxTaskListItem, "id">,
): InboxTaskListItem {
  return {
    kind: "task",
    title: "Help request",
    status: "triage",
    number: 1,
    projectId: null,
    projectKey: "SUP",
    projectName: "Support",
    projectIcon: null,
    contactKey: null,
    assigneeId: null,
    priority: 0,
    dueDate: null,
    updatedAt: Date.parse("2026-01-02T15:00:00.000Z"),
    support: true,
    contactName: "Ada Lovelace",
    ...partial,
  };
}

describe("groupCommunicationChatListRows", () => {
  it("interleaves chats, emails, and support by recency within a status group", () => {
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
      [support({ id: "s1", status: "triage" })],
    );

    assert.deepEqual(
      groups.map((group) => [
        group.status,
        group.rows.map((row) =>
          row.kind === "chat" ? row.conversation.id : row.item.id,
        ),
      ]),
      [
        ["open", ["s1", "e1", "c1"]],
        ["pending", ["e2"]],
        ["resolved", ["c2"]],
      ],
    );
  });

  it("labels support parties from contact / org / project", () => {
    assert.equal(
      supportListItemPartyName(support({ id: "s1" })),
      "Ada Lovelace",
    );
    assert.equal(
      supportListItemPartyName(
        support({ id: "s2", contactName: null, organizationName: "Acme" }),
      ),
      "Acme",
    );
  });
});

describe("communicationChatListRowMatchesQuery", () => {
  it("matches chat contact fields and email subject/party", () => {
    assert.equal(
      communicationChatListRowMatchesQuery(
        { kind: "chat", conversation: chat({ id: "c1" }) },
        "ada",
      ),
      true,
    );
    assert.equal(
      communicationChatListRowMatchesQuery(
        { kind: "chat", conversation: chat({ id: "c1" }) },
        "hello",
      ),
      true,
    );
    assert.equal(
      communicationChatListRowMatchesQuery(
        { kind: "email", item: email({ id: "e1" }) },
        "subject",
      ),
      true,
    );
    assert.equal(
      communicationChatListRowMatchesQuery(
        { kind: "email", item: email({ id: "e1" }) },
        "nope",
      ),
      false,
    );
  });

  it("filters groups and drops empty status buckets", () => {
    const groups = groupCommunicationChatListRows(
      [chat({ id: "c1", status: "open" }), chat({ id: "c2", status: "resolved", contactName: "Bob" })],
      [email({ id: "e1", status: "triage", title: "Invoice" })],
    );
    const filtered = filterCommunicationChatListGroups(groups, "invoice");
    assert.deepEqual(
      filtered.map((group) => [
        group.status,
        group.rows.map((row) =>
          row.kind === "chat" ? row.conversation.id : row.item.id,
        ),
      ]),
      [["open", ["e1"]]],
    );
  });
});
