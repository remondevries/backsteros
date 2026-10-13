import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { shouldHandleClearSelectionShortcut } from "./list-clear-selection-shortcut.js";

// Editable-target guards use `instanceof HTMLElement`; node:test has no DOM.
const previousHTMLElement = globalThis.HTMLElement;
before(() => {
  globalThis.HTMLElement = class HTMLElement {} as unknown as typeof HTMLElement;
});
after(() => {
  globalThis.HTMLElement = previousHTMLElement;
});

function keyEvent(
  overrides: Partial<
    Pick<
      KeyboardEvent,
      "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat"
    >
  > = {},
): KeyboardEvent {
  return {
    key: "Escape",
    code: "Escape",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    target: null,
    ...overrides,
  } as unknown as KeyboardEvent;
}

describe("shouldHandleClearSelectionShortcut", () => {
  it("matches bare Escape when enabled", () => {
    assert.equal(shouldHandleClearSelectionShortcut(keyEvent(), true), true);
  });

  it("rejects when disabled, repeating, or modified", () => {
    assert.equal(shouldHandleClearSelectionShortcut(keyEvent(), false), false);
    assert.equal(
      shouldHandleClearSelectionShortcut(keyEvent({ repeat: true }), true),
      false,
    );
    assert.equal(
      shouldHandleClearSelectionShortcut(keyEvent({ metaKey: true }), true),
      false,
    );
    assert.equal(
      shouldHandleClearSelectionShortcut(keyEvent({ key: "a", code: "KeyA" }), true),
      false,
    );
  });
});
