import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import type { Agent } from "@backsteros/contracts";

import {
  agentHasWebhookUrl,
  agentReadyForChatRoster,
} from "./use-shell-agent-chat.js";
import {
  clearAgentWebhookVerified,
  markAgentWebhookVerified,
} from "../lib/shell-agent-webhook-verified.js";

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
    createdAt: "2026-10-30T00:00:00.000Z",
    updatedAt: "2026-10-30T00:00:00.000Z",
    ...partial,
  };
}

const memory = new Map<string, string>();

afterEach(() => {
  memory.clear();
});

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

describe("agentReadyForChatRoster", () => {
  it("requires URL, secret, and a successful local test mark", () => {
    const original = globalThis.window;
    // @ts-expect-error test stub
    globalThis.window = {
      localStorage: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => {
          memory.set(key, value);
        },
        removeItem: (key: string) => {
          memory.delete(key);
        },
      },
    };

    try {
      const ready = agent({
        id: "a",
        name: "Sander",
        webhookUrl: "https://hooks.example/sander",
        webhookSecretConfigured: true,
      });
      assert.equal(agentReadyForChatRoster(ready), false);
      markAgentWebhookVerified("a");
      assert.equal(agentReadyForChatRoster(ready), true);
      clearAgentWebhookVerified("a");
      assert.equal(
        agentReadyForChatRoster({
          ...ready,
          webhookSecretConfigured: false,
        }),
        false,
      );
    } finally {
      globalThis.window = original;
    }
  });
});
