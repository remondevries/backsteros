import assert from "node:assert/strict";
import { test } from "node:test";

import {
  emailListItemIsSelected,
  emailMessageBody,
  emailMessageHtmlBody,
  emailMessagePlainBody,
  emailMailboxLabel,
  filterEmailListItems,
  collapseEmailListItemsByThread,
  formatEmailPersonWithAddress,
  formatEmailListPartyLabel,
  getEmailComposeHref,
  getEmailDraftHref,
  getEmailItemHref,
  getEmailListItemHref,
  groupEmailItemsByMailbox,
  groupEmailItemsByStatus,
  isEmailInboxListContext,
  isEmailPath,
  parseEmailDraftPath,
  parseEmailMessagePath,
  parseReplyToAddress,
  preserveEmailInboxListContext,
  replySubject,
  resolveEmailListItemStatus,
  stripEmailDraftShell,
  withEmailInboxListContext,
} from "./email.js";

test("isEmailPath matches the email section", () => {
  assert.equal(isEmailPath("/email"), true);
  assert.equal(isEmailPath("/email/inbox/msg"), true);
  assert.equal(isEmailPath("/settings/email"), false);
  assert.equal(isEmailPath("/inbox"), false);
});

test("inbox list context is opt-in via ?list=inbox", () => {
  assert.equal(isEmailInboxListContext("?list=inbox"), true);
  assert.equal(isEmailInboxListContext("list=inbox"), true);
  assert.equal(isEmailInboxListContext(""), false);
  assert.equal(isEmailInboxListContext("?list=tasks"), false);
  assert.equal(
    withEmailInboxListContext("/email/a/1"),
    "/email/a/1?list=inbox",
  );
  assert.equal(
    preserveEmailInboxListContext("/email/a/2", "?list=inbox"),
    "/email/a/2?list=inbox",
  );
  assert.equal(
    preserveEmailInboxListContext("/email/a/2", "?list=tasks"),
    "/email/a/2?list=tasks",
  );
  assert.equal(
    preserveEmailInboxListContext("/email/a/2", ""),
    "/email/a/2",
  );
  assert.equal(getEmailComposeHref({ inboxList: true }), "/email/compose?list=inbox");
  assert.equal(getEmailComposeHref(), "/email/compose");
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

test("formatEmailListPartyLabel prefers contact name and From address", () => {
  assert.equal(
    formatEmailListPartyLabel(
      "Remon de Vries",
      "Remon <remon@lemo-design.com>",
    ),
    "Remon de Vries (remon@lemo-design.com)",
  );
  assert.equal(
    formatEmailListPartyLabel(null, "Remon de Vries <remon@lemo-design.com>"),
    "Remon de Vries (remon@lemo-design.com)",
  );
  assert.equal(formatEmailListPartyLabel(null, "remon@lemo-design.com"), "remon@lemo-design.com");
  assert.equal(formatEmailListPartyLabel(null, null), null);
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

test("groupEmailItemsByStatus uses task statuses and defaults missing status to Triage", () => {
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
  assert.equal(resolveEmailListItemStatus(items[2]!), "backlog");
  const groups = groupEmailItemsByStatus(items);
  assert.equal(groups.length, 4);
  assert.equal(groups[0]?.status, "triage");
  assert.equal(groups[0]?.label, "Triage");
  assert.equal(groups[0]?.items.map((item) => item.id).join(","), "1");
  assert.equal(groups[1]?.status, "backlog");
  assert.equal(groups[1]?.label, "Backlog");
  assert.equal(groups[1]?.items[0]?.id, "3");
  assert.equal(groups[2]?.status, "in_progress");
  assert.equal(groups[2]?.label, "In Progress");
  assert.equal(groups[2]?.items[0]?.id, "2");
  assert.equal(groups[3]?.status, "completed");
  assert.equal(groups[3]?.label, "Completed");

  const withEmpty = groupEmailItemsByStatus(items, { includeEmpty: true });
  assert.equal(withEmpty.length, 9);
  assert.equal(
    withEmpty.find((group) => group.status === "on_hold")?.items.length,
    0,
  );
  assert.equal(
    withEmpty.find((group) => group.status === "canceled")?.items.length,
    0,
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

test("stripEmailDraftShell removes greeting already shown above the body", () => {
  assert.equal(
    stripEmailDraftShell(
      ["Aan Remon,", "", "Bedankt voor je bericht."].join("\n"),
      { greeting: "Aan Remon," },
    ),
    "Bedankt voor je bericht.",
  );
});

test("emailMessagePlainBody prefers extracted text over html", () => {
  assert.equal(
    emailMessagePlainBody({
      extractedText: "Hello",
      html: "<p>Hello</p>",
    }),
    "Hello",
  );
});

test("emailMessagePlainBody strips tags from html fallback", () => {
  assert.equal(
    emailMessagePlainBody({
      html: "<p>Hello <strong>world</strong></p>",
    }),
    "Hello world",
  );
});

test("emailMessageHtmlBody prefers extracted html", () => {
  assert.equal(
    emailMessageHtmlBody({
      extractedHtml: "<p>Rendered</p>",
      html: "<p>Raw</p>",
    }),
    "<p>Rendered</p>",
  );
});

test("emailMessageHtmlBody uses raw html when extracted html is missing", () => {
  assert.equal(
    emailMessageHtmlBody({
      extractedText: "Plain",
      html: "<p>Raw</p>",
    }),
    "<p>Raw</p>",
  );
});

test("emailMessageBody is an alias for plain body", () => {
  assert.equal(emailMessageBody, emailMessagePlainBody);
});
