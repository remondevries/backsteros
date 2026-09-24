import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  authorizationHeaderFromWebhookKey,
  buildEmailGrokWakePayload,
  EMAIL_AGENT_ALLOWED_INTENTS,
  resolveEmailAgentLanguage,
} from "./email-grok-wake.js";

describe("resolveEmailAgentLanguage", () => {
  it("prefers contact language", () => {
    assert.equal(
      resolveEmailAgentLanguage({
        contactLanguages: ["nl"],
        counterpartEmail: "ada@example.com",
        messageText: "Hello thanks regards",
      }),
      "nl",
    );
  });

  it("uses .nl TLD when no contact language", () => {
    assert.equal(
      resolveEmailAgentLanguage({
        contactLanguages: [],
        counterpartEmail: "Ada <ada@bedrijf.nl>",
        messageText: "Hello thanks",
      }),
      "nl",
    );
  });

  it("falls back to body detection", () => {
    assert.equal(
      resolveEmailAgentLanguage({
        contactLanguages: [],
        counterpartEmail: "ada@example.com",
        messageText: "Met vriendelijke groet, bedankt voor het bericht",
      }),
      "nl",
    );
  });
});

describe("buildEmailGrokWakePayload", () => {
  it("wakes as email.agent_command with allowed intents", () => {
    const payload = buildEmailGrokWakePayload({
      requestId: "req-1",
      callbackUrl:
        "https://agent.backsteros.com/api/v1/public/email-agent-callbacks/req-1?token=x",
      language: "nl",
      userPrompt: "Zeg dankjewel",
      inboxId: "in_1",
      messageId: "msg_1",
      threadId: "th_1",
      from: "Ada <ada@bedrijf.nl>",
      to: ["sander@agentmail.to"],
      subject: "Hallo",
      text: "Beste, ...",
    });
    assert.equal(payload.kind, "email.agent_command");
    assert.equal(payload.language, "nl");
    assert.equal(payload.userPrompt, "Zeg dankjewel");
    assert.equal(payload.intent, null);
    assert.deepEqual(payload.allowedIntents, [...EMAIL_AGENT_ALLOWED_INTENTS]);
    assert.match(
      payload.instructions.join("\n"),
      /Classify intent from userPrompt/,
    );
    assert.match(payload.instructions.join("\n"), /reply_draft/);
    assert.match(payload.instructions.join("\n"), /Dutch/);
    assert.ok(payload.callbackUrl.includes("email-agent-callbacks"));
  });

  it("fixes reply_draft intent and skips classification", () => {
    const payload = buildEmailGrokWakePayload({
      requestId: "req-2",
      callbackUrl:
        "https://agent.backsteros.com/api/v1/public/email-agent-callbacks/req-2?token=x",
      language: "en",
      userPrompt: "Say thanks",
      inboxId: "in_1",
      messageId: "msg_1",
      intent: "reply_draft",
      from: "Ada <ada@example.com>",
      to: ["sander@agentmail.to"],
      subject: "Hello",
      text: "Hi there",
    });
    assert.equal(payload.intent, "reply_draft");
    assert.deepEqual(payload.allowedIntents, ["reply_draft"]);
    assert.match(payload.instructions.join("\n"), /Intent is FIXED: reply_draft/);
    assert.doesNotMatch(
      payload.instructions.join("\n"),
      /Classify intent from userPrompt/,
    );
    assert.match(payload.instructions.join("\n"), /English/);
  });
});

describe("authorizationHeaderFromWebhookKey", () => {
  it("adds Bearer when missing", () => {
    assert.equal(authorizationHeaderFromWebhookKey("abc"), "Bearer abc");
    assert.equal(
      authorizationHeaderFromWebhookKey("Bearer already"),
      "Bearer already",
    );
  });
});
