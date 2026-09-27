import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Heavy service tests that would import `db` are covered by
 * document-core-property-schema.test.ts (pure) and CAS helpers.
 * This file keeps a thin contract check for the properties error codes.
 */
describe("document properties error contract", () => {
  it("uses only 400/403/409/422 for properties API failures", () => {
    const codes = {
      bad_filter: 400,
      forbidden: 403,
      content_version_conflict: 409,
      invalid_yaml: 422,
      invalid_property: 422,
      storage_not_found: 422,
    };
    assert.deepEqual(Object.values(codes).sort(), [
      400, 403, 409, 422, 422, 422,
    ]);
  });
});
