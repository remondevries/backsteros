import assert from "node:assert/strict";
import test from "node:test";

import { AgentReadCache, stableCacheKey } from "./agent-read-cache.js";

test("AgentReadCache returns cached value within TTL", async () => {
  const cache = new AgentReadCache<string>({ ttlMs: 60_000 });
  let loads = 0;
  const load = async () => {
    loads += 1;
    return "hit";
  };

  assert.equal(await cache.getOrLoad("a", load), "hit");
  assert.equal(await cache.getOrLoad("a", load), "hit");
  assert.equal(loads, 1);
});

test("AgentReadCache coalesces in-flight loads", async () => {
  const cache = new AgentReadCache<number>({ ttlMs: 60_000 });
  let loads = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const load = async () => {
    loads += 1;
    await gate;
    return 42;
  };

  const a = cache.getOrLoad("k", load);
  const b = cache.getOrLoad("k", load);
  release();
  assert.deepEqual(await Promise.all([a, b]), [42, 42]);
  assert.equal(loads, 1);
});

test("AgentReadCache expires and evicts LRU", async () => {
  const cache = new AgentReadCache<string>({ ttlMs: 1, maxEntries: 2 });
  await cache.getOrLoad("a", async () => "A");
  await cache.getOrLoad("b", async () => "B");
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(cache.get("a"), undefined);

  const fresh = new AgentReadCache<string>({ ttlMs: 60_000, maxEntries: 2 });
  await fresh.getOrLoad("1", async () => "one");
  await fresh.getOrLoad("2", async () => "two");
  await fresh.getOrLoad("3", async () => "three");
  assert.equal(fresh.get("1"), undefined);
  assert.equal(fresh.get("2"), "two");
  assert.equal(fresh.get("3"), "three");
});

test("stableCacheKey sorts object keys", () => {
  assert.equal(
    stableCacheKey({ b: 1, a: { d: 2, c: 3 } }),
    stableCacheKey({ a: { c: 3, d: 2 }, b: 1 }),
  );
});
