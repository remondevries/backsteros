import { describe, expect, it } from "vite-plus/test";

import {
  BACKSTEROS_SOFT_POLL_INTERVAL_MS,
  BACKSTEROS_SOFT_POLL_MAX_INTERVAL_MS,
  softPollDelayMs,
  stableJsonFingerprint,
} from "./useBacksterosSoftPoll";

describe("stableJsonFingerprint", () => {
  it("matches equal structures", () => {
    expect(stableJsonFingerprint({ a: 1, b: [2] })).toBe(stableJsonFingerprint({ a: 1, b: [2] }));
  });

  it("differs when values change", () => {
    expect(stableJsonFingerprint({ a: 1 })).not.toBe(stableJsonFingerprint({ a: 2 }));
  });

  it("exposes the default soft-poll interval", () => {
    expect(BACKSTEROS_SOFT_POLL_INTERVAL_MS).toBe(3_000);
  });
});

describe("softPollDelayMs", () => {
  it("uses the base interval with no failures", () => {
    expect(softPollDelayMs(3_000, 0)).toBe(3_000);
  });

  it("doubles per consecutive failure until the cap", () => {
    expect(softPollDelayMs(3_000, 1)).toBe(6_000);
    expect(softPollDelayMs(3_000, 2)).toBe(12_000);
    expect(softPollDelayMs(3_000, 10)).toBe(BACKSTEROS_SOFT_POLL_MAX_INTERVAL_MS);
  });
});
