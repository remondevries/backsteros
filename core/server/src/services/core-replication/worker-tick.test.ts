import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import type { ReplicatedTable } from "./constants.js";
import { notePullOutcome } from "./empty-pull-backoff.js";
import type { ReplicationCursor } from "./types.js";
import {
  fetchPeerSyncState,
  pullTable,
  resetReplicationWorkerStateForTests,
  runCoreReplicationTick,
} from "./worker.js";

const TABLE = "tasks" as ReplicatedTable;
const CURSOR: ReplicationCursor = {
  updatedAt: "2026-10-02T12:00:00.123400Z",
  rowId: "cursor-row",
};
const SECRET = "test-replication-secret";
const PEER = "http://peer.test:8788";

describe("runCoreReplicationTick sync-state + tip pulls", () => {
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
    if (previousEnv.peerUrl === undefined) {
      delete process.env.CORE_REPLICATION_PEER_URL;
    } else {
      process.env.CORE_REPLICATION_PEER_URL = previousEnv.peerUrl;
    }
    if (previousEnv.secret === undefined) {
      delete process.env.CORE_REPLICATION_SECRET;
    } else {
      process.env.CORE_REPLICATION_SECRET = previousEnv.secret;
    }
    if (previousEnv.role === undefined) {
      delete process.env.CORE_REPLICATION_ROLE;
    } else {
      process.env.CORE_REPLICATION_ROLE = previousEnv.role;
    }
  });

  it("falls back to per-table pulls when peer /sync-state returns 404", async () => {
    const pullCalls: Array<{
      table: ReplicatedTable;
      peerTip?: ReplicationCursor | null;
      provided: boolean;
    }> = [];

    await runCoreReplicationTick({
      checkPeerBuildVersion: async () => {},
      pullPeerSyncEvents: async () => {},
      listActiveReplicatedTables: async () => [TABLE],
      fetchPeerSyncState: async () => null, // 404 → null
      pullTable: async (table, options) => {
        pullCalls.push({
          table,
          peerTip: options?.peerTip,
          provided: Boolean(options && "peerTip" in options),
        });
      },
      pushTable: async () => {},
      retryDeadLetters: async () => ({ retried: 0, resolved: 0, failed: 0 }),
      runReconcile: async () => {},
    });

    assert.equal(pullCalls.length, 1);
    assert.equal(pullCalls[0]!.table, TABLE);
    assert.equal(pullCalls[0]!.provided, false);
  });

  it("passes quiet tip into pullTable (no /changes for that table)", async () => {
    const quietTip: ReplicationCursor = { ...CURSOR };
    const pullCalls: Array<{
      options?: { peerTip?: ReplicationCursor | null };
    }> = [];
    const changesCalls: string[] = [];

    await runCoreReplicationTick({
      checkPeerBuildVersion: async () => {},
      pullPeerSyncEvents: async () => {},
      listActiveReplicatedTables: async () => [TABLE],
      fetchPeerSyncState: async () => new Map([[TABLE, quietTip]]),
      pullTable: async (table, options) => {
        pullCalls.push({ options });
        // Drive the real pullTable path for /changes assertion.
        await pullTable(table, {
          peerTip: options?.peerTip,
          getCursor: async () => CURSOR,
          fetchFn: async (input) => {
            changesCalls.push(String(input));
            return new Response(JSON.stringify({ changes: [], cursor: CURSOR }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          },
          nowMs: 1_000_000,
        });
      },
      pushTable: async () => {},
      retryDeadLetters: async () => ({ retried: 0, resolved: 0, failed: 0 }),
      runReconcile: async () => {},
    });

    assert.equal(pullCalls.length, 1);
    assert.deepEqual(pullCalls[0]!.options?.peerTip, quietTip);
    assert.deepEqual(changesCalls, [], "quiet tip must not hit /changes");
  });

  it("polls /changes when tip is ahead despite empty-pull backoff", async () => {
    const aheadTip: ReplicationCursor = {
      updatedAt: "2026-10-02T12:00:00.123500Z",
      rowId: "newer-row",
    };
    // Seed backoff so a quiet table would otherwise defer.
    notePullOutcome(TABLE, CURSOR, false, 1_000_000);
    const changesCalls: string[] = [];

    await runCoreReplicationTick({
      checkPeerBuildVersion: async () => {},
      pullPeerSyncEvents: async () => {},
      listActiveReplicatedTables: async () => [TABLE],
      fetchPeerSyncState: async () => new Map([[TABLE, aheadTip]]),
      pullTable: async (table, options) => {
        await pullTable(table, {
          peerTip: options?.peerTip,
          getCursor: async () => CURSOR,
          fetchFn: async (input) => {
            changesCalls.push(String(input));
            return new Response(
              JSON.stringify({ table, changes: [], cursor: CURSOR }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              },
            );
          },
          // Still inside the backoff window from notePullOutcome above.
          nowMs: 1_000_000 + 1_000,
        });
      },
      pushTable: async () => {},
      retryDeadLetters: async () => ({ retried: 0, resolved: 0, failed: 0 }),
      runReconcile: async () => {},
    });

    assert.equal(changesCalls.length, 1);
    assert.match(changesCalls[0]!, /\/changes/);
    assert.match(changesCalls[0]!, /table=tasks/);
  });

  it("fetchPeerSyncState returns null on 404", async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("not found", { status: 404 })) as typeof fetch;
    try {
      const tips = await fetchPeerSyncState();
      assert.equal(tips, null);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
