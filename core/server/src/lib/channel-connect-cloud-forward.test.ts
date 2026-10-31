import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  forwardChannelConnectWebhookToCloud,
  shouldForwardChannelConnectWebhookToCloud,
} from "./channel-connect-cloud-forward.js";
import { CHANNEL_CONNECT_WEBHOOK_EVENT } from "./channel-connect-webhook.js";

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

describe("shouldForwardChannelConnectWebhookToCloud", () => {
  it("is true only for hybrid local-core", () => {
    apply("CORE_REPLICATION_ROLE", "local");
    apply("CORE_REPLICATION_PEER_URL", "http://127.0.0.1:3999");
    apply("CORE_REPLICATION_SECRET", "test-secret");
    assert.equal(shouldForwardChannelConnectWebhookToCloud(), true);

    apply("CORE_REPLICATION_ROLE", "cloud");
    assert.equal(shouldForwardChannelConnectWebhookToCloud(), false);
  });
});

describe("forwardChannelConnectWebhookToCloud", () => {
  it("POSTs payload to the cloud internal route with replication auth", async () => {
    apply("CORE_REPLICATION_ROLE", "local");
    apply("CORE_REPLICATION_PEER_URL", "http://127.0.0.1:3999");
    apply("CORE_REPLICATION_SECRET", "test-secret");

    let hit: { url: string; auth: string | null; body: string } | null = null;
    const result = await forwardChannelConnectWebhookToCloud({
      workspaceId: "ws_1",
      payload: {
        event: CHANNEL_CONNECT_WEBHOOK_EVENT,
        projectId: "proj_1",
        projectKey: "OS",
        projectName: "BacksterOS",
        type: "codebase",
        requestedAt: "2026-10-31T12:00:00.000Z",
        leadAgentContactId: "contact_niels",
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
      "http://127.0.0.1:3999/internal/core-replication/channel-connect-webhook",
    );
    assert.equal(hit.auth, "Bearer test-secret");
    const body = JSON.parse(hit.body) as {
      workspace_id: string;
      payload: { leadAgentContactId: string | null };
    };
    assert.equal(body.workspace_id, "ws_1");
    assert.equal(body.payload.leadAgentContactId, "contact_niels");
  });
});
