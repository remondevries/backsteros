import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  isToggleHighlightedSelectionShortcut,
  shouldHandleToggleHighlightedSelectionShortcut,
} from "./list-toggle-highlighted-selection-shortcut.js";

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

  it("rejects Shift+J/K (those navigate + extend selection instead)", () => {
    assert.equal(
      isToggleHighlightedSelectionShortcut(
        keyEvent({ key: "J", code: "KeyJ" }),
      ),
      false,
    );
    assert.equal(
      isToggleHighlightedSelectionShortcut(
        keyEvent({ key: "K", code: "KeyK" }),
      ),
      false,
    );
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
