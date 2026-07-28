import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldHandleTabChromeShortcut } from "../dist/shortcut-guards.js";

test("shouldHandleTabChromeShortcut allows chrome keys when no modal is open", () => {
  const event = {
    metaKey: true,
    key: "w",
    code: "KeyW",
    target: null,
  } as unknown as KeyboardEvent;

  assert.equal(shouldHandleTabChromeShortcut(event), true);
});
