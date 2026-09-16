import { describe, expect, it } from "vite-plus/test";

import { hasVisibleTaskCommentComposer } from "./useBacksterosFileTaskShortcut";
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

describe("file-task Shift+C shortcut", () => {
  it("reuses the Shift+C chord matcher", () => {
    expect(
      isCommentComposerFocusShortcut(keyEvent({ key: "C", code: "KeyC", shiftKey: true })),
    ).toBe(true);
  });

  it("detects a visible comment composer owner for Shift+C", () => {
    const composer = {
      getClientRects: () => [{ width: 10, height: 10 }],
    };
    const root = {
      querySelector: (selector: string) =>
        selector === '[data-task-comment-focus="composer"]' ? composer : null,
    };
    expect(hasVisibleTaskCommentComposer(root as unknown as ParentNode)).toBe(true);
  });

  it("ignores a missing or zero-size comment composer", () => {
    expect(
      hasVisibleTaskCommentComposer({ querySelector: () => null } as unknown as ParentNode),
    ).toBe(false);

    const hidden = {
      getClientRects: () => [],
    };
    const root = {
      querySelector: () => hidden,
    };
    expect(hasVisibleTaskCommentComposer(root as unknown as ParentNode)).toBe(false);
  });
});
