import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  AGENT_CHAT_WEBHOOK_EVENT,
  AGENT_CHAT_WEBHOOK_SECRET_HEADER,
  encryptAgentChatWebhookSecret,
} from "../lib/agent-chat-webhook.js";
import { deliverAgentChatWebhook } from "./agent-chat.js";

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

describe("OS-150 agent chat webhook delivery", () => {
  it("POSTs thread id, message, context, and secret header", async () => {
    // Simulate cloud-core delivery (local .env may be ROLE=local).
    apply("CORE_REPLICATION_ROLE", "cloud");
    apply("CORE_REPLICATION_PEER_URL", "http://127.0.0.1:3999");
    apply("CORE_REPLICATION_SECRET", "test-secret");

    const secret = "whsec_chat_loop";
    let posted: {
      url: string;
      secretHeader: string | null;
      authorization: string | null;
      body: string;
    } | null = null;

    const result = await deliverAgentChatWebhook(
      {
        event: AGENT_CHAT_WEBHOOK_EVENT,
        workspaceId: "ws_1",
        agentId: "ag_sander",
        agentName: "Sander",
        threadId: "th_1",
        replyUrl:
          "https://agent.backsteros.com/api/v1/chat/threads/th_1/messages",
        message: {
          id: "msg_new",
          role: "user",
          text: "hello",
          createdAt: "2026-10-30T12:00:00.000Z",
        },
        context: [
          {
            id: "msg_old",
            role: "assistant",
            text: "hi before",
            createdAt: "2026-10-30T11:59:00.000Z",
          },
          {
            id: "msg_new",
            role: "user",
            text: "hello",
            createdAt: "2026-10-30T12:00:00.000Z",
          },
        ],
        deliveryId: "deliv-chat",
        timestamp: "2026-10-30T12:00:00.000Z",
      },
      {
        webhookUrl: "https://hooks.example/sander",
        webhookSecretCiphertext: encryptAgentChatWebhookSecret(secret),
      },
      {
        skipCloudForward: true,
        fetchImpl: async (url, init) => {
          const headers = new Headers(init?.headers);
          posted = {
            url: String(url),
            secretHeader: headers.get(AGENT_CHAT_WEBHOOK_SECRET_HEADER),
            authorization: headers.get("authorization"),
            body: String(init?.body ?? ""),
          };
          return new Response("ok", { status: 200 });
        },
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.error, null);
    assert.ok(posted);
    assert.equal(posted.url, "https://hooks.example/sander");
    assert.equal(posted.secretHeader, secret);
    assert.equal(posted.authorization, `Bearer ${secret}`);
    const parsed = JSON.parse(posted.body) as {
      event: string;
      threadId: string;
      replyUrl: string;
      message: { text: string };
      context: unknown[];
    };
    assert.equal(parsed.event, "agent.chat.message");
    assert.equal(parsed.threadId, "th_1");
    assert.equal(
      parsed.replyUrl,
      "https://agent.backsteros.com/api/v1/chat/threads/th_1/messages",
    );
    assert.equal(parsed.message.text, "hello");
    assert.equal(parsed.context.length, 2);
    // Ciphertext must never appear in the outbound body.
    assert.equal(posted.body.includes("v1:"), false);
    assert.equal(posted.body.includes(secret), false);
  });

  it("refuses local-core delivery with a cloud replyUrl (OS-192)", async () => {
    apply("CORE_REPLICATION_ROLE", "local");
    apply("CORE_REPLICATION_PEER_URL", "http://127.0.0.1:3999");
    apply("CORE_REPLICATION_SECRET", "test-secret");

    let posted = false;
    const result = await deliverAgentChatWebhook(
      {
        event: AGENT_CHAT_WEBHOOK_EVENT,
        workspaceId: "ws_1",
        agentId: "ag_fabianne",
        agentName: "Fabianne",
        threadId: "bo_JGm1He39I-zcbyEkLa",
        replyUrl:
          "https://agent.backsteros.com/api/v1/chat/threads/bo_JGm1He39I-zcbyEkLa/messages",
        message: {
          id: "msg_1",
          role: "user",
          text: "hello",
          createdAt: "2026-11-18T11:09:00.000Z",
        },
        context: [],
        deliveryId: "deliv-local",
        timestamp: "2026-11-18T11:09:00.000Z",
      },
      {
        id: "ag_fabianne",
        webhookUrl: "https://hooks.example/fabianne",
        webhookSecretCiphertext: null,
      },
      {
        skipCloudForward: true,
        fetchImpl: async () => {
          posted = true;
          return new Response("ok", { status: 200 });
        },
      },
    );

    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /OS-192/);
    assert.equal(posted, false);
  });

  it("reports failure when the webhook returns non-2xx", async () => {
    apply("CORE_REPLICATION_ROLE", "cloud");
    apply("CORE_REPLICATION_PEER_URL", "http://127.0.0.1:3999");
    apply("CORE_REPLICATION_SECRET", "test-secret");

    const result = await deliverAgentChatWebhook(
      {
        event: AGENT_CHAT_WEBHOOK_EVENT,
        workspaceId: "ws_1",
        agentId: "ag_1",
        agentName: "Sander",
        threadId: "th_1",
        replyUrl:
          "https://agent.backsteros.com/api/v1/chat/threads/th_1/messages",
        message: {
          id: "m1",
          role: "user",
          text: "hi",
          createdAt: "2026-10-30T12:00:00.000Z",
        },
        context: [],
        deliveryId: "d1",
        timestamp: "2026-10-30T12:00:00.000Z",
      },
      {
        webhookUrl: "https://hooks.example/fail",
        webhookSecretCiphertext: null,
      },
      {
        skipCloudForward: true,
        fetchImpl: async () => new Response("nope", { status: 500 }),
      },
    );
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /HTTP 500/);
  });
});
