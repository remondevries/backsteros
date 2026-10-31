import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  IDLE_SYNC_EVENT_RESYNC,
  isSyncEventResyncActive,
  parseSyncEventResyncFacts,
  syncEventResyncDetail,
  syncEventResyncTitle,
} from "./sync-event-resync-client";

describe("sync-event-resync client (OS-163)", () => {
  it("parses idle when syncEventResync is missing", () => {
    assert.deepEqual(parseSyncEventResyncFacts({}), IDLE_SYNC_EVENT_RESYNC);
  });

  it("parses bootstrapping facts from sync-health", () => {
    const facts = parseSyncEventResyncFacts({
      syncEventResync: {
        needed: true,
        status: "bootstrapping",
        message: "copying tables",
        startedAt: "2026-10-31T20:00:00.000Z",
        finishedAt: null,
        workspaceId: "ws1",
      },
    });
    assert.equal(facts.status, "bootstrapping");
    assert.equal(facts.needed, true);
    assert.equal(isSyncEventResyncActive(facts), true);
    assert.match(syncEventResyncTitle(facts.status), /Reloading/i);
    assert.match(syncEventResyncDetail(facts), /copying tables/);
  });

  it("treats failed as active clear state", () => {
    const facts = parseSyncEventResyncFacts({
      syncEventResync: {
        needed: true,
        status: "failed",
        message: "bootstrap fetch tasks failed (503)",
        startedAt: "2026-10-31T20:00:00.000Z",
        finishedAt: "2026-10-31T20:01:00.000Z",
        workspaceId: "ws1",
      },
    });
    assert.equal(isSyncEventResyncActive(facts), true);
    assert.match(syncEventResyncTitle(facts.status), /failed/i);
  });
});
