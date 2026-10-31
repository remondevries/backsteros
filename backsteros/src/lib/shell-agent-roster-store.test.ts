import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Agent } from "@backsteros/contracts";

import { mergeAgentRosters } from "./shell-agent-roster-store";

function stubAgent(
  partial: Pick<Agent, "id" | "name"> & Partial<Agent>,
): Agent {
  return {
    workspaceId: "ws_1",
    contactId: null,
    apiKeyId: null,
    avatarUrl: null,
    role: null,
    enabled: true,
    sortOrder: 0,
    webhookUrl: null,
    webhookSecretConfigured: false,
    webhookVerifiedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("mergeAgentRosters", () => {
  it("keeps local rows and overlays cloud webhook fields", () => {
    const merged = mergeAgentRosters(
      [
        stubAgent({ id: "a1", name: "Niels", webhookUrl: null }),
        stubAgent({ id: "a2", name: "Judith", webhookUrl: null }),
      ],
      [
        stubAgent({
          id: "a1",
          name: "Niels",
          webhookUrl: "https://example.com/niels",
          webhookSecretConfigured: true,
          webhookVerifiedAt: "2026-11-01T00:00:00.000Z",
        }),
      ],
    );
    assert.equal(merged.length, 2);
    const niels = merged.find((row) => row.id === "a1");
    assert.equal(niels?.webhookUrl, "https://example.com/niels");
    assert.equal(niels?.webhookSecretConfigured, true);
    assert.equal(niels?.webhookVerifiedAt, "2026-11-01T00:00:00.000Z");
    assert.equal(merged.find((row) => row.id === "a2")?.webhookUrl, null);
  });
});
