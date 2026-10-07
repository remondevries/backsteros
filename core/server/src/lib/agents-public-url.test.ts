import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_AGENTS_PUBLIC_URL,
  isAgentsDoorPublicBase,
  resolveAgentsPublicBase,
  resolveAgentsPublicWebhookBase,
} from "./agents-public-url.js";

describe("agents-public-url (OS-100)", () => {
  it("accepts only the agents HTTPS door hostnames", () => {
    assert.equal(isAgentsDoorPublicBase("https://agent.backsteros.com"), true);
    assert.equal(isAgentsDoorPublicBase("https://agents.backsteros.com/"), true);
    assert.equal(
      isAgentsDoorPublicBase("https://staging.backsteros.com"),
      false,
    );
    assert.equal(isAgentsDoorPublicBase("http://127.0.0.1:8788"), false);
  });

  it("ignores stale staging AGENTS_PUBLIC_URL for callback bases", () => {
    assert.equal(
      resolveAgentsPublicBase({
        AGENTS_PUBLIC_URL: "https://staging.backsteros.com",
      }),
      DEFAULT_AGENTS_PUBLIC_URL,
    );
    assert.equal(
      resolveAgentsPublicBase({
        FILE_TASK_CALLBACK_PUBLIC_URL: "https://staging.backsteros.com",
        AGENTS_PUBLIC_URL: "https://staging.backsteros.com",
      }),
      DEFAULT_AGENTS_PUBLIC_URL,
    );
    assert.equal(
      resolveAgentsPublicBase({
        AGENTS_PUBLIC_URL: "https://agent.backsteros.com",
      }),
      "https://agent.backsteros.com",
    );
  });

  it("refuses AgentMail webhook registration on local-core or dead hosts", () => {
    assert.equal(
      resolveAgentsPublicWebhookBase({
        AGENTS_PUBLIC_URL: "https://staging.backsteros.com",
      }),
      null,
    );
    assert.equal(
      resolveAgentsPublicWebhookBase({
        CORE_REPLICATION_ROLE: "local",
        AGENTS_PUBLIC_URL: "https://agent.backsteros.com",
      }),
      null,
    );
    assert.equal(
      resolveAgentsPublicWebhookBase({
        CORE_REPLICATION_ROLE: "cloud",
        AGENTS_PUBLIC_URL: "https://agent.backsteros.com",
      }),
      "https://agent.backsteros.com",
    );
  });
});
