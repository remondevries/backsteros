import assert from "node:assert/strict";
import test from "node:test";

import {
  LEGACY_LIST_HARD_CAP,
  LIST_MAX_LIMIT,
  clampLegacyListLimit,
} from "./list-query.js";

test("clampLegacyListLimit defaults and clamps to LIST_MAX_LIMIT", () => {
  assert.equal(LEGACY_LIST_HARD_CAP, LIST_MAX_LIMIT);
  assert.equal(clampLegacyListLimit(), LIST_MAX_LIMIT);
  assert.equal(clampLegacyListLimit(50), 50);
  assert.equal(clampLegacyListLimit(9999), LIST_MAX_LIMIT);
  assert.equal(clampLegacyListLimit(0), 1);
  assert.equal(clampLegacyListLimit(-3), 1);
});
