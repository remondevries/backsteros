import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SYNC_EVENTS_RETENTION_DAYS,
  syncEventsFeedRequiresPeerCursor,
  syncEventsRetentionCutoff,
} from "./sync-events-retention.js";

describe("sync_events retention (OS-162)", () => {
  it("keeps retention days in one exported constant (default 30)", () => {
    assert.equal(SYNC_EVENTS_RETENTION_DAYS, 30);
  });

  it("cutoff is exactly retentionDays before now", () => {
    const now = new Date("2026-10-31T12:00:00.000Z");
    const cutoff = syncEventsRetentionCutoff(now, 30);
    assert.equal(cutoff.toISOString(), "2026-10-01T12:00:00.000Z");
  });

  it("cloud role gates deletes on peer cursor; local does not", () => {
    assert.equal(
      syncEventsFeedRequiresPeerCursor({
        CORE_REPLICATION_PEER_URL: "http://127.0.0.1:8789",
        CORE_REPLICATION_SECRET: "test",
        CORE_REPLICATION_ROLE: "cloud",
      }),
      true,
    );
    assert.equal(
      syncEventsFeedRequiresPeerCursor({
        CORE_REPLICATION_PEER_URL: "http://127.0.0.1:8789",
        CORE_REPLICATION_SECRET: "test",
        CORE_REPLICATION_ROLE: "local",
      }),
      false,
    );
    assert.equal(syncEventsFeedRequiresPeerCursor({}), false);
  });
});
