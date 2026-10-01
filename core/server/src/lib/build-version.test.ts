import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import {
  resetBuildVersionCacheForTests,
  resolveBuildVersion,
  shortCommit,
} from "./build-version.js";

describe("resolveBuildVersion", () => {
  beforeEach(() => {
    resetBuildVersionCacheForTests();
  });

  it("prefers BACKSTEROS_BUILD_* env over git", () => {
    const version = resolveBuildVersion({
      BACKSTEROS_BUILD_COMMIT: "abc123def456",
      BACKSTEROS_BUILD_BUILT_AT: "2026-10-01T12:00:00.000Z",
      BACKSTEROS_BUILD_DIRTY: "0",
    });
    assert.deepEqual(version, {
      commit: "abc123def456",
      builtAt: "2026-10-01T12:00:00.000Z",
      dirty: false,
    });
  });

  it("treats dirty=1 as dirty", () => {
    const version = resolveBuildVersion({
      BACKSTEROS_BUILD_COMMIT: "abc",
      BACKSTEROS_BUILD_BUILT_AT: "2026-10-01T12:00:00.000Z",
      BACKSTEROS_BUILD_DIRTY: "1",
    });
    assert.equal(version.dirty, true);
  });

  it("shortCommit truncates", () => {
    assert.equal(shortCommit("abcdefghijklmnop"), "abcdefghijkl");
    assert.equal(shortCommit("unknown"), "unknown");
  });
});
