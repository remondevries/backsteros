import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Agent } from "@backsteros/contracts";

import {
  agentHasWebhookUrl,
  agentHasWebhookVerified,
  agentReadyForChatRoster,
} from "./use-shell-agent-chat.js";

function agent(partial: Partial<Agent> & Pick<Agent, "id" | "name">): Agent {
  return {
    workspaceId: "ws",
    contactId: null,
    apiKeyId: null,
    avatarUrl: null,
    role: null,
    enabled: true,
    sortOrder: 0,
    webhookUrl: null,
    webhookSecretConfigured: false,
    webhookVerifiedAt: null,
    createdAt: "2026-10-30T00:00:00.000Z",
    updatedAt: "2026-10-30T00:00:00.000Z",
    ...partial,
  };
}

describe("OS-155 agentHasWebhookUrl", () => {
  it("requires a non-empty webhook URL", () => {
    assert.equal(agentHasWebhookUrl(agent({ id: "a", name: "Sander" })), false);
    assert.equal(
      agentHasWebhookUrl(agent({ id: "a", name: "Sander", webhookUrl: "   " })),
      false,
    );
    assert.equal(
      agentHasWebhookUrl(
        agent({
          id: "a",
          name: "Sander",
          webhookUrl: "https://hooks.example/sander",
        }),
      ),
      true,
    );
  });
});

describe("OS-164 agentReadyForChatRoster", () => {
  it("requires URL, secret, and server webhookVerifiedAt", () => {
    const ready = agent({
      id: "a",
      name: "Sander",
      webhookUrl: "https://hooks.example/sander",
      webhookSecretConfigured: true,
      webhookVerifiedAt: null,
    });
    assert.equal(agentHasWebhookVerified(ready), false);
    assert.equal(agentReadyForChatRoster(ready), false);

    const verified = {
      ...ready,
      webhookVerifiedAt: "2026-11-01T00:00:00.000Z",
    };
    assert.equal(agentHasWebhookVerified(verified), true);
    assert.equal(agentReadyForChatRoster(verified), true);

    assert.equal(
      agentReadyForChatRoster({
        ...verified,
        webhookSecretConfigured: false,
      }),
      false,
    );
    assert.equal(
      agentReadyForChatRoster({
        ...verified,
        webhookUrl: null,
      }),
      false,
    );
  });
});
