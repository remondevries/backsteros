import { describe, expect, it } from "vitest";

import { isCommentComposerFocusShortcut } from "./TaskCommentsSection";

function keyEvent(
  init: Partial<KeyboardEvent> & Pick<KeyboardEvent, "key">,
): Pick<KeyboardEvent, "key" | "code" | "shiftKey" | "metaKey" | "ctrlKey" | "altKey" | "repeat"> {
  return {
    code: "",
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    repeat: false,
    ...init,
  };
}

describe("isCommentComposerFocusShortcut", () => {
  it("matches Shift+C like BacksterOS desktop", () => {
    expect(
      isCommentComposerFocusShortcut(keyEvent({ key: "C", code: "KeyC", shiftKey: true })),
    ).toBe(true);
    expect(
      isCommentComposerFocusShortcut(keyEvent({ key: "c", code: "KeyC", shiftKey: true })),
    ).toBe(true);
  });

  it("ignores plain C and modified chords", () => {
    expect(isCommentComposerFocusShortcut(keyEvent({ key: "c", code: "KeyC" }))).toBe(false);
    expect(
      isCommentComposerFocusShortcut(
        keyEvent({ key: "c", code: "KeyC", shiftKey: true, metaKey: true }),
      ),
    ).toBe(false);
  });
});
