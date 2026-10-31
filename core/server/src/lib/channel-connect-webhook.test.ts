import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CHANNEL_CONNECT_WEBHOOK_EVENT,
  CHANNEL_CONNECT_WEBHOOK_SECRET_HEADER,
  postChannelConnectWebhook,
} from "./channel-connect-webhook.js";

describe("postChannelConnectWebhook", () => {
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
    };
    assert.equal(body.event, CHANNEL_CONNECT_WEBHOOK_EVENT);
    assert.equal(body.projectKey, "OS");
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
