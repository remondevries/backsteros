import { describe, expect, it } from "vitest";

import { isFileTaskSubmitShortcut } from "./fileTaskSubmitShortcut";

function event(partial: Partial<Parameters<typeof isFileTaskSubmitShortcut>[0]>) {
  return {
    key: "Enter",
    repeat: false,
    defaultPrevented: false,
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...partial,
  };
}

describe("isFileTaskSubmitShortcut", () => {
  it("accepts ⌘/Ctrl+Enter", () => {
    expect(isFileTaskSubmitShortcut(event({ metaKey: true }))).toBe(true);
    expect(isFileTaskSubmitShortcut(event({ metaKey: false, ctrlKey: true }))).toBe(true);
  });

  it("rejects bare Enter and modified Enter", () => {
    expect(isFileTaskSubmitShortcut(event({ metaKey: false, ctrlKey: false }))).toBe(false);
    expect(isFileTaskSubmitShortcut(event({ shiftKey: true }))).toBe(false);
    expect(isFileTaskSubmitShortcut(event({ altKey: true }))).toBe(false);
    expect(isFileTaskSubmitShortcut(event({ key: "a" }))).toBe(false);
  });

  it("rejects already-handled or repeating keys", () => {
    expect(isFileTaskSubmitShortcut(event({ defaultPrevented: true }))).toBe(false);
    expect(isFileTaskSubmitShortcut(event({ repeat: true }))).toBe(false);
  });
});
