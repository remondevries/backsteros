import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import type { ReplicatedTable } from "./constants.js";
import { shouldAdvanceReplicationCursor } from "./cursor-order.js";
import type {
  ReplicationApplyResponse,
  ReplicationChange,
  ReplicationCursor,
} from "./types.js";
import {
  pullTable,
  pushTable,
  resetReplicationWorkerStateForTests,
} from "./worker.js";

const TABLE = "tasks" as ReplicatedTable;
const START: ReplicationCursor = {
  updatedAt: "2026-10-02T12:00:00.000000Z",
  rowId: "start",
};
const PAGE_TIP: ReplicationCursor = {
  updatedAt: "2026-10-02T12:05:00.000000Z",
  rowId: "page-tip",
};
const SECRET = "test-replication-secret";
const PEER = "http://peer.test:8788";

function change(id: string): ReplicationChange {
  return {
    table: TABLE,
    row: { id, updated_at: PAGE_TIP.updatedAt },
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("shouldAdvanceReplicationCursor", () => {
  it("advances only when no row failed", () => {
    assert.equal(shouldAdvanceReplicationCursor({ failed: [] }), true);
    assert.equal(
      shouldAdvanceReplicationCursor({ failed: [{ id: "x" }] }),
      false,
    );
  });
});

describe("replication worker holds cursors on failed rows", () => {
  const previousEnv = {
    peerUrl: process.env.CORE_REPLICATION_PEER_URL,
    secret: process.env.CORE_REPLICATION_SECRET,
    role: process.env.CORE_REPLICATION_ROLE,
  };

  beforeEach(() => {
    resetReplicationWorkerStateForTests();
    process.env.CORE_REPLICATION_PEER_URL = PEER;
    process.env.CORE_REPLICATION_SECRET = SECRET;
    process.env.CORE_REPLICATION_ROLE = "cloud";
  });

  afterEach(() => {
    resetReplicationWorkerStateForTests();
    for (const [key, value] of [
      ["CORE_REPLICATION_PEER_URL", previousEnv.peerUrl],
      ["CORE_REPLICATION_SECRET", previousEnv.secret],
      ["CORE_REPLICATION_ROLE", previousEnv.role],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function runPull(failed: ReplicationApplyResponse["failed"]) {
    const setCalls: ReplicationCursor[] = [];
    let fetches = 0;
    await pullTable(TABLE, {
      getCursor: async () => START,
      setCursor: async (_table, cursor) => {
        setCalls.push(cursor);
      },
      applyFn: async () => ({ applied: 1, skipped: 0, failed }),
      fetchFn: async () => {
        fetches += 1;
        return jsonResponse({
          table: TABLE,
          changes: [change("a"), change("b")],
          cursor: PAGE_TIP,
        });
      },
      nowMs: 1_000_000,
    });
    return { setCalls, fetches };
  }

  it("pull advances the cursor when the page fully applied", async () => {
    const { setCalls } = await runPull([]);
    assert.deepEqual(setCalls, [PAGE_TIP]);
  });

  it("pull does not advance the cursor when any row failed", async () => {
    const { setCalls, fetches } = await runPull([
      { id: "b", code: "23505", message: "duplicate key" },
    ]);
    assert.deepEqual(setCalls, []);
    assert.equal(fetches, 1, "must not loop on the same held page");
  });

  async function runPush(result: ReplicationApplyResponse) {
    const setCalls: ReplicationCursor[] = [];
    let fetches = 0;
    await pushTable(TABLE, {
      getCursor: async () => START,
      setCursor: async (_table, cursor) => {
        setCalls.push(cursor);
      },
      fetchLocal: async () => ({
        changes: [change("a"), change("b")],
        cursor: PAGE_TIP,
      }),
      fetchFn: async () => {
        fetches += 1;
        return jsonResponse(result);
      },
    });
    return { setCalls, fetches };
  }

  it("push advances the cursor when the peer applied every row", async () => {
    const { setCalls } = await runPush({ applied: 2, skipped: 0, failed: [] });
    assert.deepEqual(setCalls, [PAGE_TIP]);
  });

  it("push does not advance the cursor when the peer failed a row", async () => {
    const { setCalls, fetches } = await runPush({
      applied: 1,
      skipped: 0,
      failed: [{ id: "b", code: "23503", message: "fk" }],
    });
    assert.deepEqual(setCalls, []);
    assert.equal(fetches, 1, "must not loop on the same held page");
  });
});
