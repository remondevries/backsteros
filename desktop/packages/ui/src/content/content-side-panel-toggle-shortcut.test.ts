import assert from "node:assert/strict";
import { test } from "node:test";

import { isContentSidePanelToggleShortcut } from "./content-side-panel-toggle-shortcut.ts";

function keyEvent(
  partial: Partial<
    Pick<
      KeyboardEvent,
      "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
    >
  >,
): KeyboardEvent {
  return {
    key: "[",
    code: "BracketLeft",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...partial,
  } as KeyboardEvent;
}

test("⇧[ toggles the left content list panel", () => {
  assert.equal(
    isContentSidePanelToggleShortcut(
      keyEvent({ shiftKey: true, code: "BracketLeft", key: "{" }),
    ),
    true,
  );
});

test("plain [ is not the content side panel toggle", () => {
  assert.equal(isContentSidePanelToggleShortcut(keyEvent({})), false);
});

test("⌘⇧[ is reserved for product tab cycling", () => {
  assert.equal(
    isContentSidePanelToggleShortcut(
      keyEvent({ metaKey: true, shiftKey: true, code: "BracketLeft" }),
    ),
    false,
  );
});

test("] is not the left panel toggle", () => {
  assert.equal(
    isContentSidePanelToggleShortcut(
      keyEvent({
        shiftKey: true,
        code: "BracketRight",
        key: "}",
      }),
    ),
    false,
  );
});
