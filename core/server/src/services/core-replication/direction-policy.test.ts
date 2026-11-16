import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as constants from "./constants.js";
import { REPLICATED_TABLES } from "./constants.js";
import * as directionPolicy from "./direction-policy.js";
import {
  API_KEY_SECRET_COLUMNS,
  preserveApiKeySecret,
  resolveReplicationRoleFromEnv,
  sanitizeApiKeysRowForOutbound,
} from "./direction-policy.js";
import { sanitizeOutboundRow } from "./fetch.js";
import { pushTable } from "./worker.js";

/** Tables that were briefly one-way (C2) and must twin both ways again. */
const BOTH_WAYS_TABLES = [
  "api_keys",
  "workspaces",
  "agents",
  "workspace_integration_secrets",
] as const;

describe("whole-table one-way policy is gone", () => {
  it("no longer exports the cloud→local-only table list or skip/refuse helpers", () => {
    assert.equal("CLOUD_TO_LOCAL_ONLY_TABLES" in constants, false);
    assert.equal("isCloudToLocalOnlyTable" in constants, false);
    assert.equal("shouldSkipLocalToCloudPush" in directionPolicy, false);
    assert.equal("shouldRefusePeerApplyOnCloud" in directionPolicy, false);
  });

  it("keeps the formerly one-way tables replicated", () => {
    for (const table of BOTH_WAYS_TABLES) {
      assert.ok((REPLICATED_TABLES as readonly string[]).includes(table), table);
    }
  });

  it("resolves the role from CORE_REPLICATION_ROLE", () => {
    assert.equal(resolveReplicationRoleFromEnv({}), "local");
    assert.equal(
      resolveReplicationRoleFromEnv({ CORE_REPLICATION_ROLE: " Cloud " }),
      "cloud",
    );
  });
});

describe("api_keys column-level guards", () => {
  const row = {
    id: "k1",
    name: "Desktop",
    prefix: "sk_live_ab",
    key_hash: "hash",
    secret_ciphertext: "cipher",
    revoked_at: null,
    updated_at: "2026-11-16T10:00:00Z",
  };

  it("lists the raw secret columns", () => {
    assert.deepEqual([...API_KEY_SECRET_COLUMNS].sort(), [
      "key_hash",
      "secret_ciphertext",
    ]);
  });

  it("local strips key_hash + secret_ciphertext outbound, keeps metadata", () => {
    const out = sanitizeApiKeysRowForOutbound(row, "local");
    assert.equal("key_hash" in out, false);
    assert.equal("secret_ciphertext" in out, false);
    assert.equal(out.name, "Desktop");
    assert.equal(out.updated_at, row.updated_at);
    // Input untouched.
    assert.equal(row.key_hash, "hash");
  });

  it("cloud keeps sending the hash + ciphertext (local needs them to auth)", () => {
    const out = sanitizeApiKeysRowForOutbound(row, "cloud");
    assert.equal(out.key_hash, "hash");
    assert.equal(out.secret_ciphertext, "cipher");
  });

  it("sanitizeOutboundRow applies it to api_keys only, per role", () => {
    const local = sanitizeOutboundRow("api_keys", row, "local");
    assert.equal("key_hash" in local, false);
    assert.equal("secret_ciphertext" in local, false);
    const cloud = sanitizeOutboundRow("api_keys", row, "cloud");
    assert.equal(cloud.key_hash, "hash");
    const other = sanitizeOutboundRow("tasks", { id: "t", key_hash: "x" }, "local");
    assert.equal(other.key_hash, "x");
  });

  it("apply keeps existing secrets when inbound is omitted / null / empty", () => {
    assert.equal(preserveApiKeySecret(undefined, "existing"), "existing");
    assert.equal(preserveApiKeySecret(null, "existing"), "existing");
    assert.equal(preserveApiKeySecret("", "existing"), "existing");
    assert.equal(preserveApiKeySecret("   ", "existing"), "existing");
    assert.equal(preserveApiKeySecret(undefined, null), null);
    assert.equal(preserveApiKeySecret(undefined, undefined), null);
  });

  it("apply takes a non-empty inbound secret over the existing one", () => {
    assert.equal(preserveApiKeySecret("new", "existing"), "new");
    assert.equal(preserveApiKeySecret("new", null), "new");
  });
});

describe("pushTable no longer skips formerly one-way tables", () => {
  const previous = {
    peerUrl: process.env.CORE_REPLICATION_PEER_URL,
    secret: process.env.CORE_REPLICATION_SECRET,
    role: process.env.CORE_REPLICATION_ROLE,
  };
  beforeEach(() => {
    process.env.CORE_REPLICATION_PEER_URL = "http://peer.test:8788";
    process.env.CORE_REPLICATION_SECRET = "test-replication-secret";
    process.env.CORE_REPLICATION_ROLE = "local";
  });
  afterEach(() => {
    for (const [key, value] of [
      ["CORE_REPLICATION_PEER_URL", previous.peerUrl],
      ["CORE_REPLICATION_SECRET", previous.secret],
      ["CORE_REPLICATION_ROLE", previous.role],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("local pushTable fetches and sends every formerly one-way table", async () => {
    for (const table of BOTH_WAYS_TABLES) {
      let fetched = 0;
      let sent = 0;
      await pushTable(table, {
        getCursor: async () => ({ updatedAt: "1970-01-01T00:00:00Z", rowId: "" }),
        setCursor: async () => {},
        fetchLocal: async (_t, cursor) => {
          fetched += 1;
          return {
            changes: [{ table, row: { id: "x" } }],
            cursor,
          };
        },
        fetchFn: async () => {
          sent += 1;
          return new Response(
            JSON.stringify({ applied: 1, skipped: 0, failed: [] }),
            { status: 200 },
          );
        },
      });
      assert.equal(fetched, 1, `${table} fetched`);
      assert.equal(sent, 1, `${table} sent`);
    }
  });
});
