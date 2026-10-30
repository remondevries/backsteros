import assert from "node:assert/strict";
import { test } from "node:test";

import { isChatPanelToggleShortcut } from "./chat-panel-toggle-shortcut.ts";

function keyEvent(
  partial: Partial<
    Pick<
      KeyboardEvent,
      "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
    >
  >,
): KeyboardEvent {
  return {
    key: "]",
    code: "BracketRight",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...partial,
  } as KeyboardEvent;
}

test("plain ] toggles the global chat column", () => {
  assert.equal(isChatPanelToggleShortcut(keyEvent({})), true);
});

test("⇧] is not the shell chat toggle (reserved / unused)", () => {
  assert.equal(isChatPanelToggleShortcut(keyEvent({ shiftKey: true })), false);
});

test("⌘] is not the shell chat toggle", () => {
  assert.equal(isChatPanelToggleShortcut(keyEvent({ metaKey: true })), false);
});

test("[ is not the chat panel toggle", () => {
  assert.equal(
    isChatPanelToggleShortcut(
      keyEvent({ key: "[", code: "BracketLeft" }),
    ),
    false,
  );
});
