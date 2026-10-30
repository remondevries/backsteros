import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  analyticsDateKeys,
  deltaFromSeries,
  formatAnalyticsCount,
  formatAnalyticsPercent,
} from "./analytics.js";

describe("analyticsDateKeys", () => {
  it("returns 7 UTC days ending on now", () => {
    const now = new Date("2026-10-29T18:00:00.000Z");
    const keys = analyticsDateKeys("7d", now);
    assert.equal(keys.length, 7);
    assert.equal(keys[0], "2026-10-23");
    assert.equal(keys[6], "2026-10-29");
  });

  it("returns 30 UTC days", () => {
    const now = new Date("2026-10-29T18:00:00.000Z");
    const keys = analyticsDateKeys("30d", now);
    assert.equal(keys.length, 30);
    assert.equal(keys[0], "2026-09-30");
    assert.equal(keys[29], "2026-10-29");
  });
});

describe("formatAnalyticsCount", () => {
  it("compacts thousands", () => {
    assert.equal(formatAnalyticsCount(0), "0");
    assert.equal(formatAnalyticsCount(999), "999");
    assert.equal(formatAnalyticsCount(13600), "13.6K");
  });
});

describe("formatAnalyticsPercent", () => {
  it("formats one decimal", () => {
    assert.equal(formatAnalyticsPercent(3.84), "3.8%");
  });
});

describe("deltaFromSeries", () => {
  it("marks growth between halves", () => {
    const delta = deltaFromSeries([1, 1, 1, 2, 2, 2]);
    assert.equal(delta.delta, "up");
    assert.match(delta.deltaLabel, /^\+/);
  });

  it("is flat for zeros", () => {
    assert.deepEqual(deltaFromSeries([0, 0, 0]), {
      deltaLabel: "0",
      delta: "flat",
    });
  });
});
