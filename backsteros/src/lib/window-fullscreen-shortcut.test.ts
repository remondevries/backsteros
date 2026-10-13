import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isWindowFullscreenShortcut } from "./window-fullscreen-shortcut.ts";

function event(
  partial: Partial<
    Pick<
      KeyboardEvent,
      "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
    >
  >,
) {
  return {
    key: "Enter",
    code: "Enter",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...partial,
  };
}

describe("isWindowFullscreenShortcut", () => {
  it("matches ⌘Enter and Ctrl+Enter", () => {
    assert.equal(isWindowFullscreenShortcut(event({ metaKey: true })), true);
    assert.equal(isWindowFullscreenShortcut(event({ ctrlKey: true })), true);
  });

  it("matches NumpadEnter with a primary modifier", () => {
    assert.equal(
      isWindowFullscreenShortcut(
        event({ metaKey: true, key: "Enter", code: "NumpadEnter" }),
      ),
      true,
    );
  });

  it("rejects Enter without a primary modifier", () => {
    assert.equal(isWindowFullscreenShortcut(event({})), false);
  });

  it("rejects Shift/Alt variants", () => {
    assert.equal(
      isWindowFullscreenShortcut(event({ metaKey: true, shiftKey: true })),
      false,
    );
    assert.equal(
      isWindowFullscreenShortcut(event({ metaKey: true, altKey: true })),
      false,
    );
  });

  it("rejects other keys with ⌘", () => {
    assert.equal(
      isWindowFullscreenShortcut(
        event({ metaKey: true, key: "f", code: "KeyF" }),
      ),
      false,
    );
  });
});
