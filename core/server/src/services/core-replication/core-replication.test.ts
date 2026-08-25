import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOOTSTRAP_TABLES,
  LEGACY_BOOTSTRAP_API_KEY_NAME,
  REPLICATED_TABLES,
} from "./constants.js";
import {
  getCoreReplicationConfig,
  isCoreReplicationEnabled,
} from "./config.js";
import {
  isImplementedReplicatedTable,
  listActiveReplicatedTables,
} from "./tables.js";

describe("core-replication constants", () => {
  it("includes api_keys in live REPLICATED_TABLES", () => {
    assert.ok(REPLICATED_TABLES.includes("api_keys"));
    assert.ok(BOOTSTRAP_TABLES.includes("api_keys"));
  });

  it("documents the legacy Meetings-only bootstrap filter", () => {
    assert.equal(LEGACY_BOOTSTRAP_API_KEY_NAME, "Meetings");
  });
});

describe("core-replication config", () => {
  it("returns null when peer env is missing", () => {
    assert.equal(
      getCoreReplicationConfig({ CORE_REPLICATION_SECRET: "x" }),
      null,
    );
    assert.equal(isCoreReplicationEnabled({}), false);
  });

  it("parses peer URL and role", () => {
    const config = getCoreReplicationConfig({
      CORE_REPLICATION_PEER_URL: "https://agent.backsteros.com/",
      CORE_REPLICATION_SECRET: "shared-secret",
      CORE_REPLICATION_ROLE: "cloud",
    });
    assert.ok(config);
    assert.equal(config.peerUrl, "https://agent.backsteros.com");
    assert.equal(config.secret, "shared-secret");
    assert.equal(config.role, "cloud");
    assert.equal(isCoreReplicationEnabled(), false);
  });

  it("defaults role to local", () => {
    const config = getCoreReplicationConfig({
      CORE_REPLICATION_PEER_URL: "http://127.0.0.1:8788",
      CORE_REPLICATION_SECRET: "s",
    });
    assert.equal(config?.role, "local");
  });
});

describe("core-replication table handlers", () => {
  it("activates api_keys in this build", () => {
    assert.equal(isImplementedReplicatedTable("api_keys"), true);
    assert.equal(isImplementedReplicatedTable("meetings"), false);
    assert.deepEqual(listActiveReplicatedTables(), ["api_keys"]);
  });
});
