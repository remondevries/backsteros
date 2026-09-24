import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { isCopyEntityIdShortcut } from "./copy-entity-id-shortcut.js";

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
    key: ".",
    code: "Period",
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    target: null,
    ...overrides,
  } as unknown as KeyboardEvent;
}

describe("isCopyEntityIdShortcut", () => {
  it("matches ⌘. / Ctrl+.", () => {
    assert.equal(isCopyEntityIdShortcut(keyEvent()), true);
    assert.equal(
      isCopyEntityIdShortcut(keyEvent({ metaKey: false, ctrlKey: true })),
      true,
    );
  });

  it("rejects when repeating, shifted, alted, or wrong key", () => {
    assert.equal(isCopyEntityIdShortcut(keyEvent({ repeat: true })), false);
    assert.equal(isCopyEntityIdShortcut(keyEvent({ shiftKey: true })), false);
    assert.equal(isCopyEntityIdShortcut(keyEvent({ altKey: true })), false);
    assert.equal(
      isCopyEntityIdShortcut(
        keyEvent({ key: ",", code: "Comma", metaKey: true }),
      ),
      false,
    );
    assert.equal(
      isCopyEntityIdShortcut(
        keyEvent({ key: ".", code: "Period", metaKey: false, ctrlKey: false }),
      ),
      false,
    );
  });
});
