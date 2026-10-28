import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAgentMessageWebhookHeaders,
  generateAgentMessageWebhookSecret,
  normalizeAgentMessageWebhookEvents,
  signAgentMessageBody,
  verifyAgentMessageSignature,
} from "./agent-message-webhook.js";
import {
  encryptWebhookSecret,
  decryptWebhookSecret,
} from "./auto-review-webhook.js";

describe("OS-146 agent message webhook HMAC", () => {
  it("signs and verifies the body with timestamp", () => {
    const secret = generateAgentMessageWebhookSecret();
    const body = JSON.stringify({ event: "chat.message", deliveryId: "d1" });
    const timestamp = new Date().toISOString();
    const signature = signAgentMessageBody({ body, timestamp, secret });
    assert.equal(
      verifyAgentMessageSignature({
        body,
        timestamp,
        secret,
        signature: `sha256=${signature}`,
      }),
      true,
    );
    assert.equal(
      verifyAgentMessageSignature({
        body,
        timestamp,
        secret,
        signature: "sha256=deadbeef",
      }),
      false,
    );
  });

  it("builds delivery headers", () => {
    const secret = "whsec_test";
    const body = "{}";
    const timestamp = "2026-10-28T00:00:00.000Z";
    const headers = buildAgentMessageWebhookHeaders({
      body,
      timestamp,
      secret,
      deliveryId: "del-1",
    });
    assert.equal(headers["content-type"], "application/json");
    assert.equal(headers["x-backsteros-timestamp"], timestamp);
    assert.equal(headers["x-backsteros-delivery-id"], "del-1");
    assert.match(headers["x-backsteros-signature"]!, /^sha256=[0-9a-f]+$/);
  });

  it("defaults events and encrypts secrets round-trip", () => {
    assert.deepEqual(normalizeAgentMessageWebhookEvents(undefined), [
      "chat.message",
      "email.message",
    ]);
    const secret = generateAgentMessageWebhookSecret();
    const cipher = encryptWebhookSecret(secret);
    assert.equal(decryptWebhookSecret(cipher), secret);
  });
});
