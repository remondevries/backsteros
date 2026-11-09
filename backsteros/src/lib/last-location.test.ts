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

test("chat deep links are not persistable (avoids StartupRedirect loop)", () => {
  mockStorage();
  writeLastLocation("/chat/un6yMklKBw9fCFSoshWPp");
  writeLastLocation("/chat/un6yMklKBw9fCFSoshWPp?message=abc");
  assert.equal(readLastLocation(), null);
  assert.equal(resolveStartupLocation(), "/inbox");

  // Stale value already in storage must not be reused as startup target.
  globalThis.window.localStorage.setItem(
    LAST_LOCATION_STORAGE_KEY,
    "/chat/stale-thread",
  );
  assert.equal(readLastLocation(), null);
  assert.equal(resolveStartupLocation(), "/inbox");
});

test("meeting room paths are not persistable (avoid cold-start Director)", () => {
  mockStorage();
  writeLastLocation(
    "/calendar/meetings/11111111-1111-4111-8111-111111111111/room",
  );
  assert.equal(readLastLocation(), null);
  assert.equal(resolveStartupLocation(), "/inbox");
});
