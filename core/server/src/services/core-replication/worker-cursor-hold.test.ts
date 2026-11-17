import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import type { ReplicatedTable } from "./constants.js";
import {
  CURSOR_HOLD_MAX_ATTEMPTS,
  evaluateCursorHold,
  shouldAdvanceReplicationCursor,
} from "./cursor-order.js";
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
  it("holds on the first failure and advances when nothing failed", () => {
    assert.equal(shouldAdvanceReplicationCursor({ failed: [] }), true);
    assert.equal(
      shouldAdvanceReplicationCursor({ failed: [{ id: "x" }] }),
      false,
    );
    assert.equal(
      shouldAdvanceReplicationCursor({ failed: [{ id: "x", attempts: 1 }] }),
      false,
    );
  });

  it("advances once every failed row is at/above the hold max", () => {
    assert.equal(CURSOR_HOLD_MAX_ATTEMPTS, 3);
    assert.equal(
      shouldAdvanceReplicationCursor({
        failed: [{ id: "x", attempts: CURSOR_HOLD_MAX_ATTEMPTS - 1 }],
      }),
      false,
    );
    assert.equal(
      shouldAdvanceReplicationCursor({
        failed: [{ id: "x", attempts: CURSOR_HOLD_MAX_ATTEMPTS }],
      }),
      true,
    );
    // One row still within its budget keeps the whole page held.
    const mixed = evaluateCursorHold({
      failed: [
        { id: "old", attempts: 9 },
        { id: "fresh", attempts: 1 },
      ],
    });
    assert.equal(mixed.advance, false);
    assert.deepEqual(mixed.holding.map((row) => row.id), ["fresh"]);
    assert.deepEqual(mixed.exhausted.map((row) => row.id), ["old"]);
  });

  it("accepts an injected attempt lookup", () => {
    const lookup = (failed: { id?: string }) =>
      failed.id === "x" ? 5 : undefined;
    assert.equal(
      shouldAdvanceReplicationCursor(
        { failed: [{ id: "x" }] },
        { attemptsFor: lookup },
      ),
      true,
    );
    assert.equal(
      shouldAdvanceReplicationCursor(
        { failed: [{ id: "y" }] },
        { attemptsFor: lookup },
      ),
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

  it("pull advances past a permanent failure after N hold attempts so newer rows proceed", async () => {
    // Each tick the apply layer re-sights the open dead letter and bumps attempts.
    for (let attempts = 1; attempts < CURSOR_HOLD_MAX_ATTEMPTS; attempts += 1) {
      const held = await runPull([
        { id: "b", code: "23505", message: "duplicate key", attempts },
      ]);
      assert.deepEqual(held.setCalls, [], `attempt ${attempts} still holds`);
    }
    const advanced = await runPull([
      {
        id: "b",
        code: "23505",
        message: "duplicate key",
        attempts: CURSOR_HOLD_MAX_ATTEMPTS,
      },
    ]);
    assert.deepEqual(advanced.setCalls, [PAGE_TIP]);
  });

  it("pull falls back to an in-process hold counter when attempts are not reported", async () => {
    const outcomes: number[] = [];
    for (let tick = 1; tick <= CURSOR_HOLD_MAX_ATTEMPTS; tick += 1) {
      const { setCalls } = await runPull([
        { id: "b", code: "23505", message: "duplicate key" },
      ]);
      outcomes.push(setCalls.length);
    }
    assert.deepEqual(outcomes, [0, 0, 1]);
  });

  it("OS-174: pull never advances when the dead letter was not recorded", async () => {
    const outcomes: number[] = [];
    for (let tick = 1; tick <= CURSOR_HOLD_MAX_ATTEMPTS + 2; tick += 1) {
      const { setCalls } = await runPull([
        {
          id: "b",
          code: "23505",
          message: "duplicate key",
          deadLetterRecorded: false,
        },
      ]);
      outcomes.push(setCalls.length);
    }
    assert.deepEqual(outcomes, [0, 0, 0, 0, 0]);
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

  it("push advances past a permanent peer failure after N hold attempts", async () => {
    for (let attempts = 1; attempts < CURSOR_HOLD_MAX_ATTEMPTS; attempts += 1) {
      const held = await runPush({
        applied: 1,
        skipped: 0,
        failed: [{ id: "b", code: "23503", message: "fk", attempts }],
      });
      assert.deepEqual(held.setCalls, [], `attempt ${attempts} still holds`);
    }
    const advanced = await runPush({
      applied: 1,
      skipped: 0,
      failed: [
        {
          id: "b",
          code: "23503",
          message: "fk",
          attempts: CURSOR_HOLD_MAX_ATTEMPTS,
        },
      ],
    });
    assert.deepEqual(advanced.setCalls, [PAGE_TIP]);
  });
});
