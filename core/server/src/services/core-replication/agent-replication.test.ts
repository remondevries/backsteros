import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AGENT_WEBHOOK_SECRET_COLUMNS,
  sanitizeAgentsRowForReplication,
} from "./agent-replication.js";

describe("agent replication sanitize", () => {
  it("strips webhook URL and secret ciphertext and keeps roster fields", () => {
    const row = {
      id: "agent_niels",
      workspace_id: "ws_1",
      contact_id: "contact_niels",
      name: "Niels",
      enabled: true,
      role: "Channel",
      sort_order: 3,
      api_key_id: "key_1",
      webhook_url: "https://example.com/hooks/niels",
      webhook_secret_ciphertext: "cipher_do_not_replicate",
      updated_at: "2026-10-31T12:00:00.000Z",
    };

    const sanitized = sanitizeAgentsRowForReplication(row);

    assert.equal(sanitized.id, "agent_niels");
    assert.equal(sanitized.contact_id, "contact_niels");
    assert.equal(sanitized.name, "Niels");
    assert.equal(sanitized.enabled, true);
    assert.equal(sanitized.role, "Channel");
    assert.equal(sanitized.api_key_id, "key_1");
    for (const col of AGENT_WEBHOOK_SECRET_COLUMNS) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(sanitized, col),
        false,
        `${col} must be omitted so apply preserves peer secrets`,
      );
    }
    assert.equal(
      Object.prototype.hasOwnProperty.call(row, "webhook_secret_ciphertext"),
      true,
      "sanitize must not mutate the source row",
    );
  });
});
