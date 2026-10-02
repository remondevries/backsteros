import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compareCursor,
  decidePullForPeerTip,
  maxCursor,
  peerTipHasChanges,
  toIso,
} from "./cursor-order.js";
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

  it("peerTipHasChanges polls unknown tips and equal-time differing ids", () => {
    const cursor: ReplicationCursor = {
      updatedAt: "2026-10-02T00:00:00.000Z",
      rowId: "aAbB",
    };
    assert.equal(peerTipHasChanges(undefined, cursor), true);
    assert.equal(peerTipHasChanges(null, cursor), false);
    assert.equal(peerTipHasChanges(cursor, cursor), false);
    // Equal timestamp + different id → poll (JS localeCompare ≠ Postgres).
    assert.equal(
      peerTipHasChanges({ updatedAt: cursor.updatedAt, rowId: "ZzZz" }, cursor),
      true,
    );
    assert.equal(
      peerTipHasChanges(
        { updatedAt: "2026-10-01T00:00:00.000Z", rowId: "z" },
        cursor,
      ),
      false,
    );
    assert.equal(
      peerTipHasChanges(
        { updatedAt: "2026-10-03T00:00:00.000Z", rowId: "z" },
        cursor,
      ),
      true,
    );
  });

  it("decidePullForPeerTip skips quiet tips without defer, bypasses backoff when tip ahead", () => {
    const cursor: ReplicationCursor = {
      updatedAt: "2026-10-02T00:00:00.000Z",
      rowId: "a",
    };
    assert.equal(
      decidePullForPeerTip({
        peerTipProvided: true,
        peerTip: null,
        cursor,
        deferEmptyPull: true,
      }),
      "skip_quiet_tip",
    );
    assert.equal(
      decidePullForPeerTip({
        peerTipProvided: true,
        peerTip: cursor,
        cursor,
        deferEmptyPull: true,
      }),
      "skip_quiet_tip",
    );
    assert.equal(
      decidePullForPeerTip({
        peerTipProvided: true,
        peerTip: { updatedAt: "2026-10-03T00:00:00.000Z", rowId: "b" },
        cursor,
        deferEmptyPull: true,
      }),
      "poll",
    );
    assert.equal(
      decidePullForPeerTip({
        peerTipProvided: false,
        cursor,
        deferEmptyPull: true,
      }),
      "defer_backoff",
    );
    assert.equal(
      decidePullForPeerTip({
        peerTipProvided: false,
        cursor,
        deferEmptyPull: false,
      }),
      "poll",
    );
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

  it("preserves postgres microseconds in toIso", () => {
    assert.equal(
      toIso("2026-09-10 05:36:56.851323+00"),
      "2026-09-10T05:36:56.851323Z",
    );
    assert.ok(
      compareCursor(
        { updatedAt: "2026-09-10T05:36:56.851323Z", rowId: "a" },
        { updatedAt: "2026-09-10T05:36:56.851Z", rowId: "z" },
      ) > 0,
    );
  });

  it("maxCursor advances when candidate has later fractional seconds", () => {
    const since: ReplicationCursor = {
      updatedAt: "2026-09-10T05:36:56.851Z",
      rowId: "LyWHfLHd_LuT7b9QPKwp2",
    };
    const pageLast: ReplicationCursor = {
      updatedAt: "2026-09-10T05:36:56.851323Z",
      rowId: "-5I0GsCA5Jy8xDTu9-2cL",
    };
    // pageLast is later in true time even if id sorts before since.rowId
    assert.deepEqual(maxCursor(since, pageLast), pageLast);
  });
});
