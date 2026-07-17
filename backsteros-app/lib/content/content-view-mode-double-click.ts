import type { MouseEventHandler } from "react";

import type { MarkdownDetailEditorMode } from "@/components/content/use-markdown-detail-editor";

export function shouldToggleContentViewModeOnDoubleClick(
  target: EventTarget | null,
  mode: MarkdownDetailEditorMode,
): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (
    mode === "edit" &&
    target.closest(
      ".cm-content, input, textarea, select, [contenteditable='true']",
    )
  ) {
    return false;
  }

  if (
    mode === "preview" &&
    target.closest("a, button, input, textarea, select, [role='button']")
  ) {
    return false;
  }

  return true;
}

export function createContentViewModeDoubleClickHandler(
  mode: MarkdownDetailEditorMode,
  onToggleMode: () => void,
): MouseEventHandler<HTMLDivElement> {
  return (event) => {
    if (!shouldToggleContentViewModeOnDoubleClick(event.target, mode)) {
      return;
    }

    event.preventDefault();
    onToggleMode();
  };
}
