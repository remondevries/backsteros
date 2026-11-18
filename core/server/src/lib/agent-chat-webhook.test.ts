import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  AGENT_CHAT_WEBHOOK_SECRET_HEADER,
  buildAgentChatWebhookHeaders,
  decryptAgentChatWebhookSecret,
  encryptAgentChatWebhookSecret,
  isAgentsDoorChatReplyUrl,
  shouldRefuseLocalAgentChatWebhookWithCloudReplyUrl,
  validateAgentChatWebhookUrl,
} from "./agent-chat-webhook.js";

const PREV = {
  role: process.env.CORE_REPLICATION_ROLE,
  peer: process.env.CORE_REPLICATION_PEER_URL,
  secret: process.env.CORE_REPLICATION_SECRET,
};

function apply(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  apply("CORE_REPLICATION_ROLE", PREV.role);
  apply("CORE_REPLICATION_PEER_URL", PREV.peer);
  apply("CORE_REPLICATION_SECRET", PREV.secret);
});

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

describe("OS-192 local-core cloud replyUrl guard", () => {
  it("detects agents-door reply URLs", () => {
    assert.equal(
      isAgentsDoorChatReplyUrl(
        "https://agent.backsteros.com/api/v1/chat/threads/th_1/messages",
      ),
      true,
    );
    assert.equal(
      isAgentsDoorChatReplyUrl(
        "https://agents.backsteros.com/api/v1/chat/threads/th_1/messages",
      ),
      true,
    );
    assert.equal(
      isAgentsDoorChatReplyUrl(
        "http://127.0.0.1:8788/api/v1/chat/threads/th_1/messages",
      ),
      false,
    );
  });

  it("refuses cloud replyUrl on hybrid local-core", () => {
    apply("CORE_REPLICATION_ROLE", "local");
    apply("CORE_REPLICATION_PEER_URL", "http://127.0.0.1:3999");
    apply("CORE_REPLICATION_SECRET", "test-secret");
    assert.equal(
      shouldRefuseLocalAgentChatWebhookWithCloudReplyUrl(
        "https://agent.backsteros.com/api/v1/chat/threads/th_local/messages",
      ),
      true,
    );
  });

  it("refuses cloud replyUrl when ROLE=local without peer", () => {
    apply("CORE_REPLICATION_ROLE", "local");
    apply("CORE_REPLICATION_PEER_URL", undefined);
    apply("CORE_REPLICATION_SECRET", undefined);
    assert.equal(
      shouldRefuseLocalAgentChatWebhookWithCloudReplyUrl(
        "https://agent.backsteros.com/api/v1/chat/threads/th_local/messages",
      ),
      true,
    );
  });

  it("allows cloud replyUrl on cloud-core", () => {
    apply("CORE_REPLICATION_ROLE", "cloud");
    apply("CORE_REPLICATION_PEER_URL", "http://127.0.0.1:3999");
    apply("CORE_REPLICATION_SECRET", "test-secret");
    assert.equal(
      shouldRefuseLocalAgentChatWebhookWithCloudReplyUrl(
        "https://agent.backsteros.com/api/v1/chat/threads/th_1/messages",
      ),
      false,
    );
  });

  it("allows cloud replyUrl when ROLE unset and no peer (standalone tests)", () => {
    apply("CORE_REPLICATION_ROLE", undefined);
    apply("CORE_REPLICATION_PEER_URL", undefined);
    apply("CORE_REPLICATION_SECRET", undefined);
    assert.equal(
      shouldRefuseLocalAgentChatWebhookWithCloudReplyUrl(
        "https://agent.backsteros.com/api/v1/chat/threads/th_1/messages",
      ),
      false,
    );
  });

  it("refuses when peer is set and ROLE is unset (counts as local)", () => {
    apply("CORE_REPLICATION_ROLE", undefined);
    apply("CORE_REPLICATION_PEER_URL", "http://127.0.0.1:3999");
    apply("CORE_REPLICATION_SECRET", "test-secret");
    assert.equal(
      shouldRefuseLocalAgentChatWebhookWithCloudReplyUrl(
        "https://agent.backsteros.com/api/v1/chat/threads/th_local/messages",
      ),
      true,
    );
  });
});
