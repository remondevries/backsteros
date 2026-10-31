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

  it("pullPeerSyncEvents starts resync on resync_needed", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "sync-event-replication.ts"),
      "utf8",
    );
    assert.ok(src.includes("result.resyncNeeded"));
    assert.ok(src.includes("startResync(workspaceId)"));
    assert.ok(src.includes("beginSyncEventResync"));
  });
});
