import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  CLOUD_TO_LOCAL_ONLY_TABLES,
  REPLICATED_TABLES,
  isCloudToLocalOnlyTable,
} from "./constants.js";
import {
  resolveReplicationRoleFromEnv,
  shouldRefusePeerApplyOnCloud,
  shouldSkipLocalToCloudPush,
} from "./direction-policy.js";
import { applyRemoteChanges } from "./apply.js";
import { pushTable } from "./worker.js";

describe("CLOUD_TO_LOCAL_ONLY_TABLES policy", () => {
  it("lists exactly the cloud-authoritative tables, all replicated", () => {
    assert.deepEqual([...CLOUD_TO_LOCAL_ONLY_TABLES].sort(), [
      "agents",
      "api_keys",
      "workspace_integration_secrets",
      "workspaces",
    ]);
    for (const table of CLOUD_TO_LOCAL_ONLY_TABLES) {
      assert.ok((REPLICATED_TABLES as readonly string[]).includes(table));
    }
    assert.equal(isCloudToLocalOnlyTable("tasks"), false);
  });

  it("skips local→cloud push only on the local role", () => {
    for (const table of CLOUD_TO_LOCAL_ONLY_TABLES) {
      assert.equal(shouldSkipLocalToCloudPush(table, "local"), true);
      assert.equal(shouldSkipLocalToCloudPush(table, "cloud"), false);
    }
    assert.equal(shouldSkipLocalToCloudPush("tasks", "local"), false);
  });

  it("refuses peer apply only on the cloud role", () => {
    for (const table of CLOUD_TO_LOCAL_ONLY_TABLES) {
      assert.equal(shouldRefusePeerApplyOnCloud(table, "cloud"), true);
      assert.equal(shouldRefusePeerApplyOnCloud(table, "local"), false);
    }
    assert.equal(shouldRefusePeerApplyOnCloud("tasks", "cloud"), false);
  });

  it("resolves the role from CORE_REPLICATION_ROLE", () => {
    assert.equal(resolveReplicationRoleFromEnv({}), "local");
    assert.equal(
      resolveReplicationRoleFromEnv({ CORE_REPLICATION_ROLE: " Cloud " }),
      "cloud",
    );
  });
});

describe("worker + apply honour the direction policy", () => {
  const previous = {
    peerUrl: process.env.CORE_REPLICATION_PEER_URL,
    secret: process.env.CORE_REPLICATION_SECRET,
    role: process.env.CORE_REPLICATION_ROLE,
  };
  beforeEach(() => {
    process.env.CORE_REPLICATION_PEER_URL = "http://peer.test:8788";
    process.env.CORE_REPLICATION_SECRET = "test-replication-secret";
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

  it("local pushTable never fetches or sends cloud-authoritative tables", async () => {
    process.env.CORE_REPLICATION_ROLE = "local";
    for (const table of CLOUD_TO_LOCAL_ONLY_TABLES) {
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
          return new Response("{}", { status: 200 });
        },
      });
      assert.equal(fetched, 0, `${table} fetched`);
      assert.equal(sent, 0, `${table} sent`);
    }
  });

  it("local pushTable still pushes normal tables", async () => {
    process.env.CORE_REPLICATION_ROLE = "local";
    let sent = 0;
    await pushTable("tasks", {
      getCursor: async () => ({ updatedAt: "1970-01-01T00:00:00Z", rowId: "" }),
      setCursor: async () => {},
      fetchLocal: async (_t, cursor) => ({
        changes: [{ table: "tasks", row: { id: "x" } }],
        cursor,
      }),
      fetchFn: async () => {
        sent += 1;
        return new Response(JSON.stringify({ applied: 1, skipped: 0, failed: [] }), {
          status: 200,
        });
      },
    });
    assert.equal(sent, 1);
  });

  it("cloud refuses peer apply of cloud-authoritative tables (skipped, no failures)", async () => {
    process.env.CORE_REPLICATION_ROLE = "cloud";
    for (const table of CLOUD_TO_LOCAL_ONLY_TABLES) {
      const result = await applyRemoteChanges(
        table as never,
        [
          { table, row: { id: "evil", workspace_id: "w" } },
          { table, row: { id: "evil2", workspace_id: "w" } },
        ] as never,
        { direction: "push" },
      );
      assert.deepEqual(result, { applied: 0, skipped: 2, failed: [] }, table);
    }
  });
});
