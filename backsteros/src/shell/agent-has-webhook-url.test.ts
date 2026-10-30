import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Agent } from "@backsteros/contracts";

import { agentHasWebhookUrl } from "./use-shell-agent-chat.js";

function agent(partial: Partial<Agent> & Pick<Agent, "id" | "name">): Agent {
  return {
    workspaceId: "ws",
    contactId: null,
    apiKeyId: null,
    avatarUrl: null,
    role: null,
    enabled: true,
    webhookUrl: null,
    webhookSecretConfigured: false,
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
