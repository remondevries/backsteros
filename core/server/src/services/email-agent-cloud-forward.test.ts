import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { buildEmailAgentCallbackUrl } from "./email-agent-callback-parse.js";
import {
  forwardEmailAgentDraftToCloud,
  shouldForwardEmailAgentWakeToCloud,
} from "./email-agent-cloud-forward.js";
import { resolveFileTaskCallbackPublicBase } from "./file-task-callback-parse.js";

const PREV = {
  role: process.env.CORE_REPLICATION_ROLE,
  peer: process.env.CORE_REPLICATION_PEER_URL,
  secret: process.env.CORE_REPLICATION_SECRET,
  agents: process.env.AGENTS_PUBLIC_URL,
  fileTask: process.env.FILE_TASK_CALLBACK_PUBLIC_URL,
};

function restoreEnv(): void {
  for (const [key, value] of [
    ["CORE_REPLICATION_ROLE", PREV.role],
    ["CORE_REPLICATION_PEER_URL", PREV.peer],
    ["CORE_REPLICATION_SECRET", PREV.secret],
    ["AGENTS_PUBLIC_URL", PREV.agents],
    ["FILE_TASK_CALLBACK_PUBLIC_URL", PREV.fileTask],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  restoreEnv();
});

describe("email-agent-cloud-forward (OS-100)", () => {
  it("forwards wakes only on hybrid local-core", () => {
    delete process.env.CORE_REPLICATION_PEER_URL;
    delete process.env.CORE_REPLICATION_SECRET;
    delete process.env.CORE_REPLICATION_ROLE;
    assert.equal(shouldForwardEmailAgentWakeToCloud(), false);

    process.env.CORE_REPLICATION_PEER_URL = "http://127.0.0.1:8799";
    process.env.CORE_REPLICATION_SECRET = "test-replication-secret";
    process.env.CORE_REPLICATION_ROLE = "local";
    assert.equal(shouldForwardEmailAgentWakeToCloud(), true);

    process.env.CORE_REPLICATION_ROLE = "cloud";
    assert.equal(shouldForwardEmailAgentWakeToCloud(), false);
  });

  it("mints agent.backsteros.com callbacks even when AGENTS_PUBLIC_URL is staging", () => {
    process.env.AGENTS_PUBLIC_URL = "https://staging.backsteros.com";
    delete process.env.FILE_TASK_CALLBACK_PUBLIC_URL;

    assert.equal(
      resolveFileTaskCallbackPublicBase(),
      "https://agent.backsteros.com",
    );
    const callbackUrl = buildEmailAgentCallbackUrl("req-os100", "eac_token");
    assert.equal(
      callbackUrl,
      "https://agent.backsteros.com/api/v1/public/email-agent-callbacks/req-os100?token=eac_token",
    );
    assert.equal(new URL(callbackUrl).hostname, "agent.backsteros.com");
  });

  it("forwards a local wake to cloud-core and expects a reachable agents-door callback", async () => {
    process.env.CORE_REPLICATION_PEER_URL = "http://127.0.0.1:8799";
    process.env.CORE_REPLICATION_SECRET = "test-replication-secret";
    process.env.CORE_REPLICATION_ROLE = "local";
    process.env.AGENTS_PUBLIC_URL = "https://staging.backsteros.com";

    const originalFetch = globalThis.fetch;
    let capturedUrl = "";
    let capturedBody: unknown = null;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
      const callbackUrl = buildEmailAgentCallbackUrl(
        "cloud-req-1",
        "eac_live",
      );
      assert.equal(new URL(callbackUrl).hostname, "agent.backsteros.com");
      return new Response(
        JSON.stringify({
          requestId: "cloud-req-1",
          language: "en",
          // Cloud would wake Judith with this URL; assert it here.
          _testCallbackUrl: callbackUrl,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const started = await forwardEmailAgentDraftToCloud({
        workspaceId: "ws_legacy_default",
        inboxId: "inbox_1",
        messageId: "msg_1",
        prompt: "Draft a short reply",
        intent: "reply_draft",
      });

      assert.equal(started.requestId, "cloud-req-1");
      assert.match(
        capturedUrl,
        /\/internal\/core-replication\/email-agent-draft$/,
      );
      assert.deepEqual(capturedBody, {
        workspace_id: "ws_legacy_default",
        inbox_id: "inbox_1",
        message_id: "msg_1",
        prompt: "Draft a short reply",
        intent: "reply_draft",
      });

      // Reachable public door for Judith (not staging).
      const doorUrl = buildEmailAgentCallbackUrl("cloud-req-1", "eac_live");
      assert.equal(
        doorUrl.startsWith(
          "https://agent.backsteros.com/api/v1/public/email-agent-callbacks/",
        ),
        true,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
