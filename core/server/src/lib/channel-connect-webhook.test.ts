import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  CHANNEL_CONNECT_WEBHOOK_EVENT,
  CHANNEL_CONNECT_WEBHOOK_SECRET_HEADER,
  postChannelConnectWebhook,
} from "./channel-connect-webhook.js";

const PREV = {
  role: process.env.CORE_REPLICATION_ROLE,
  peer: process.env.CORE_REPLICATION_PEER_URL,
  secret: process.env.CORE_REPLICATION_SECRET,
};

function applyEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  applyEnv("CORE_REPLICATION_ROLE", PREV.role);
  applyEnv("CORE_REPLICATION_PEER_URL", PREV.peer);
  applyEnv("CORE_REPLICATION_SECRET", PREV.secret);
});

describe("postChannelConnectWebhook", () => {
  it("forwards to cloud-core on hybrid local without resolving local secrets", async () => {
    applyEnv("CORE_REPLICATION_ROLE", "local");
    applyEnv("CORE_REPLICATION_PEER_URL", "http://127.0.0.1:3999");
    applyEnv("CORE_REPLICATION_SECRET", "test-secret");

    let hitUrl: string | null = null;
    const result = await postChannelConnectWebhook({
      workspaceId: "ws_test",
      payload: {
        event: CHANNEL_CONNECT_WEBHOOK_EVENT,
        projectId: "proj_1",
        projectKey: "OS",
        projectName: "BacksterOS",
        type: "codebase",
        requestedAt: "2026-10-31T12:00:00.000Z",
        leadAgentContactId: "contact_niels",
      },
      fetchImpl: (async (input) => {
        hitUrl = String(input);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ ok: true }),
        } as Response;
      }) as typeof fetch,
    });

    assert.equal(result.ok, true);
    assert.equal(
      hitUrl,
      "http://127.0.0.1:3999/internal/core-replication/channel-connect-webhook",
    );
  });

  it("POSTs payload with secret header and never requires a live network", async () => {
    let hit: {
      url: string;
      secretHeader: string | null;
      body: string;
    } | null = null;

    const result = await postChannelConnectWebhook({
      workspaceId: "ws_test",
      payload: {
        event: CHANNEL_CONNECT_WEBHOOK_EVENT,
        projectId: "proj_1",
        projectKey: "OS",
        projectName: "BacksterOS",
        type: "codebase",
        requestedAt: "2026-10-31T12:00:00.000Z",
        leadAgentContactId: "contact_niels",
      },
      configOverride: {
        url: "https://example.com/channel-connect",
        secret: "whsec_test_secret",
      },
      fetchImpl: (async (input, init) => {
        const headers = init?.headers as Record<string, string> | undefined;
        hit = {
          url: String(input),
          secretHeader: headers?.[CHANNEL_CONNECT_WEBHOOK_SECRET_HEADER] ?? null,
          body: String(init?.body ?? ""),
        };
        return { ok: true, status: 204 } as Response;
      }) as typeof fetch,
    });

    assert.equal(result.ok, true);
    assert.ok(hit);
    assert.equal(hit.url, "https://example.com/channel-connect");
    assert.equal(hit.secretHeader, "whsec_test_secret");
    const body = JSON.parse(hit.body) as {
      event: string;
      projectKey: string;
      leadAgentContactId: string | null;
    };
    assert.equal(body.event, CHANNEL_CONNECT_WEBHOOK_EVENT);
    assert.equal(body.projectKey, "OS");
    assert.equal(body.leadAgentContactId, "contact_niels");
  });

  it("returns a clear error when webhook is not configured", async () => {
    const result = await postChannelConnectWebhook({
      workspaceId: "ws_missing_secrets",
      payload: {
        event: CHANNEL_CONNECT_WEBHOOK_EVENT,
        projectId: "proj_1",
        projectKey: "OS",
        projectName: "BacksterOS",
        type: "codebase",
        requestedAt: "2026-10-31T12:00:00.000Z",
        leadAgentContactId: null,
      },
      configOverride: null,
      fetchImpl: async () => {
        throw new Error("should not fetch");
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /not configured/i);
    }
  });
});
