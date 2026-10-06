import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LOCAL_CORE_UPDATE_BUILD_HINT,
  VERSION_MISMATCH_DISMISS_STORAGE_PREFIX,
  dismissVersionMismatch,
  formatVersionMismatchWarning,
  isVersionMismatchDismissed,
  parseHealthVersionMismatch,
  shortCommitLabel,
  versionMismatchDismissalKey,
} from "./local-core-version-mismatch.ts";

describe("parseHealthVersionMismatch", () => {
  it("returns null when versionMismatch is absent or false", () => {
    assert.equal(parseHealthVersionMismatch(null), null);
    assert.equal(parseHealthVersionMismatch({ ok: true }), null);
    assert.equal(
      parseHealthVersionMismatch({ versionMismatch: false, version: { commit: "a" } }),
      null,
    );
  });

  it("reads local and peer commits when health reports a mismatch", () => {
    assert.deepEqual(
      parseHealthVersionMismatch({
        ok: true,
        versionMismatch: true,
        version: { commit: "localcommit0000", builtAt: "2026-10-02T00:00:00Z" },
        peerVersion: { commit: "peercommit0000", builtAt: "2026-10-06T00:00:00Z" },
      }),
      { localCommit: "localcommit0000", peerCommit: "peercommit0000" },
    );
  });

  it("falls back to unknown when commit fields are missing", () => {
    assert.deepEqual(parseHealthVersionMismatch({ versionMismatch: true }), {
      localCommit: "unknown",
      peerCommit: "unknown",
    });
  });
});

describe("version mismatch warning copy", () => {
  it("includes short commits and the update-build recovery action", () => {
    const mismatch = {
      localCommit: "abcdef1234567890",
      peerCommit: "fedcba0987654321",
    };
    const text = formatVersionMismatchWarning(mismatch);
    assert.match(text, /local=abcdef123456/);
    assert.match(text, /peer=fedcba098765/);
    assert.equal(text.includes(LOCAL_CORE_UPDATE_BUILD_HINT), true);
    assert.equal(shortCommitLabel("abc"), "abc");
  });

  it("persists dismiss per local/peer commit pair", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };
    const first = versionMismatchDismissalKey({
      localCommit: "aaa",
      peerCommit: "bbb",
    });
    const second = versionMismatchDismissalKey({
      localCommit: "aaa",
      peerCommit: "ccc",
    });
    assert.equal(isVersionMismatchDismissed(first, storage), false);
    dismissVersionMismatch(first, storage);
    assert.equal(
      store.get(VERSION_MISMATCH_DISMISS_STORAGE_PREFIX + first),
      "1",
    );
    assert.equal(isVersionMismatchDismissed(first, storage), true);
    assert.equal(isVersionMismatchDismissed(second, storage), false);
  });
});
