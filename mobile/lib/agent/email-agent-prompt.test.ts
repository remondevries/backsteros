import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildEmailComposeAgentAcpPrompt,
  emailAgentTaskId,
  emailComposeAgentTaskId,
  extractAgentReplyBody,
  formatEmailAgentTaskCardComment,
  parseEmailAgentCommentResponse,
  parseEmailAgentTaskCard,
} from "./email-agent-prompt";

describe("extractAgentReplyBody", () => {
  it("strips greeting and sign-off shell", () => {
    assert.equal(
      extractAgentReplyBody(
        "Hi Ada,\n\nLooking forward to Tuesday.\n\nBest,\nRemon\n",
      ),
      "Looking forward to Tuesday.",
    );
  });

  it("returns empty for blank input", () => {
    assert.equal(extractAgentReplyBody("  "), "");
  });
});

describe("buildEmailComposeAgentAcpPrompt", () => {
  it("includes compose fields and user request", () => {
    const prompt = buildEmailComposeAgentAcpPrompt("Draft a polite intro", {
      fromEmail: "me@example.com",
      to: "ada@example.com",
      subject: "Hello",
    });
    assert.match(prompt, /me@example.com/);
    assert.match(prompt, /ada@example.com/);
    assert.match(prompt, /Draft a polite intro/);
    assert.match(prompt, /output ONLY the message body/i);
  });

  it("includes current draft when revising", () => {
    const prompt = buildEmailComposeAgentAcpPrompt("Make it shorter", {
      fromEmail: "me@example.com",
      to: "ada@example.com",
      subject: "Hello",
      currentDraftBody: "A long draft body here.",
    });
    assert.match(prompt, /Current draft body/);
    assert.match(prompt, /A long draft body here/);
  });
});

describe("email agent task ids", () => {
  it("uses stable compose and thread keys", () => {
    assert.equal(emailComposeAgentTaskId(), "email:compose");
    assert.equal(emailAgentTaskId("in_1", "msg_2"), "email:in_1:msg_2");
  });
});

describe("parseEmailAgentCommentResponse", () => {
  it("drops acknowledgment when REPLY_DRAFT present", () => {
    const parsed = parseEmailAgentCommentResponse(
      [
        "Draft ready.",
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

  it("keeps comment when no draft block", () => {
    const parsed = parseEmailAgentCommentResponse(
      "We received this on Tuesday morning.",
    );
    assert.equal(parsed.commentBody, "We received this on Tuesday morning.");
    assert.equal(parsed.replyDraftBody, null);
  });

  it("parses CREATE_TASK blocks", () => {
    const parsed = parseEmailAgentCommentResponse(
      [
        "Created a follow-up.",
        "",
        "```CREATE_TASK",
        '{"title":"Follow up on invoice","dueDate":"2026-08-25","priority":2,"inbox":true}',
        "```",
      ].join("\n"),
    );
    assert.equal(parsed.commentBody, "Created a follow-up.");
    assert.equal(parsed.createTasks.length, 1);
    assert.equal(parsed.createTasks[0]?.title, "Follow up on invoice");
    assert.equal(parsed.createTasks[0]?.priority, 2);
  });
});

describe("TASK_CARD round-trip", () => {
  it("formats and parses", () => {
    const body = formatEmailAgentTaskCardComment(
      {
        taskId: "t1",
        number: 3,
        title: "Follow up",
        displayId: "IN-3",
        href: "/task/t1",
      },
      "Linked from email.",
    );
    const parsed = parseEmailAgentTaskCard(body);
    assert.equal(parsed?.card.taskId, "t1");
    assert.equal(parsed?.card.displayId, "IN-3");
    assert.equal(parsed?.note, "Linked from email.");
  });
});
