import assert from "node:assert/strict";
import { test } from "node:test";

import {
  emailListItemIsSelected,
  emailMailboxLabel,
  filterEmailListItems,
  getEmailDraftHref,
  getEmailItemHref,
  getEmailListItemHref,
  groupEmailItemsByMailbox,
  isEmailPath,
  parseEmailDraftPath,
  parseEmailMessagePath,
  parseReplyToAddress,
  replySubject,
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
