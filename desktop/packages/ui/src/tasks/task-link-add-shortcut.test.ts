import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isAddTaskLinkShortcut,
  shouldHandleAddTaskLinkShortcut,
} from "./task-link-add-shortcut.js";

function keyEvent(
  overrides: Partial<
    Pick<
      KeyboardEvent,
      "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
    >
  > = {},
): KeyboardEvent {
  return {
    key: "l",
    code: "KeyL",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  } as KeyboardEvent;
}

describe("isAddTaskLinkShortcut", () => {
  it("matches ⌘L and Ctrl+L", () => {
    assert.equal(isAddTaskLinkShortcut(keyEvent({ metaKey: true })), true);
    assert.equal(isAddTaskLinkShortcut(keyEvent({ ctrlKey: true })), true);
  });

  it("rejects alt/shift variants and other keys", () => {
    assert.equal(
      isAddTaskLinkShortcut(keyEvent({ metaKey: true, altKey: true })),
      false,
    );
    assert.equal(
      isAddTaskLinkShortcut(keyEvent({ metaKey: true, shiftKey: true })),
      false,
    );
    assert.equal(
      isAddTaskLinkShortcut(keyEvent({ metaKey: true, key: "k", code: "KeyK" })),
      false,
    );
    assert.equal(isAddTaskLinkShortcut(keyEvent()), false);
  });
});

describe("shouldHandleAddTaskLinkShortcut", () => {
  it("requires an editable instance that is not already open", () => {
    assert.equal(
      shouldHandleAddTaskLinkShortcut(keyEvent({ metaKey: true }), {
        enabled: false,
        modalAlreadyOpen: false,
        root: null,
      }),
      false,
    );
    assert.equal(
      shouldHandleAddTaskLinkShortcut(keyEvent({ metaKey: true }), {
        enabled: true,
        modalAlreadyOpen: true,
        root: null,
      }),
      false,
    );
    assert.equal(
      shouldHandleAddTaskLinkShortcut(keyEvent({ metaKey: true }), {
        enabled: true,
        modalAlreadyOpen: false,
        root: null,
      }),
      true,
    );
  });
});
