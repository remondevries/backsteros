import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isSelectAllShortcut,
  shouldHandleSelectAllShortcut,
} from "./list-select-all-shortcut.js";

function keyEvent(
  overrides: Partial<
    Pick<
      KeyboardEvent,
      "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
    >
  > = {},
): Pick<
  KeyboardEvent,
  "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
> {
  return {
    key: "a",
    code: "KeyA",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  };
}

describe("isSelectAllShortcut", () => {
  it("matches ⌘A and Ctrl+A", () => {
    assert.equal(isSelectAllShortcut(keyEvent({ metaKey: true })), true);
    assert.equal(isSelectAllShortcut(keyEvent({ ctrlKey: true })), true);
  });

  it("rejects bare A and modified chords", () => {
    assert.equal(isSelectAllShortcut(keyEvent()), false);
    assert.equal(
      isSelectAllShortcut(keyEvent({ metaKey: true, shiftKey: true })),
      false,
    );
    assert.equal(
      isSelectAllShortcut(keyEvent({ metaKey: true, altKey: true })),
      false,
    );
    assert.equal(
      isSelectAllShortcut(keyEvent({ metaKey: true, key: "b", code: "KeyB" })),
      false,
    );
  });
});

describe("shouldHandleSelectAllShortcut", () => {
  it("respects enabled flag", () => {
    const event = {
      ...keyEvent({ metaKey: true }),
      target: null,
      preventDefault() {},
    } as unknown as KeyboardEvent;
    assert.equal(shouldHandleSelectAllShortcut(event, false), false);
  });
});
