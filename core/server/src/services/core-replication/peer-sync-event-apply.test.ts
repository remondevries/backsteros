import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolvePeerEventUpdatedAt,
  shouldSkipPeerEventAsStale,
} from "./peer-sync-event-apply.js";

describe("peer sync event apply (OS-49)", () => {
  it("prefers payload updated_at over event createdAt", () => {
    const payloadTime = new Date("2026-09-29T12:00:00.000Z");
    const createdAt = new Date("2026-10-01T08:51:08.000Z");
    const resolved = resolvePeerEventUpdatedAt({
      payload: { updated_at: payloadTime.toISOString() },
      createdAt,
    });
    assert.equal(resolved.toISOString(), payloadTime.toISOString());
  });

  it("falls back to createdAt when payload has no updated_at", () => {
    const createdAt = new Date("2026-09-30T01:00:00.000Z");
    const resolved = resolvePeerEventUpdatedAt({
      payload: { key: "KA" },
      createdAt,
    });
    assert.equal(resolved.toISOString(), createdAt.toISOString());
  });

  it("skips events older than the local row", () => {
    const eventAt = new Date("2026-09-29T12:00:00.000Z");
    const localAt = new Date("2026-10-01T09:00:00.000Z");
    assert.equal(shouldSkipPeerEventAsStale(eventAt, localAt), true);
  });

  it("does not skip equal or newer events", () => {
    const at = new Date("2026-10-01T09:00:00.000Z");
    assert.equal(shouldSkipPeerEventAsStale(at, at), false);
    assert.equal(shouldSkipPeerEventAsStale(at, null), false);
    assert.equal(
      shouldSkipPeerEventAsStale(at, new Date("2026-09-01T00:00:00.000Z")),
      false,
    );
  });
});
