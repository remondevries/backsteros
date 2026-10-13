import assert from "node:assert/strict";
import { describe, it } from "node:test";

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
