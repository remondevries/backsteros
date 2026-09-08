import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveTabCycleShortcut } from "./use-tab-shortcuts.js";

test("⌘⇧[ / ⌘⇧] cycle top product tabs", () => {
  assert.equal(
    resolveTabCycleShortcut({
      altKey: false,
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
      code: "BracketLeft",
      key: "[",
    }),
    "previous",
  );
  assert.equal(
    resolveTabCycleShortcut({
      altKey: false,
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
      code: "BracketRight",
      key: "]",
    }),
    "next",
  );
});

test("⌥[ / ⌥] do not cycle top product tabs", () => {
  assert.equal(
    resolveTabCycleShortcut({
      altKey: true,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      code: "BracketLeft",
      key: "“",
    }),
    null,
  );
  assert.equal(
    resolveTabCycleShortcut({
      altKey: true,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      code: "BracketRight",
      key: "‘",
    }),
    null,
  );
});

test("ignores plain ⇧[, plain ], and ⌘⌥ mixes", () => {
  assert.equal(
    resolveTabCycleShortcut({
      altKey: false,
      metaKey: false,
      ctrlKey: false,
      shiftKey: true,
      code: "BracketLeft",
      key: "{",
    }),
    null,
  );
  assert.equal(
    resolveTabCycleShortcut({
      altKey: false,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      code: "BracketRight",
      key: "]",
    }),
    null,
  );
  assert.equal(
    resolveTabCycleShortcut({
      altKey: true,
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
      code: "BracketLeft",
      key: "[",
    }),
    null,
  );
});
