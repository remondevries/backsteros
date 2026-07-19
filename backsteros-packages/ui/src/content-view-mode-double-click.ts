import type { MouseEventHandler } from "react";

export type ContentViewModeDoubleClickMode = "edit" | "preview";

/** Skip view-mode toggle when the double-click landed on an interactive editor control. */
export function shouldToggleContentViewModeOnDoubleClick(
  target: EventTarget | null,
  mode: ContentViewModeDoubleClickMode,
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
  mode: ContentViewModeDoubleClickMode,
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
