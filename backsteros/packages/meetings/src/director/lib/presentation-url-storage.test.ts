import assert from "node:assert/strict";
import test from "node:test";

import { readStoredPresentationUrl, writeStoredPresentationUrl } from "./presentation-url-storage";

function installWindow(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">) {
  (globalThis as { window?: unknown }).window = { localStorage: storage };
}

test.afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

test("presentation URLs are stored per meeting, with a default slot", () => {
  const store = new Map<string, string>();
  installWindow({
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
  });

  writeStoredPresentationUrl("m1", "https://example.com/a");
  writeStoredPresentationUrl(null, "https://example.com/default");
  assert.deepEqual([...store.keys()].sort(), [
    "backstermeet.presentationUrl.default",
    "backstermeet.presentationUrl.m1",
  ]);
  assert.equal(readStoredPresentationUrl("m1"), "https://example.com/a");
  assert.equal(readStoredPresentationUrl(null), "https://example.com/default");
  assert.equal(readStoredPresentationUrl("m2"), null);

  writeStoredPresentationUrl("m1", null);
  assert.equal(readStoredPresentationUrl("m1"), null);

  store.set("backstermeet.presentationUrl.blank", "   ");
  assert.equal(readStoredPresentationUrl("blank"), null);
});

test("storage failures and missing window are ignored", () => {
  assert.equal(readStoredPresentationUrl("m1"), null);
  writeStoredPresentationUrl("m1", "https://example.com");

  installWindow({
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("quota");
    },
    removeItem: () => {
      throw new Error("denied");
    },
  });
  assert.equal(readStoredPresentationUrl("m1"), null);
  assert.doesNotThrow(() => writeStoredPresentationUrl("m1", "https://example.com"));
  assert.doesNotThrow(() => writeStoredPresentationUrl("m1", null));
});
