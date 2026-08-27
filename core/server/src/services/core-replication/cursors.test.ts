import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compareCursor, maxCursor } from "./cursor-order.js";
import type { ReplicationCursor } from "./types.js";

describe("replication cursors", () => {
  it("orders by updatedAt then rowId", () => {
    const early: ReplicationCursor = {
      updatedAt: "2026-01-01T00:00:00.000Z",
      rowId: "a",
    };
    const late: ReplicationCursor = {
      updatedAt: "2026-01-02T00:00:00.000Z",
      rowId: "a",
    };
    const sameTimeLaterId: ReplicationCursor = {
      updatedAt: "2026-01-01T00:00:00.000Z",
      rowId: "b",
    };
    assert.ok(compareCursor(early, late) < 0);
    assert.ok(compareCursor(late, early) > 0);
    assert.ok(compareCursor(early, sameTimeLaterId) < 0);
    assert.equal(compareCursor(early, early), 0);
  });

  it("maxCursor never moves backwards", () => {
    const current: ReplicationCursor = {
      updatedAt: "2026-01-02T00:00:00.000Z",
      rowId: "z",
    };
    const older: ReplicationCursor = {
      updatedAt: "2026-01-01T00:00:00.000Z",
      rowId: "a",
    };
    const newer: ReplicationCursor = {
      updatedAt: "2026-01-03T00:00:00.000Z",
      rowId: "a",
    };
    assert.deepEqual(maxCursor(current, older), current);
    assert.deepEqual(maxCursor(current, newer), newer);
  });

  it("documents split-cursor invariant: pull tip ahead of local does not block push", () => {
    // After pull advances to peer tip T2, push must still use its own watermark
    // (T1) so a local row at T1.5 is still eligible to push.
    const pullTip: ReplicationCursor = {
      updatedAt: "2026-01-02T12:00:00.000Z",
      rowId: "peer-row",
    };
    const pushWatermark: ReplicationCursor = {
      updatedAt: "2026-01-01T00:00:00.000Z",
      rowId: "",
    };
    const localRow: ReplicationCursor = {
      updatedAt: "2026-01-01T12:00:00.000Z",
      rowId: "local-row",
    };
    assert.ok(
      compareCursor(localRow, pushWatermark) > 0,
      "local row is after push watermark",
    );
    assert.ok(
      compareCursor(localRow, pullTip) < 0,
      "local row is behind pull tip (would be lost with a shared cursor)",
    );
  });
});
