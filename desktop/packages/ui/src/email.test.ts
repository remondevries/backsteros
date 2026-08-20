import assert from "node:assert/strict";
import { test } from "node:test";

import {
  emailListItemIsSelected,
  emailMailboxLabel,
  filterEmailListItems,
  collapseEmailListItemsByThread,
  formatEmailPersonWithAddress,
  getEmailDraftHref,
  getEmailItemHref,
  getEmailListItemHref,
  groupEmailItemsByMailbox,
  groupEmailItemsByStatus,
  isEmailPath,
  parseEmailDraftPath,
  parseEmailMessagePath,
  parseReplyToAddress,
  replySubject,
  resolveEmailListItemStatus,
} from "./email.js";

test("isEmailPath matches the email section", () => {
  assert.equal(isEmailPath("/email"), true);
  assert.equal(isEmailPath("/email/inbox/msg"), true);
  assert.equal(isEmailPath("/settings/email"), false);
  assert.equal(isEmailPath("/inbox"), false);
});

test("parseEmailMessagePath reads inbox and message ids", () => {
  assert.equal(parseEmailMessagePath("/email"), null);
  assert.deepEqual(parseEmailMessagePath("/email/in_1/msg_1"), {
    inboxId: "in_1",
    messageId: "msg_1",
  });
});

test("parseEmailDraftPath reads inbox and draft ids", () => {
  assert.deepEqual(parseEmailDraftPath("/email/in_1/drafts/d_1"), {
    inboxId: "in_1",
    draftId: "d_1",
  });
  assert.equal(parseEmailDraftPath("/email/in_1/msg_1"), null);
});

test("parseReplyToAddress extracts bare email", () => {
  assert.equal(
    parseReplyToAddress("Finance Team <finance@example.com>"),
    "finance@example.com",
  );
  assert.equal(parseReplyToAddress("ada@example.com"), "ada@example.com");
});

test("formatEmailPersonWithAddress keeps name and sender address", () => {
  assert.equal(
    formatEmailPersonWithAddress("Ada Lovelace", "Ada <ada@example.com>"),
    "Ada Lovelace (ada@example.com)",
  );
  assert.equal(
    formatEmailPersonWithAddress(null, "ada@example.com"),
    "ada@example.com",
  );
});

test("replySubject prefixes Re when missing", () => {
  assert.equal(replySubject("Invoice"), "Re: Invoice");
  assert.equal(replySubject("Re: Invoice"), "Re: Invoice");
  assert.equal(replySubject(""), "Re: (no subject)");
});

test("groupEmailItemsByMailbox keeps empty inboxes visible", () => {
  const items = [
    {
      kind: "message" as const,
      id: "1",
      inboxId: "a",
      subject: "Hello",
      from: "x",
      receivedAt: 1,
      conceptDraftId: "d1",
    },
    {
      kind: "draft" as const,
      id: "d1",
      inboxId: "a",
      subject: "Re: Hello",
      from: "Draft",
      receivedAt: 2,
      inReplyToMessageId: "1",
    },
  ];
  const groups = groupEmailItemsByMailbox(
    [
      { inboxId: "a", email: "a@example.com", displayName: "Ops" },
      { inboxId: "b", email: "b@example.com", displayName: null },
    ],
    filterEmailListItems(items),
  );
  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.label, "Ops");
  assert.equal(groups[0]?.items.length, 1);
  assert.equal(groups[0]?.items[0]?.conceptDraftId, "d1");
  assert.equal(groups[1]?.label, "b@example.com");
  assert.equal(groups[1]?.items.length, 0);
  assert.equal(
    emailMailboxLabel({
      inboxId: "b",
      email: "b@example.com",
      displayName: null,
    }),
    "b@example.com",
  );
  assert.equal(getEmailDraftHref("a", "d1"), "/email/a/drafts/d1");
  assert.equal(
    getEmailListItemHref({
      kind: "message",
      id: "1",
      inboxId: "a",
      subject: "Hello",
      from: "x",
      receivedAt: 1,
    }),
    "/email/a/1",
  );
  assert.equal(
    emailListItemIsSelected(
      {
        kind: "message",
        id: "1",
        inboxId: "a",
        subject: "Hello",
        from: "x",
        receivedAt: 1,
      },
      "/email/a/1",
    ),
    true,
  );
  assert.equal(getEmailItemHref("a", "1"), "/email/a/1");
});

test("groupEmailItemsByStatus defaults missing status to Inbox (triage)", () => {
  const items = [
    {
      kind: "message" as const,
      id: "1",
      inboxId: "a",
      subject: "Unset",
      from: "x",
      receivedAt: 3,
    },
    {
      kind: "message" as const,
      id: "2",
      inboxId: "a",
      subject: "In progress",
      from: "y",
      receivedAt: 2,
      status: "in_progress" as const,
    },
    {
      kind: "message" as const,
      id: "3",
      inboxId: "b",
      subject: "Older backlog",
      from: "z",
      receivedAt: 1,
      status: "backlog" as const,
    },
    {
      kind: "message" as const,
      id: "4",
      inboxId: "b",
      subject: "Done",
      from: "w",
      receivedAt: 0,
      status: "completed" as const,
    },
  ];
  assert.equal(resolveEmailListItemStatus(items[0]!), "triage");
  assert.equal(resolveEmailListItemStatus(items[2]!), "triage");
  const groups = groupEmailItemsByStatus(items);
  assert.equal(groups.length, 3);
  assert.equal(groups[0]?.status, "triage");
  assert.equal(groups[0]?.label, "Inbox");
  assert.equal(groups[0]?.items.map((item) => item.id).join(","), "1,3");
  assert.equal(groups[1]?.status, "in_progress");
  assert.equal(groups[1]?.label, "In Progress");
  assert.equal(groups[1]?.items[0]?.id, "2");
  assert.equal(groups[2]?.status, "completed");
  assert.equal(groups[2]?.label, "Archive");

  const withEmpty = groupEmailItemsByStatus(items, { includeEmpty: true });
  assert.equal(withEmpty.length, 5);
  assert.equal(
    withEmpty.find((group) => group.status === "on_hold")?.items.length,
    0,
  );
  assert.equal(
    withEmpty.find((group) => group.status === "canceled"),
    undefined,
  );
});

test("collapseEmailListItemsByThread keeps one row and prefers concept parent", () => {
  const items = [
    {
      kind: "message" as const,
      id: "msg_reply",
      inboxId: "in_1",
      subject: "Re: Factuur 8959599",
      from: "Remon",
      receivedAt: 200,
      threadId: "thread_1",
      status: "triage" as const,
    },
    {
      kind: "message" as const,
      id: "msg_root",
      inboxId: "in_1",
      subject: "Factuur 8959599",
      from: "Ralph",
      receivedAt: 100,
      threadId: "thread_1",
      conceptDraftId: "draft_1",
      status: "triage" as const,
    },
  ];
  const collapsed = collapseEmailListItemsByThread(items);
  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0]?.id, "msg_root");
  assert.equal(collapsed[0]?.conceptDraftId, "draft_1");
  assert.equal(collapsed[0]?.receivedAt, 200);
  assert.equal(collapsed[0]?.subject, "Factuur 8959599");
});
