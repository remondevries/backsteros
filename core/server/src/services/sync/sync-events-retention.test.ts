import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SYNC_EVENTS_RETENTION_DAYS_DEFAULT,
  capPeerAfterCursor,
  resolveSyncEventsRetentionDays,
  syncEventsCursorNeedsResync,
  syncEventsRetentionCutoff,
} from "./sync-events-retention.js";

describe("sync_events retention (OS-162 review)", () => {
  it("defaults retention to 30 via env resolver", () => {
    assert.equal(SYNC_EVENTS_RETENTION_DAYS_DEFAULT, 30);
    assert.equal(resolveSyncEventsRetentionDays({}), 30);
    assert.equal(
      resolveSyncEventsRetentionDays({ SYNC_EVENTS_RETENTION_DAYS: "45" }),
      45,
    );
    assert.equal(
      resolveSyncEventsRetentionDays({ SYNC_EVENTS_RETENTION_DAYS: "nope" }),
      30,
    );
  });

  it("cutoff is exactly retentionDays before now", () => {
    const now = new Date("2026-10-31T12:00:00.000Z");
    const cutoff = syncEventsRetentionCutoff(now, 30);
    assert.equal(cutoff.toISOString(), "2026-10-01T12:00:00.000Z");
  });

  it("detects resync when after is older than remaining oldest cursor", () => {
    assert.equal(syncEventsCursorNeedsResync(0, 100), false);
    assert.equal(syncEventsCursorNeedsResync(99, 100), false); // next is contiguous
    assert.equal(syncEventsCursorNeedsResync(98, 100), true); // gap: 99 missing
    assert.equal(syncEventsCursorNeedsResync(50, 100), true);
    assert.equal(syncEventsCursorNeedsResync(100, null), false);
  });

  it("caps peer after at newest cursor on this core", () => {
    assert.equal(capPeerAfterCursor(24997, 100), 100);
    assert.equal(capPeerAfterCursor(50, 100), 50);
    assert.equal(capPeerAfterCursor(-1, 100), 0);
    assert.equal(capPeerAfterCursor(10, 0), 0);
  });
});
