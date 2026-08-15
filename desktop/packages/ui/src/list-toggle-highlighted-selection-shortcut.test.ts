import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isToggleHighlightedSelectionShortcut,
  shouldHandleToggleHighlightedSelectionShortcut,
} from "./list-toggle-highlighted-selection-shortcut.js";

function keyEvent(
  overrides: Partial<
    Pick<
      KeyboardEvent,
      "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat"
    >
  > = {},
): KeyboardEvent {
  return {
    key: " ",
    code: "Space",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: true,
    repeat: false,
    target: null,
    ...overrides,
  } as unknown as KeyboardEvent;
}

describe("isToggleHighlightedSelectionShortcut", () => {
  it("matches Shift+Space", () => {
    assert.equal(isToggleHighlightedSelectionShortcut(keyEvent()), true);
  });

  it("rejects plain Space and modified chords", () => {
    assert.equal(
      isToggleHighlightedSelectionShortcut(keyEvent({ shiftKey: false })),
      false,
    );
    assert.equal(
      isToggleHighlightedSelectionShortcut(keyEvent({ metaKey: true })),
      false,
    );
    assert.equal(
      isToggleHighlightedSelectionShortcut(keyEvent({ key: "Enter", code: "Enter" })),
      false,
    );
  });
});

describe("shouldHandleToggleHighlightedSelectionShortcut", () => {
  it("requires enabled", () => {
    assert.equal(
      shouldHandleToggleHighlightedSelectionShortcut(keyEvent(), false),
      false,
    );
    assert.equal(
      shouldHandleToggleHighlightedSelectionShortcut(keyEvent(), true),
      true,
    );
  });
});
