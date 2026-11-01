import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Agent } from "@backsteros/contracts";

import { preferAgentForApiKey } from "./prefer-agent-for-api-key.ts";

function agent(partial: Partial<Agent> & Pick<Agent, "id" | "name">): Agent {
  return {
    workspaceId: "ws",
    contactId: null,
    apiKeyId: "key-judith",
    avatarUrl: null,
    role: null,
    enabled: true,
    sortOrder: 0,
    webhookUrl: null,
    webhookSecretConfigured: false,
    webhookVerifiedAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...partial,
  };
}

describe("preferAgentForApiKey", () => {
  it("picks the Judith row that already has webhook credentials", () => {
    const empty = agent({
      id: "empty",
      name: "Judith",
      sortOrder: 0,
      webhookVerifiedAt: "2026-11-01T06:33:21.123Z",
    });
    const configured = agent({
      id: "configured",
      name: "Judith",
      sortOrder: 9,
      webhookUrl: "https://example.com/judith",
      webhookSecretConfigured: true,
    });
    const picked = preferAgentForApiKey([empty, configured], "key-judith");
    assert.equal(picked?.id, "configured");
  });
});
