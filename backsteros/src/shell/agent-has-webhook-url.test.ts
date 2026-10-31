import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import type { Agent } from "@backsteros/contracts";

import {
  agentHasWebhookUrl,
  agentHasWebhookVerified,
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
    webhookVerifiedAt: null,
    createdAt: "2026-10-30T00:00:00.000Z",
    updatedAt: "2026-10-30T00:00:00.000Z",
    ...partial,
  };
}

/** Old-core agent JSON: property absent (not null). */
function oldCoreAgent(
  partial: Partial<Agent> & Pick<Agent, "id" | "name">,
): Agent {
  const row = agent(partial) as Agent & { webhookVerifiedAt?: string | null };
  delete row.webhookVerifiedAt;
  return row;
}

const memory = new Map<string, string>();

afterEach(() => {
  memory.clear();
});

function withLocalStorage(run: () => void): void {
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
    run();
  } finally {
    globalThis.window = original;
  }
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
  it("new core: uses webhookVerifiedAt even when null (ignores localStorage)", () => {
    withLocalStorage(() => {
      markAgentWebhookVerified("a");
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
      clearAgentWebhookVerified("a");
      assert.equal(agentReadyForChatRoster(verified), true);
    });
  });

  it("old core: omits webhookVerifiedAt and falls back to localStorage", () => {
    withLocalStorage(() => {
      const ready = oldCoreAgent({
        id: "a",
        name: "Sander",
        webhookUrl: "https://hooks.example/sander",
        webhookSecretConfigured: true,
      });
      assert.equal(
        Object.prototype.hasOwnProperty.call(ready, "webhookVerifiedAt"),
        false,
      );
      assert.equal(agentHasWebhookVerified(ready), false);
      assert.equal(agentReadyForChatRoster(ready), false);
      markAgentWebhookVerified("a");
      assert.equal(agentHasWebhookVerified(ready), true);
      assert.equal(agentReadyForChatRoster(ready), true);
      clearAgentWebhookVerified("a");
      assert.equal(agentReadyForChatRoster(ready), false);
    });
  });
});
