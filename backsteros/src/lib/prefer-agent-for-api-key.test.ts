import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Agent } from "@backsteros/contracts";

import {
  existingAgentIdFromConflict,
  preferAgentForApiKey,
} from "./prefer-agent-for-api-key.ts";

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

  it("prefers the enabled row over a disabled duplicate", () => {
    const disabled = agent({
      id: "disabled",
      name: "Judith",
      enabled: false,
      webhookUrl: "https://example.com/judith",
      webhookSecretConfigured: true,
      webhookVerifiedAt: "2026-11-01T06:33:21.123Z",
    });
    const enabled = agent({ id: "enabled", name: "Judith", sortOrder: 9 });
    assert.equal(
      preferAgentForApiKey([disabled, enabled], "key-judith")?.id,
      "enabled",
    );
  });
});

describe("existingAgentIdFromConflict", () => {
  function apiError(status: number, message: string): Error {
    return Object.assign(new Error(message), { status });
  }

  it("reads existingAgentId from a 409 create response", () => {
    const error = apiError(
      409,
      '409 {"error":"An agent already exists for this API key","code":"conflict","existingAgentId":"agent-1"}',
    );
    assert.equal(existingAgentIdFromConflict(error), "agent-1");
  });

  it("returns null for other statuses and malformed bodies", () => {
    assert.equal(
      existingAgentIdFromConflict(apiError(400, '400 {"existingAgentId":"x"}')),
      null,
    );
    assert.equal(existingAgentIdFromConflict(apiError(409, "409 Conflict")), null);
    assert.equal(existingAgentIdFromConflict("409"), null);
  });
});
