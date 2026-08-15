import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isCommandPaletteToggleKey } from "./command-palette-toggle-key.js";

function keyEvent(
  partial: Partial<{
    key: string;
    code: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
  }>,
) {
  return {
    key: "k",
    code: "KeyK",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    ...partial,
  };
}

describe("isCommandPaletteToggleKey", () => {
  it("matches ⌘K and Ctrl+K", () => {
    assert.equal(isCommandPaletteToggleKey(keyEvent({ metaKey: true })), true);
    assert.equal(isCommandPaletteToggleKey(keyEvent({ ctrlKey: true })), true);
  });

  it("matches ⌘K even when shift is held (⌘⇧K)", () => {
    // shiftKey is intentionally not part of the matcher — Cmd+Shift+K must open.
    assert.equal(
      isCommandPaletteToggleKey(keyEvent({ metaKey: true, key: "K" })),
      true,
    );
  });

  it("rejects ⌥K (reserved for the system-wide global shortcut)", () => {
    assert.equal(
      isCommandPaletteToggleKey(keyEvent({ metaKey: true, altKey: true })),
      false,
    );
  });

  it("rejects plain K and unrelated chords", () => {
    assert.equal(isCommandPaletteToggleKey(keyEvent({})), false);
    assert.equal(
      isCommandPaletteToggleKey(
        keyEvent({ metaKey: true, key: "l", code: "KeyL" }),
      ),
      false,
    );
  });
});
