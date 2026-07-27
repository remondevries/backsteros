import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  readCursorApiUsage,
  recordCursorApiUsage,
  resetCursorApiUsage,
} from "./cursor-api-usage.ts";

const STORAGE_KEY = "backsteros-development.cursor-api-usage";

function installMemoryStorage(): void {
  const map = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
  (globalThis as { window?: unknown }).window = {
    localStorage: storage,
    dispatchEvent() {
      return true;
    },
  };
}

afterEach(() => {
  resetCursorApiUsage();
  delete (globalThis as { window?: unknown }).window;
});

describe("cursor-api-usage", () => {
  it("starts empty", () => {
    installMemoryStorage();
    const usage = readCursorApiUsage();
    assert.equal(usage.totalTokens, 0);
    assert.equal(usage.turnCount, 0);
  });

  it("accumulates turn tokens", () => {
    installMemoryStorage();
    recordCursorApiUsage({
      totalTokens: 1200,
      inputTokens: 800,
      outputTokens: 400,
    });
    recordCursorApiUsage({
      totalTokens: 300,
      inputTokens: 200,
      outputTokens: 100,
    });
    const usage = readCursorApiUsage();
    assert.equal(usage.totalTokens, 1500);
    assert.equal(usage.inputTokens, 1000);
    assert.equal(usage.outputTokens, 500);
    assert.equal(usage.turnCount, 2);
    assert.ok(usage.updatedAt);
    assert.ok(window.localStorage.getItem(STORAGE_KEY));
  });

  it("ignores empty deltas", () => {
    installMemoryStorage();
    recordCursorApiUsage({ totalTokens: 0 });
    assert.equal(readCursorApiUsage().turnCount, 0);
  });

  it("sums parts when totalTokens is missing", () => {
    installMemoryStorage();
    recordCursorApiUsage({
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 2,
      cacheWriteTokens: 3,
    });
    assert.equal(readCursorApiUsage().totalTokens, 20);
    assert.equal(readCursorApiUsage().turnCount, 1);
  });
});
