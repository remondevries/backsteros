import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Agent } from "@backsteros/contracts";

import {
  mergeAgentRosters,
  mergeAgentWebhookFields,
} from "./shell-agent-roster-store";

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

  it("OS-164: keeps cloud URL/secret when local only gained verifiedAt", () => {
    // After Test, verifiedAt twins to local without webhook credentials.
    const local = stubAgent({
      id: "XcvoBfuvYFr-vrHLeBsru",
      name: "Niels",
      contactId: "Vxxot5Rh1uAzqgfxkRvEQ",
      webhookUrl: null,
      webhookSecretConfigured: false,
      webhookVerifiedAt: "2026-11-01T06:31:38.145Z",
    });
    const priorCloudEnriched = stubAgent({
      id: "XcvoBfuvYFr-vrHLeBsru",
      name: "Niels",
      contactId: "Vxxot5Rh1uAzqgfxkRvEQ",
      webhookUrl: "https://example.com/niels",
      webhookSecretConfigured: true,
      webhookVerifiedAt: null,
    });
    const merged = mergeAgentRosters([local], [priorCloudEnriched]);
    const niels = merged.find((row) => row.id === local.id);
    assert.equal(niels?.webhookUrl, "https://example.com/niels");
    assert.equal(niels?.webhookSecretConfigured, true);
    assert.equal(niels?.webhookVerifiedAt, "2026-11-01T06:31:38.145Z");
  });
});

describe("mergeAgentWebhookFields", () => {
  it("prefers non-empty URL and either secret/verified flag", () => {
    const left = stubAgent({
      id: "a1",
      name: "Niels",
      webhookUrl: null,
      webhookSecretConfigured: false,
      webhookVerifiedAt: "2026-11-01T06:31:38.145Z",
    });
    const right = stubAgent({
      id: "a1",
      name: "Niels",
      webhookUrl: "https://example.com/niels",
      webhookSecretConfigured: true,
      webhookVerifiedAt: null,
    });
    const merged = mergeAgentWebhookFields(left, right);
    assert.equal(merged.webhookUrl, "https://example.com/niels");
    assert.equal(merged.webhookSecretConfigured, true);
    assert.equal(merged.webhookVerifiedAt, "2026-11-01T06:31:38.145Z");
  });
});
