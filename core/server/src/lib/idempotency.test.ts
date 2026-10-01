import assert from "node:assert/strict";
import test from "node:test";

import {
  clearIdempotencyCacheForTests,
  getIdempotentResponse,
  readIdempotencyKey,
  withIdempotency,
} from "./idempotency.js";

test("readIdempotencyKey trims and rejects empty/oversized", () => {
  assert.equal(readIdempotencyKey("  abc  "), "abc");
  assert.equal(readIdempotencyKey(""), null);
  assert.equal(readIdempotencyKey("   "), null);
  assert.equal(readIdempotencyKey(null), null);
  assert.equal(readIdempotencyKey("x".repeat(257)), null);
});

test("withIdempotency returns cached response and coalesces inflight", async () => {
  clearIdempotencyCacheForTests();
  let calls = 0;
  const run = () =>
    withIdempotency("scope-a", "key-1", async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return { status: 201, body: { id: "task-1" } };
    });

  const [a, b] = await Promise.all([run(), run()]);
  assert.deepEqual(a, { status: 201, body: { id: "task-1" } });
  assert.deepEqual(b, a);
  assert.equal(calls, 1);

  const cached = getIdempotentResponse("scope-a", "key-1");
  assert.deepEqual(cached, a);

  const c = await withIdempotency("scope-a", "key-1", async () => {
    calls += 1;
    return { status: 201, body: { id: "other" } };
  });
  assert.deepEqual(c, a);
  assert.equal(calls, 1);
});
