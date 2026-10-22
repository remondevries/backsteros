import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, test } from "node:test";

import {
  parseChatwootWebhookPayload,
  verifyChatwootWebhookSignature,
} from "./chatwoot-webhook.js";

describe("chatwoot webhook signature", () => {
  test("accepts valid sha256= HMAC over timestamp.body", () => {
    const secret = "whsec_test";
    const timestamp = "1700000000";
    const body = '{"event":"message_created","id":1}';
    const signature =
      "sha256=" +
      createHmac("sha256", secret)
        .update(`${timestamp}.${body}`, "utf8")
        .digest("hex");
    assert.equal(
      verifyChatwootWebhookSignature(secret, body, { signature, timestamp }, 1700000000),
      true,
    );
  });

  test("rejects wrong secret", () => {
    const timestamp = "1700000000";
    const body = '{"event":"message_created"}';
    const signature =
      "sha256=" +
      createHmac("sha256", "other")
        .update(`${timestamp}.${body}`, "utf8")
        .digest("hex");
    assert.equal(
      verifyChatwootWebhookSignature("whsec_test", body, { signature, timestamp }, 1700000000),
      false,
    );
  });

  test("rejects stale timestamp", () => {
    const secret = "whsec_test";
    const timestamp = "1700000000";
    const body = "{}";
    const signature =
      "sha256=" +
      createHmac("sha256", secret)
        .update(`${timestamp}.${body}`, "utf8")
        .digest("hex");
    assert.equal(
      verifyChatwootWebhookSignature(
        secret,
        body,
        { signature, timestamp },
        1700000000 + 600,
      ),
      false,
    );
  });
});

describe("chatwoot webhook parse", () => {
  test("parses message_created", () => {
    const parsed = parseChatwootWebhookPayload({
      event: "message_created",
      id: 42,
      conversation: { id: 7 },
      account: { id: 1 },
    });
    assert.equal(parsed?.event, "message_created");
    assert.equal(parsed?.messageId, "42");
    assert.equal(parsed?.conversationId, "7");
    assert.equal(parsed?.accountId, "1");
  });
});
