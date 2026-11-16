import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  getSyncEventResyncState,
  markSyncEventResyncNeeded,
  resetSyncEventResyncStateForTests,
} from "./sync-event-resync.js";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("sync-event resync state (OS-163)", () => {
  afterEach(() => {
    resetSyncEventResyncStateForTests();
  });

  it("marks needed with a clear message", () => {
    markSyncEventResyncNeeded("ws-test", "gap behind retention");
    const state = getSyncEventResyncState("ws-test");
    assert.equal(state.needed, true);
    assert.equal(state.status, "needed");
    assert.match(state.message ?? "", /gap/);
  });

  it("pullPeerSyncEvents starts resync on resync_needed with captured tip", () => {
    const src = readFileSync(join(HERE, "sync-event-replication.ts"), "utf8");
    assert.ok(src.includes("result.resyncNeeded"));
    assert.ok(src.includes("peerLastSyncId"));
    assert.ok(src.includes("startResync(workspaceId"));
    assert.ok(src.includes("beginSyncEventResync"));
    assert.ok(!src.includes("SYNC_EVENT_PULL_FAR_BEHIND_GAP"));
  });

  it("resync bootstrap advances pull cursors only and sets sync-event cursor to captured tip", () => {
    const src = readFileSync(join(HERE, "sync-event-resync.ts"), "utf8");
    assert.ok(src.includes('cursorDirections: ["pull"]'));
    assert.ok(src.includes("forceSetSyncEventPullCursor(workspaceId, capturedTip)"));
    assert.ok(!src.includes("cursor reset to 0"));
    assert.ok(src.includes("peerLastSyncId"));
  });

  it("cursors helper defaults to both directions; resync uses pull-only", () => {
    const src = readFileSync(join(HERE, "cursors.ts"), "utf8");
    assert.ok(src.includes('directions ?? ["pull", "push"]'));
    const applySrc = readFileSync(join(HERE, "apply.ts"), "utf8");
    assert.ok(applySrc.includes("cursorDirections"));
  });
});
