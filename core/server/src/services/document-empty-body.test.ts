import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** Same empty-over-nonempty rule as vault push / updateDocumentContent. */
export function shouldRejectEmptyBodyOverwrite(
  existingByteSize: number,
  incomingByteLength: number,
): boolean {
  return incomingByteLength === 0 && existingByteSize > 0;
}

describe("REST document empty-body guard", () => {
  it("rejects empty overwrite of non-empty", () => {
    assert.equal(shouldRejectEmptyBodyOverwrite(120, 0), true);
  });

  it("allows empty when local is already empty", () => {
    assert.equal(shouldRejectEmptyBodyOverwrite(0, 0), false);
  });

  it("allows non-empty overwrite", () => {
    assert.equal(shouldRejectEmptyBodyOverwrite(120, 40), false);
  });
});
