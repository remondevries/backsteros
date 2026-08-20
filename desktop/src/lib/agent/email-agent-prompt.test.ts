import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentMailMessageDetail } from "@backsteros/contracts";

import {
  buildEmailAgentHiddenContext,
  formatEmailReceivedForAgent,
  parseEmailAgentCommentResponse,
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
  assert.match(context, /Received:/);
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
  assert.match(context, /Message 1 \(msg_1\)/);
  assert.match(context, /Message 2 \(msg_2\)/);
  assert.match(context, /Tuesday works\./);
  assert.doesNotMatch(context, /--- Email body ---/);
});

test("lean follow-up omits full body and comment dump", () => {
  const context = buildEmailAgentHiddenContext(richMessage, { depth: "lean" });
  assert.match(context, /Email index/);
  assert.match(context, /Received:/);
  assert.match(context, /Timeline comments: 1/);
  assert.match(context, /follow-up/i);
  assert.match(context, /GET \/api\/v1\/email\/inboxes\/in_1\/messages\/msg_1/);
  assert.doesNotMatch(context, /--- Email body ---/);
  assert.doesNotMatch(context, /Thread comments \(oldest → newest\)/);
  assert.doesNotMatch(context, /Tuesday works\./);
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
});

test("parseEmailAgentCommentResponse keeps comment when no draft block", () => {
  const parsed = parseEmailAgentCommentResponse(
    "We received this on Tuesday morning.",
  );
  assert.equal(parsed.commentBody, "We received this on Tuesday morning.");
  assert.equal(parsed.replyDraftBody, null);
});

test("parseEmailAgentCommentResponse with only draft block posts no comment", () => {
  const parsed = parseEmailAgentCommentResponse(
    ["```REPLY_DRAFT", "Body only.", "```"].join("\n"),
  );
  assert.equal(parsed.commentBody, "");
  assert.equal(parsed.replyDraftBody, "Body only.");
});
