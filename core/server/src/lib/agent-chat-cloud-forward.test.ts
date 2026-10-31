import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  forwardAgentChatWebhookToCloud,
  shouldForwardAgentChatWebhookToCloud,
} from "./agent-chat-cloud-forward.js";
import { AGENT_CHAT_WEBHOOK_EVENT } from "./agent-chat-webhook.js";

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

describe("shouldForwardAgentChatWebhookToCloud", () => {
  it("is true only for hybrid local-core", () => {
    apply("CORE_REPLICATION_ROLE", "local");
    apply("CORE_REPLICATION_PEER_URL", "http://127.0.0.1:3999");
    apply("CORE_REPLICATION_SECRET", "test-secret");
    assert.equal(shouldForwardAgentChatWebhookToCloud(), true);

    apply("CORE_REPLICATION_ROLE", "cloud");
    assert.equal(shouldForwardAgentChatWebhookToCloud(), false);
  });
});

describe("forwardAgentChatWebhookToCloud", () => {
  it("POSTs payload to the cloud internal route with replication auth", async () => {
    apply("CORE_REPLICATION_ROLE", "local");
    apply("CORE_REPLICATION_PEER_URL", "http://127.0.0.1:3999");
    apply("CORE_REPLICATION_SECRET", "test-secret");

    let hit: { url: string; auth: string | null; body: string } | null = null;
    const result = await forwardAgentChatWebhookToCloud({
      workspaceId: "ws_1",
      agentId: "ag_lead",
      payload: {
        event: AGENT_CHAT_WEBHOOK_EVENT,
        workspaceId: "ws_1",
        agentId: "ag_lead",
        agentName: "Niels",
        threadId: "th_proj",
        replyUrl:
          "https://agent.backsteros.com/api/v1/chat/threads/th_proj/messages",
        message: {
          id: "msg_1",
          role: "user",
          text: "ship it",
          createdAt: "2026-10-31T12:00:00.000Z",
        },
        context: [],
        deliveryId: "deliv_1",
        timestamp: "2026-10-31T12:00:00.000Z",
        project: {
          id: "proj_1",
          key: "OS",
          name: "BacksterOS",
          channel: { uri: "grokbot://app/v1/agent?id=x", name: "BacksterOS" },
        },
      },
      fetchImpl: (async (input, init) => {
        const headers = init?.headers as Record<string, string> | undefined;
        hit = {
          url: String(input),
          auth: headers?.Authorization ?? null,
          body: String(init?.body ?? ""),
        };
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ ok: true }),
        } as Response;
      }) as typeof fetch,
    });

    assert.equal(result.ok, true);
    assert.ok(hit);
    assert.equal(
      hit.url,
      "http://127.0.0.1:3999/internal/core-replication/agent-chat-webhook",
    );
    assert.equal(hit.auth, "Bearer test-secret");
    const body = JSON.parse(hit.body) as {
      workspace_id: string;
      agent_id: string;
      payload: { project?: { key: string } };
    };
    assert.equal(body.workspace_id, "ws_1");
    assert.equal(body.agent_id, "ag_lead");
    assert.equal(body.payload.project?.key, "OS");
  });
});
