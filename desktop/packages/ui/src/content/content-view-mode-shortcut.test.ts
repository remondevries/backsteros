import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isForceContentPreviewShortcut,
  isToggleContentViewModeShortcut,
} from "./content-view-mode-shortcut.js";

function keyEvent(
  overrides: Partial<
    Pick<
      KeyboardEvent,
      "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat"
    >
  > = {},
): Pick<
  KeyboardEvent,
  "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat"
> {
  return {
    key: "e",
    code: "KeyE",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    ...overrides,
  };
}

describe("isToggleContentViewModeShortcut", () => {
  it("matches ⌘E and Ctrl+E", () => {
    assert.equal(
      isToggleContentViewModeShortcut(keyEvent({ metaKey: true })),
      true,
    );
    assert.equal(
      isToggleContentViewModeShortcut(keyEvent({ ctrlKey: true })),
      true,
    );
  });

  it("rejects repeats, extra modifiers, and other keys", () => {
    assert.equal(
      isToggleContentViewModeShortcut(keyEvent({ metaKey: true, repeat: true })),
      false,
    );
    assert.equal(
      isToggleContentViewModeShortcut(
        keyEvent({ metaKey: true, shiftKey: true }),
      ),
      false,
    );
    assert.equal(
      isToggleContentViewModeShortcut(keyEvent({ metaKey: true, altKey: true })),
      false,
    );
    assert.equal(
      isToggleContentViewModeShortcut(
        keyEvent({ metaKey: true, key: "p", code: "KeyP" }),
      ),
      false,
    );
    assert.equal(isToggleContentViewModeShortcut(keyEvent()), false);
  });
});

describe("isForceContentPreviewShortcut", () => {
  it("matches ⌘P and Ctrl+P", () => {
    assert.equal(
      isForceContentPreviewShortcut(
        keyEvent({ metaKey: true, key: "p", code: "KeyP" }),
      ),
      true,
    );
    assert.equal(
      isForceContentPreviewShortcut(
        keyEvent({ ctrlKey: true, key: "p", code: "KeyP" }),
      ),
      true,
    );
  });

  it("rejects repeats and unrelated keys", () => {
    assert.equal(
      isForceContentPreviewShortcut(
        keyEvent({ metaKey: true, key: "p", code: "KeyP", repeat: true }),
      ),
      false,
    );
    assert.equal(
      isForceContentPreviewShortcut(keyEvent({ metaKey: true })),
      false,
    );
  });
});
