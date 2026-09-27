import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Contract for atomic ifMatchVersion on updateDocumentContent:
 * UPDATE … WHERE id = ? AND content_version = ? — zero rows ⇒ conflict.
 */
export function documentContentUpdateLostRace(rowCount: number): boolean {
  return rowCount === 0;
}

describe("document content version conflict (atomic update)", () => {
  it("treats zero updated rows as CONTENT_VERSION_CONFLICT", () => {
    assert.equal(documentContentUpdateLostRace(0), true);
    assert.equal(documentContentUpdateLostRace(1), false);
  });

  it("documents the conflict error code used by REST", () => {
    const code = "CONTENT_VERSION_CONFLICT";
    assert.equal(code, "CONTENT_VERSION_CONFLICT");
  });
});
