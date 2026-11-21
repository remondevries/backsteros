import assert from "node:assert/strict";
import test from "node:test";

import { readIdempotencyKey } from "./idempotency.js";

test("readIdempotencyKey trims and rejects empty/oversized", () => {
  assert.equal(readIdempotencyKey("  abc  "), "abc");
  assert.equal(readIdempotencyKey(""), null);
  assert.equal(readIdempotencyKey("   "), null);
  assert.equal(readIdempotencyKey(null), null);
  assert.equal(readIdempotencyKey("x".repeat(257)), null);
});
