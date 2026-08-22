import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentMailMessageDetail } from "@backsteros/contracts";

import {
  buildEmailAgentHiddenContext,
  formatEmailAgentTaskCardComment,
  formatEmailReceivedForAgent,
  parseEmailAgentCommentResponse,
  parseEmailAgentTaskCard,
} from "./email-agent-prompt.ts";

function message(
  overrides: Partial<AgentMailMessageDetail> = {},
): AgentMailMessageDetail {
  return {
    kind: "message",
    inboxId: "in_1",
    messageId: "msg_1",
    subject: "Hello",
    from: "Ada <ada@example.com>",
    preview: null,
    timestamp: new Date().toISOString(),
    text: "Can we meet tomorrow?",
    html: null,
    extractedText: "Can we meet tomorrow?",
    extractedHtml: null,
    ...overrides,
  };
}

const richMessage = message({
  timestamp: "2026-08-19T10:00:00.000Z",
  inboxEmail: "hello@example.com",
  threadMetadata: {
    id: "t1",
    inboxId: "in_1",
    threadKey: "msg_1",
    organizationId: null,
    contactId: "c1",
    contactName: "Ada Lovelace",
    assigneeId: "a1",
    assigneeName: "Remon",
    projectId: null,
    status: "triage",
    priority: 0,
    dueDate: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  threadComments: [
    {
      id: "c1",
      emailThreadId: "t1",
      body: "Prefer Tuesday afternoon.",
      author: "user",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  conceptDraft: {
    draftId: "d1",
    inboxId: "in_1",
    subject: "Re: Hello",
    from: "hello@example.com",
    to: ["ada@example.com"],
    text: null,
    body: "Tuesday works.",
    greeting: null,
    signOff: null,
    preview: null,
    updatedAt: new Date().toISOString(),
  },
});

test("full bootstrap includes body, comments, draft, and fetch pointers", () => {
  const context = buildEmailAgentHiddenContext(richMessage, { depth: "full" });
  assert.match(context, /Prefer Tuesday afternoon/);
  assert.match(context, /Thread comments \(oldest → newest\)/);
  assert.match(context, /Can we meet tomorrow/);
  assert.match(context, /Ada Lovelace/);
  assert.match(context, /Tuesday works/);
  assert.match(context, /REPLY_DRAFT/);
  assert.match(context, /Timestamp:/);
  assert.match(context, /Thread census/);
  assert.match(context, /2026-08-19T10:00:00\.000Z/);
  assert.match(context, /GET \/api\/v1\/email\/inboxes\/in_1\/messages\/msg_1/);
});

test("full bootstrap lists all AgentMail thread messages when present", () => {
  const context = buildEmailAgentHiddenContext(
    message({
      threadMessages: [
        {
          messageId: "msg_1",
          subject: "Hello",
          from: "Ada <ada@example.com>",
          to: ["hello@example.com"],
          timestamp: "2026-08-19T10:00:00.000Z",
          text: "Can we meet tomorrow?",
          html: null,
          extractedText: "Can we meet tomorrow?",
          extractedHtml: null,
        },
        {
          messageId: "msg_2",
          subject: "Re: Hello",
          from: "hello@example.com",
          to: ["ada@example.com"],
          timestamp: "2026-08-19T11:00:00.000Z",
          text: "Tuesday works.",
          html: null,
          extractedText: "Tuesday works.",
          extractedHtml: null,
        },
      ],
    }),
    { depth: "full" },
  );
  assert.match(context, /Thread messages \(oldest → newest\)/);
  assert.match(context, /Message 1 \[received\] \(msg_1\)/);
  assert.match(context, /Message 2 \[received\] \(msg_2\)/);
  assert.match(context, /Tuesday works\./);
  assert.doesNotMatch(context, /--- Email body ---/);
});

test("lean follow-up omits full body and comment dump", () => {
  const context = buildEmailAgentHiddenContext(richMessage, { depth: "lean" });
  assert.match(context, /Email index/);
  assert.match(context, /Thread census/);
  assert.match(context, /Messages in this thread: 1 total/);
  assert.match(context, /Open reply draft: 1/);
  assert.match(context, /Thread message index/);
  assert.match(context, /Timestamp:/);
  assert.match(context, /Timeline comments: 1/);
  assert.match(context, /follow-up/i);
  assert.match(context, /GET \/api\/v1\/email\/inboxes\/in_1\/messages\/msg_1/);
  assert.doesNotMatch(context, /--- Email body ---/);
  assert.doesNotMatch(context, /Thread comments \(oldest → newest\)/);
  assert.doesNotMatch(context, /Tuesday works\./);
});

test("thread census counts sent vs received and excludes drafts", () => {
  const context = buildEmailAgentHiddenContext(
    message({
      inboxEmail: "hello@example.com",
      threadMessages: [
        {
          messageId: "msg_1",
          subject: "Hello",
          from: "Ada <ada@example.com>",
          to: ["hello@example.com"],
          timestamp: "2026-08-19T10:00:00.000Z",
          text: "Can we meet?",
          html: null,
          extractedText: "Can we meet?",
          extractedHtml: null,
        },
        {
          messageId: "msg_2",
          subject: "Re: Hello",
          from: "hello@example.com",
          to: ["ada@example.com"],
          timestamp: "2026-08-19T11:00:00.000Z",
          text: "Tuesday works.",
          html: null,
          extractedText: "Tuesday works.",
          extractedHtml: null,
        },
        {
          messageId: "msg_3",
          subject: "Re: Hello",
          from: "Ada <ada@example.com>",
          to: ["hello@example.com"],
          timestamp: "2026-08-19T12:00:00.000Z",
          text: "Confirmed.",
          html: null,
          extractedText: "Confirmed.",
          extractedHtml: null,
        },
        {
          messageId: "msg_4",
          subject: "Re: Hello",
          from: "hello@example.com",
          to: ["ada@example.com"],
          timestamp: "2026-08-19T13:00:00.000Z",
          text: "See you then.",
          html: null,
          extractedText: "See you then.",
          extractedHtml: null,
        },
      ],
      conceptDraft: {
        draftId: "d1",
        inboxId: "in_1",
        subject: "Re: Hello",
        from: "hello@example.com",
        to: ["ada@example.com"],
        text: null,
        body: "Looking forward to it.",
        greeting: null,
        signOff: null,
        preview: null,
        updatedAt: new Date().toISOString(),
      },
    }),
    { depth: "lean" },
  );
  assert.match(
    context,
    /Messages in this thread: 4 total \(2 sent from this inbox, 2 received\)/,
  );
  assert.match(context, /Open reply draft: 1 \(not sent/);
  assert.match(context, /\[sent\] hello@example.com/);
  assert.match(context, /\[received\] Ada <ada@example.com>/);
});

test("buildEmailAgentHiddenContext omits comments section when empty", () => {
  const context = buildEmailAgentHiddenContext(message({ threadComments: [] }));
  assert.doesNotMatch(context, /Thread comments \(oldest → newest\)/);
});

test("formatEmailReceivedForAgent keeps ISO and local wording", () => {
  const formatted = formatEmailReceivedForAgent("2026-08-19T10:00:00.000Z");
  assert.match(formatted, /ISO: 2026-08-19T10:00:00\.000Z/);
  assert.doesNotMatch(formatted, /^\(unknown\)$/);
});

test("parseEmailAgentCommentResponse drops acknowledgment when REPLY_DRAFT present", () => {
  const parsed = parseEmailAgentCommentResponse(
    [
      "Draft ready: confirms we understood the invoice.",
      "",
      "```REPLY_DRAFT",
      "Tuesday works for me.",
      "```",
    ].join("\n"),
  );
  assert.equal(parsed.commentBody, "");
  assert.equal(parsed.replyDraftBody, "Tuesday works for me.");
  assert.deepEqual(parsed.createTasks, []);
});

test("parseEmailAgentCommentResponse keeps comment when no draft block", () => {
  const parsed = parseEmailAgentCommentResponse(
    "We received this on Tuesday morning.",
  );
  assert.equal(parsed.commentBody, "We received this on Tuesday morning.");
  assert.equal(parsed.replyDraftBody, null);
  assert.deepEqual(parsed.createTasks, []);
});

test("parseEmailAgentCommentResponse with only draft block posts no comment", () => {
  const parsed = parseEmailAgentCommentResponse(
    ["```REPLY_DRAFT", "Body only.", "```"].join("\n"),
  );
  assert.equal(parsed.commentBody, "");
  assert.equal(parsed.replyDraftBody, "Body only.");
  assert.deepEqual(parsed.createTasks, []);
});

test("parseEmailAgentCommentResponse parses CREATE_TASK blocks", () => {
  const parsed = parseEmailAgentCommentResponse(
    [
      "Created a follow-up from this thread.",
      "",
      "```CREATE_TASK",
      '{"title":"Follow up on invoice","dueDate":"2026-08-25","priority":2,"inbox":true}',
      "```",
    ].join("\n"),
  );
  assert.equal(parsed.commentBody, "Created a follow-up from this thread.");
  assert.equal(parsed.replyDraftBody, null);
  assert.equal(parsed.createTasks.length, 1);
  assert.equal(parsed.createTasks[0]?.title, "Follow up on invoice");
  assert.equal(parsed.createTasks[0]?.dueDate, "2026-08-25T12:00:00.000Z");
  assert.equal(parsed.createTasks[0]?.priority, 2);
  assert.equal(parsed.createTasks[0]?.inbox, true);
});

test("parseEmailAgentCommentResponse keeps CREATE_TASK with REPLY_DRAFT", () => {
  const parsed = parseEmailAgentCommentResponse(
    [
      "Drafted a reply and a task.",
      "",
      "```REPLY_DRAFT",
      "Thanks — I'll follow up.",
      "```",
      "",
      "```CREATE_TASK",
      '{"title":"Send quote"}',
      "```",
    ].join("\n"),
  );
  assert.equal(parsed.commentBody, "Drafted a reply and a task.");
  assert.equal(parsed.replyDraftBody, "Thanks — I'll follow up.");
  assert.equal(parsed.createTasks.length, 1);
  assert.equal(parsed.createTasks[0]?.title, "Send quote");
});

test("format and parse TASK_CARD round-trip", () => {
  const body = formatEmailAgentTaskCardComment(
    {
      taskId: "task_1",
      number: 12,
      title: "Follow up on invoice",
      displayId: "BSH-12",
      projectKey: "BSH",
      projectName: "BacksterOS",
      projectIcon: null,
      dueDate: "2026-08-25T12:00:00.000Z",
      status: "triage",
      priority: 2,
      href: "/inbox/BSH-12",
    },
    "Created from this email.",
  );
  const parsed = parseEmailAgentTaskCard(body);
  assert.ok(parsed);
  assert.equal(parsed.card.taskId, "task_1");
  assert.equal(parsed.card.number, 12);
  assert.equal(parsed.card.title, "Follow up on invoice");
  assert.equal(parsed.card.displayId, "BSH-12");
  assert.equal(parsed.card.projectKey, "BSH");
  assert.equal(parsed.card.href, "/inbox/BSH-12");
  assert.equal(parsed.note, "Created from this email.");
});

test("draft revise context requires REPLY_DRAFT and includes current body", async () => {
  const { buildEmailDraftReviseAgentHiddenContext } = await import(
    "./email-agent-prompt.ts"
  );
  const context = buildEmailDraftReviseAgentHiddenContext(
    richMessage,
    "Please make Tuesday afternoon.",
  );
  assert.match(context, /revising a concept reply draft/i);
  assert.match(context, /draft edit mode/i);
  assert.match(context, /Please make Tuesday afternoon/);
  assert.match(context, /REPLY_DRAFT/);
  assert.match(context, /Can we meet tomorrow/);
  assert.doesNotMatch(context, /Default: respond in natural language/);
});
