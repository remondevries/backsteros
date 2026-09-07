import { describe, expect, it } from "vitest";

import {
  isForceContentPreviewShortcut,
  isToggleContentViewModeShortcut,
} from "./contentViewModeShortcut";

function keyEvent(
  overrides: Partial<
    Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat">
  > = {},
): Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat"> {
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
    expect(isToggleContentViewModeShortcut(keyEvent({ metaKey: true }))).toBe(true);
    expect(isToggleContentViewModeShortcut(keyEvent({ ctrlKey: true }))).toBe(true);
  });

  it("rejects repeats, extra modifiers, and other keys", () => {
    expect(isToggleContentViewModeShortcut(keyEvent({ metaKey: true, repeat: true }))).toBe(false);
    expect(isToggleContentViewModeShortcut(keyEvent({ metaKey: true, shiftKey: true }))).toBe(
      false,
    );
    expect(isToggleContentViewModeShortcut(keyEvent({ metaKey: true, altKey: true }))).toBe(false);
    expect(
      isToggleContentViewModeShortcut(keyEvent({ metaKey: true, key: "p", code: "KeyP" })),
    ).toBe(false);
    expect(isToggleContentViewModeShortcut(keyEvent())).toBe(false);
  });
});

describe("isForceContentPreviewShortcut", () => {
  it("matches ⌘P and Ctrl+P", () => {
    expect(isForceContentPreviewShortcut(keyEvent({ metaKey: true, key: "p", code: "KeyP" }))).toBe(
      true,
    );
    expect(isForceContentPreviewShortcut(keyEvent({ ctrlKey: true, key: "p", code: "KeyP" }))).toBe(
      true,
    );
  });
});
