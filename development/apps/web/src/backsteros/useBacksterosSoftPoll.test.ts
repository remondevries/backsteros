import { describe, expect, it } from "vite-plus/test";

import {
  BACKSTEROS_SOFT_POLL_INTERVAL_MS,
  stableJsonFingerprint,
} from "./useBacksterosSoftPoll";

describe("stableJsonFingerprint", () => {
  it("matches equal structures", () => {
    expect(stableJsonFingerprint({ a: 1, b: [2] })).toBe(
      stableJsonFingerprint({ a: 1, b: [2] }),
    );
  });

  it("differs when values change", () => {
    expect(stableJsonFingerprint({ a: 1 })).not.toBe(stableJsonFingerprint({ a: 2 }));
  });

  it("exposes the default soft-poll interval", () => {
    expect(BACKSTEROS_SOFT_POLL_INTERVAL_MS).toBe(3_000);
  });
});
