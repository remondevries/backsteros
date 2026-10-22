import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  parseChatwootConversationFromWebhookPayload,
  parseChatwootMessagePayload,
} from "./chatwoot-client.js";

describe("parseChatwootConversationFromWebhookPayload", () => {
  test("message_created uses nested conversation id, not message id", () => {
    const summary = parseChatwootConversationFromWebhookPayload({
      event: "message_created",
      id: 9001,
      content: "Hello again",
      conversation_id: 7,
      conversation: {
        id: 7,
        inbox_id: 3,
        status: "open",
        meta: { sender: { name: "Visitor", email: "v@example.com" } },
        messages: [{ content: "Hello again" }],
      },
      sender: { name: "Visitor" },
    });
    assert.equal(summary?.id, "7");
    assert.notEqual(summary?.id, "9001");
    assert.equal(summary?.contact.name, "Visitor");
  });

  test("message_created falls back to conversation_id when nested object missing", () => {
    const summary = parseChatwootConversationFromWebhookPayload({
      event: "message_created",
      id: 42,
      conversation_id: 11,
      content: "Ping",
      sender: { name: "Ada" },
    });
    assert.equal(summary?.id, "11");
    assert.equal(summary?.contact.name, "Ada");
  });

  test("conversation_created still reads top-level conversation id", () => {
    const summary = parseChatwootConversationFromWebhookPayload({
      event: "conversation_created",
      id: 55,
      inbox_id: 2,
      status: "open",
      meta: { sender: { name: "Bob" } },
    });
    assert.equal(summary?.id, "55");
    assert.equal(summary?.contact.name, "Bob");
  });
});

describe("parseChatwootMessagePayload", () => {
  test("keeps message id separate from conversation id", () => {
    const message = parseChatwootMessagePayload({
      id: 9001,
      conversation_id: 7,
      content: "Hello",
      message_type: 0,
      created_at: 1_700_000_000,
    });
    assert.equal(message?.id, "9001");
    assert.equal(message?.conversationId, "7");
  });
});
