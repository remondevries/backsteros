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
  it("keeps local-only rows and replaces matching rows with cloud", () => {
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
    assert.equal(niels?.webhookVerifiedAt, "2026-11-01T00:00:00.000Z");
    assert.equal(merged.find((row) => row.id === "a2")?.webhookUrl, null);
  });

  it("cloud clearing verifiedAt wins over a stale local twin", () => {
    // Settings changed the URL on cloud; replication has not caught up yet.
    const local = stubAgent({
      id: "a1",
      name: "Niels",
      webhookVerifiedAt: "2026-11-01T06:40:00.000Z",
    });
    const cloud = stubAgent({
      id: "a1",
      name: "Niels",
      webhookUrl: "https://example.com/new",
      webhookSecretConfigured: true,
      webhookVerifiedAt: null,
    });
    const [niels] = mergeAgentRosters([local], [cloud]);
    assert.equal(niels?.webhookVerifiedAt, null);
  });

  it("drops disabled agents from either side", () => {
    const merged = mergeAgentRosters(
      [stubAgent({ id: "a1", name: "Judith", enabled: false })],
      [stubAgent({ id: "a2", name: "Lotte", enabled: false })],
    );
    assert.deepEqual(merged, []);
  });
});
