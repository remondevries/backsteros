import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveCreateAssigneeId,
  setDefaultAssigneeId,
} from "./default-assignee.ts";

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

test("resolveCreateAssigneeId uses settings default when omitted", () => {
  mockStorage();
  setDefaultAssigneeId("default-contact");
  assert.equal(resolveCreateAssigneeId(undefined), "default-contact");
});

test("resolveCreateAssigneeId keeps explicit unassigned", () => {
  mockStorage();
  setDefaultAssigneeId("default-contact");
  assert.equal(resolveCreateAssigneeId(null), null);
});

test("resolveCreateAssigneeId keeps explicit assignee", () => {
  mockStorage();
  setDefaultAssigneeId("default-contact");
  assert.equal(resolveCreateAssigneeId("other-contact"), "other-contact");
});
