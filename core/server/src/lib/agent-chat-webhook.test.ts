import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AGENT_CHAT_WEBHOOK_SECRET_HEADER,
  buildAgentChatWebhookHeaders,
  decryptAgentChatWebhookSecret,
  encryptAgentChatWebhookSecret,
  validateAgentChatWebhookUrl,
} from "./agent-chat-webhook.js";

describe("OS-151 agent chat webhook secret handling", () => {
  it("encrypts secrets so plaintext never equals ciphertext", () => {
    const secret = "whsec_sander_test_secret";
    const ciphertext = encryptAgentChatWebhookSecret(secret);
    assert.notEqual(ciphertext, secret);
    assert.match(ciphertext, /^v1:/);
    assert.equal(decryptAgentChatWebhookSecret(ciphertext), secret);
  });

  it("never returns plaintext from a null/empty ciphertext", () => {
    assert.equal(decryptAgentChatWebhookSecret(null), null);
    assert.equal(decryptAgentChatWebhookSecret(""), null);
    assert.equal(decryptAgentChatWebhookSecret("   "), null);
  });

  it("puts the auth secret only in request headers, not the URL", () => {
    const headers = buildAgentChatWebhookHeaders({
      secret: "whsec_header_only",
      deliveryId: "deliv-1",
    });
    assert.equal(headers[AGENT_CHAT_WEBHOOK_SECRET_HEADER], "whsec_header_only");
    assert.equal(headers.authorization, "Bearer whsec_header_only");
    assert.equal(headers["content-type"], "application/json");
    assert.equal(headers["x-backsteros-delivery-id"], "deliv-1");
  });

  it("omits secret headers when no secret is configured", () => {
    const headers = buildAgentChatWebhookHeaders({
      secret: null,
      deliveryId: "deliv-2",
    });
    assert.equal(headers[AGENT_CHAT_WEBHOOK_SECRET_HEADER], undefined);
    assert.equal(headers.authorization, undefined);
  });

  it("allows clearing the webhook URL and rejects bad URLs", () => {
    assert.deepEqual(validateAgentChatWebhookUrl(""), {
      ok: true,
      url: null,
    });
    const bad = validateAgentChatWebhookUrl("not-a-url");
    assert.equal(bad.ok, false);
  });
});
