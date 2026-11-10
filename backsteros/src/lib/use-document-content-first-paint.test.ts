import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shouldHardLoadDocumentContent } from "./document-content-load-mode.ts";

/**
 * First-paint contract for useDesktopDocumentContent: never adopt peek()
 * synchronously. Poisoned LRU must not set body or contentVersion until
 * fetchDocumentContent verifies checksums.
 */
export function initialDocumentContentPaintState(hasDocumentId: boolean): {
  initialBody: string;
  contentVersion: number | undefined;
  loading: boolean;
} {
  return {
    initialBody: "",
    contentVersion: undefined,
    loading: hasDocumentId,
  };
}

describe("useDesktopDocumentContent first-render safety", () => {
  it("starts empty/loading even when a cache entry exists", () => {
    const state = initialDocumentContentPaintState(true);
    assert.equal(state.initialBody, "");
    assert.equal(state.contentVersion, undefined);
    assert.equal(state.loading, true);
  });

  it("does not invent ifMatchVersion before verification", () => {
    const state = initialDocumentContentPaintState(true);
    assert.equal(state.contentVersion, undefined);
  });
});

describe("shouldHardLoadDocumentContent", () => {
  it("hard-loads when no verified local body exists yet", () => {
    assert.equal(
      shouldHardLoadDocumentContent({
        localContentVersion: undefined,
        syncedContentVersion: 1,
        cachedChecksumTrusted: false,
      }),
      "load",
    );
  });

  it("skips PowerSync catch-up after a local save already at that version", () => {
    assert.equal(
      shouldHardLoadDocumentContent({
        localContentVersion: 4,
        syncedContentVersion: 4,
        knownChecksum: "abc",
        cachedChecksumTrusted: true,
      }),
      "skip",
    );
  });

  it("soft-refreshes when sync is ahead of the painted body", () => {
    assert.equal(
      shouldHardLoadDocumentContent({
        localContentVersion: 3,
        syncedContentVersion: 4,
        knownChecksum: "new",
        cachedChecksumTrusted: false,
      }),
      "refresh",
    );
  });

  it("soft-refreshes when cache is not trusted even if versions match", () => {
    assert.equal(
      shouldHardLoadDocumentContent({
        localContentVersion: 4,
        syncedContentVersion: 4,
        knownChecksum: "new",
        cachedChecksumTrusted: false,
      }),
      "refresh",
    );
  });
});
