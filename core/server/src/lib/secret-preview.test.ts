import assert from "node:assert/strict";
import test from "node:test";

import { previewSecret } from "./secret-preview.js";

test("previewSecret shows at most the last 4 characters", () => {
  assert.equal(previewSecret(""), "••••");
  assert.equal(previewSecret("abcd"), "••••");
  assert.equal(previewSecret("abcdefgh"), "••••…efgh");
  const bunqLike = "a".repeat(64);
  const preview = previewSecret(bunqLike);
  assert.equal(preview, `••••…${"a".repeat(4)}`);
  assert.ok(preview.length < 20);
  assert.ok(!preview.includes("a".repeat(8)));
});
