import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createPersistedSessionLruCache,
  type LruStorage,
} from "./session-lru-cache.ts";

function memoryStorage(): LruStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
    removeItem(key: string) {
      data.delete(key);
    },
  };
}

test("persisted LRU hydrates the next instance from the same storage", () => {
  const storage = memoryStorage();
  const first = createPersistedSessionLruCache<{ content: string }>({
    limit: 32,
    storageKey: "backsteros:doc-content-test",
    storage,
  });
  first.set("doc-1", { content: "# Today" });

  const second = createPersistedSessionLruCache<{ content: string }>({
    limit: 32,
    storageKey: "backsteros:doc-content-test",
    storage,
  });
  assert.deepEqual(second.peek("doc-1"), { content: "# Today" });
});

test("persisted LRU keeps an oversized value in RAM but does not persist it", () => {
  const storage = memoryStorage();
  const cache = createPersistedSessionLruCache<{ content: string }>({
    limit: 8,
    storageKey: "backsteros:doc-content-test-max",
    storage,
    maxValueChars: 16,
  });
  cache.set("tiny", { content: "ok" });
  cache.set("huge", { content: "this-body-is-too-large-to-persist" });

  assert.match(cache.peek("huge")?.content ?? "", /too-large/);

  const reloaded = createPersistedSessionLruCache<{ content: string }>({
    limit: 8,
    storageKey: "backsteros:doc-content-test-max",
    storage,
    maxValueChars: 16,
  });
  assert.deepEqual(reloaded.peek("tiny"), { content: "ok" });
  assert.equal(reloaded.peek("huge"), null);
});

test("persisted LRU evicts the oldest entry and persists the remainder", () => {
  const storage = memoryStorage();
  const cache = createPersistedSessionLruCache<string>({
    limit: 2,
    storageKey: "backsteros:journal-ids-test",
    storage,
  });
  cache.set("2026-08-01", "a");
  cache.set("2026-08-02", "b");
  cache.set("2026-08-03", "c");

  assert.equal(cache.peek("2026-08-01"), null);
  assert.equal(cache.peek("2026-08-03"), "c");

  const reloaded = createPersistedSessionLruCache<string>({
    limit: 2,
    storageKey: "backsteros:journal-ids-test",
    storage,
  });
  assert.equal(reloaded.peek("2026-08-01"), null);
  assert.equal(reloaded.peek("2026-08-02"), "b");
  assert.equal(reloaded.peek("2026-08-03"), "c");
});
