import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shouldHandleClearSelectionShortcut } from "./list-clear-selection-shortcut.js";

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
