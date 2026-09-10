import { describe, expect, it } from "vite-plus/test";

import { isTitleRenameShortcut } from "./titleRenameShortcut";

function keyEvent(
  overrides: Partial<
    Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat">
  > = {},
): Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat"> {
  return {
    key: "r",
    code: "KeyR",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    ...overrides,
  };
}

describe("isTitleRenameShortcut", () => {
  it("matches ⌘R and Ctrl+R", () => {
    expect(isTitleRenameShortcut(keyEvent({ metaKey: true }))).toBe(true);
    expect(isTitleRenameShortcut(keyEvent({ ctrlKey: true }))).toBe(true);
  });

  it("rejects repeats, extra modifiers, and other keys", () => {
    expect(isTitleRenameShortcut(keyEvent({ metaKey: true, repeat: true }))).toBe(false);
    expect(isTitleRenameShortcut(keyEvent({ metaKey: true, shiftKey: true }))).toBe(false);
    expect(isTitleRenameShortcut(keyEvent({ metaKey: true, altKey: true }))).toBe(false);
    expect(isTitleRenameShortcut(keyEvent({ metaKey: true, key: "e", code: "KeyE" }))).toBe(false);
    expect(isTitleRenameShortcut(keyEvent())).toBe(false);
  });
});
