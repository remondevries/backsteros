import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collapseEmailListItemsByThread,
  emailBelongsInInbox,
  emailPartyLabel,
  groupEmailItemsByStatus,
  isEmailIncomingStatus,
  resolveEmailThreadMetadataKey,
  resolveInboxEmailIconColor,
  type EmailListItem,
} from "./email-list.ts";

function item(overrides: Partial<EmailListItem> & { id: string }): EmailListItem {
  return {
    kind: "message",
    inboxId: "in_1",
    subject: "Subject",
    from: "Sender <sender@example.com>",
    receivedAt: 0,
    ...overrides,
  };
}

describe("collapseEmailListItemsByThread", () => {
  it("keeps one row per thread, newest timestamp, root metadata", () => {
    const rows = collapseEmailListItemsByThread([
      item({ id: "m1", threadId: "t1", receivedAt: 100, status: "triage" }),
      item({ id: "m2", threadId: "t1", receivedAt: 200, preview: "newest" }),
      item({ id: "m3", threadId: "t2", receivedAt: 150 }),
    ]);
    assert.equal(rows.length, 2);
    const t1 = rows.find((row) => row.threadId === "t1")!;
    assert.equal(t1.id, "m1");
    assert.equal(t1.receivedAt, 200);
    assert.equal(t1.preview, "newest");
  });

  it("prefers the message owning the concept draft", () => {
    const rows = collapseEmailListItemsByThread([
      item({ id: "m1", threadId: "t1", receivedAt: 100 }),
      item({ id: "m2", threadId: "t1", receivedAt: 200, conceptDraftId: "d1" }),
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.id, "m2");
    assert.equal(rows[0]!.conceptDraftId, "d1");
  });

  it("keeps draft rows as their own list items", () => {
    const rows = collapseEmailListItemsByThread([
      item({
        kind: "draft",
        id: "d1",
        receivedAt: 300,
        status: "concept",
      }),
      item({ id: "m1", threadId: "t1", receivedAt: 100 }),
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.kind, "draft");
    assert.equal(rows[0]!.id, "d1");
  });
});

describe("groupEmailItemsByStatus", () => {
  it("defaults untriaged mail to triage and sorts newest first", () => {
    const groups = groupEmailItemsByStatus([
      item({ id: "m1", receivedAt: 100 }),
      item({ id: "m2", receivedAt: 200 }),
      item({ id: "m3", status: "in_progress", receivedAt: 50 }),
    ]);
    assert.deepEqual(
      groups.map((group) => group.status),
      ["triage", "in_progress"],
    );
    assert.deepEqual(
      groups[0]!.items.map((entry) => entry.id),
      ["m2", "m1"],
    );
  });
});

describe("inbox rules", () => {
  it("treats empty / triage status as incoming", () => {
    assert.equal(isEmailIncomingStatus(null), true);
    assert.equal(isEmailIncomingStatus("triage"), true);
    assert.equal(isEmailIncomingStatus("in_progress"), false);
  });

  it("emailBelongsInInbox keeps undated triage; excludes today-or-later due", () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    assert.equal(emailBelongsInInbox({ status: null }), true);
    assert.equal(emailBelongsInInbox({ status: "triage" }), true);
    assert.equal(
      emailBelongsInInbox({ status: "triage", dueDate: today.getTime() }),
      false,
    );
    assert.equal(
      emailBelongsInInbox({ status: "triage", dueDate: tomorrow.getTime() }),
      false,
    );
    assert.equal(emailBelongsInInbox({ status: "backlog" }), false);
    assert.equal(emailBelongsInInbox({ status: "on_hold" }), true);
  });

  it("resolveInboxEmailIconColor uses triage orange for untriaged mail", () => {
    assert.equal(resolveInboxEmailIconColor(null), "#ee7a47");
    assert.equal(resolveInboxEmailIconColor("triage"), "#ee7a47");
    assert.equal(resolveInboxEmailIconColor("in_progress"), "#e9c141");
  });
});

describe("emailPartyLabel", () => {
  it("extracts the display name from Name <address> format", () => {
    assert.equal(emailPartyLabel("Remon de Vries <remon@example.com>"), "Remon de Vries");
    assert.equal(emailPartyLabel('"Quoted Name" <q@example.com>'), "Quoted Name");
    assert.equal(emailPartyLabel("bare@example.com"), "bare@example.com");
  });
});

describe("resolveEmailThreadMetadataKey", () => {
  it("uses draft:<id> for reply drafts with a parent threadId", () => {
    assert.equal(
      resolveEmailThreadMetadataKey({
        kind: "draft",
        draftId: "draft_reply_1",
        threadId: "thread_parent",
        messageId: "draft_reply_1",
      }),
      "draft:draft_reply_1",
    );
  });

  it("uses threadId for messages", () => {
    assert.equal(
      resolveEmailThreadMetadataKey({
        kind: "message",
        threadId: "thread_parent",
        messageId: "msg_1",
      }),
      "thread_parent",
    );
  });
});
