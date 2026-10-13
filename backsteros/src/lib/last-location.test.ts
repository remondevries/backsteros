import assert from "node:assert/strict";
import test from "node:test";

import {
  LAST_LOCATION_STORAGE_KEY,
  readLastLocation,
  resolveStartupLocation,
  writeLastLocation,
} from "./last-location";

function mockStorage() {
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
    clear() {
      map.clear();
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage },
  });
  return storage;
}

test("resolveStartupLocation defaults to inbox", () => {
  mockStorage();
  assert.equal(resolveStartupLocation(), "/inbox");
});

test("write/read round-trip keeps pathname and search", () => {
  mockStorage();
  writeLastLocation("/projects/demo/tasks?view=board");
  assert.equal(readLastLocation(), "/projects/demo/tasks?view=board");
  assert.equal(resolveStartupLocation(), "/projects/demo/tasks?view=board");
});

test("writeLastLocation ignores root and overlay paths", () => {
  mockStorage();
  writeLastLocation("/");
  writeLastLocation("/desktop-overlay/palette");
  assert.equal(readLastLocation(), null);
  assert.equal(
    globalThis.window.localStorage.getItem(LAST_LOCATION_STORAGE_KEY),
    null,
  );
});
