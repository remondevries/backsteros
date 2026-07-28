import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolvePanelResizeShortcut,
  resolveTaskPanelResizeShortcut,
} from "./task-panel-resize-shortcut.ts";

test("⌥- shrinks the left panel", () => {
  assert.equal(
    resolvePanelResizeShortcut({
      altKey: true,
      metaKey: false,
      ctrlKey: false,
      code: "Minus",
    }),
    "shrink-left",
  );
});

test("⌥= shrinks the right panel", () => {
  assert.equal(
    resolvePanelResizeShortcut({
      altKey: true,
      metaKey: false,
      ctrlKey: false,
      code: "Equal",
    }),
    "shrink-right",
  );
});

test("numpad variants map the same way", () => {
  assert.equal(
    resolvePanelResizeShortcut({
      altKey: true,
      metaKey: false,
      ctrlKey: false,
      code: "NumpadSubtract",
    }),
    "shrink-left",
  );
  assert.equal(
    resolvePanelResizeShortcut({
      altKey: true,
      metaKey: false,
      ctrlKey: false,
      code: "NumpadAdd",
    }),
    "shrink-right",
  );
});

test("ignores without Option, or with ⌘/⌃", () => {
  assert.equal(
    resolvePanelResizeShortcut({
      altKey: false,
      metaKey: false,
      ctrlKey: false,
      code: "Minus",
    }),
    null,
  );
  assert.equal(
    resolvePanelResizeShortcut({
      altKey: true,
      metaKey: true,
      ctrlKey: false,
      code: "Minus",
    }),
    null,
  );
  assert.equal(
    resolvePanelResizeShortcut({
      altKey: true,
      metaKey: false,
      ctrlKey: true,
      code: "Equal",
    }),
    null,
  );
});

test("resolveTaskPanelResizeShortcut remains an alias", () => {
  assert.equal(resolveTaskPanelResizeShortcut, resolvePanelResizeShortcut);
});
