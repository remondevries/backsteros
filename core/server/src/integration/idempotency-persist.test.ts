import assert from "node:assert/strict";
import test from "node:test";

import {
  clearIdempotencyCacheForTests,
  deleteIdempotencyRowForTests,
  getIdempotentResponse,
  withIdempotency,
} from "../lib/idempotency.js";
import { sqlClient } from "../db/index.js";

test("withIdempotency coalesces inflight and persists across memory clear", async (context) => {
  context.after(async () => {
    await sqlClient.end();
  });

  clearIdempotencyCacheForTests();
  const scope = `scope-it-${Date.now()}`;
  const key = "key-1";
  await deleteIdempotencyRowForTests(scope, key);

  let calls = 0;
  const run = () =>
    withIdempotency(scope, key, async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return { status: 201, body: { id: "task-1" } };
    });

  const [a, b] = await Promise.all([run(), run()]);
  assert.deepEqual(a, { status: 201, body: { id: "task-1" } });
  assert.deepEqual(b, a);
  assert.equal(calls, 1);

  clearIdempotencyCacheForTests();
  const fromDb = await getIdempotentResponse(scope, key);
  assert.deepEqual(fromDb, a);

  const c = await withIdempotency(scope, key, async () => {
    calls += 1;
    return { status: 201, body: { id: "other" } };
  });
  assert.deepEqual(c, a);
  assert.equal(calls, 1);

  await deleteIdempotencyRowForTests(scope, key);
});
