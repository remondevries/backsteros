import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sanitizeOutboundRow } from "./fetch.js";
import {
  isBunqSecretColumn,
  sanitizeWorkspaceIntegrationSecretsRowForReplication,
} from "./integration-secrets-replication.js";

const row = {
  workspace_id: "w1",
  cursor_api_key: "cursor-key",
  bunq_api_key: "v1:aaa:bbb:ccc",
  bunq_signing_private_key_pem: "pem",
  bunq_installation_token: "t",
  bunq_server_public_key_pem: "pub",
  bunq_session_token: "s",
  bunq_session_expires_at: "2026-01-01T00:00:00Z",
  bunq_device_id: "1",
  bunq_user_id: "2",
  bunq_environment: "production",
  bunq_permitted_ips: ["1.2.3.4"],
  bunq_last_connected_at: "2026-01-01T00:00:00Z",
  bunq_payments_paused: true,
  updated_at: "2026-01-01T00:00:00Z",
};

describe("workspace_integration_secrets outbound replication", () => {
  it("strips every bunq_* column and keeps the rest", () => {
    const out = sanitizeWorkspaceIntegrationSecretsRowForReplication(row);
    assert.deepEqual(Object.keys(out).sort(), [
      "cursor_api_key",
      "updated_at",
      "workspace_id",
    ]);
    assert.equal(Object.keys(out).some(isBunqSecretColumn), false);
    // Input untouched.
    assert.equal(row.bunq_api_key, "v1:aaa:bbb:ccc");
  });

  it("is applied by sanitizeOutboundRow for that table only", () => {
    const out = sanitizeOutboundRow("workspace_integration_secrets", row);
    assert.equal("bunq_api_key" in out, false);
    assert.equal("bunq_payments_paused" in out, false);
    const other = sanitizeOutboundRow("tasks", { id: "t", bunq_note: "x" });
    assert.equal(other.bunq_note, "x");
  });
});
