/**
 * Codebase workbench list ↔ detail/editor focus.
 * Tab from the left list focuses the open detail editor; Tab (or Escape) from
 * the editor returns to the content-zone list.
 */

type CodebaseDetailFocusHandler = () => boolean;

let enterHandler: CodebaseDetailFocusHandler | null = null;
let leaveHandler: CodebaseDetailFocusHandler | null = null;

/** Register how to move focus into the open detail editor (files / docs). */
export function registerCodebaseDetailEnterFocus(
  handler: CodebaseDetailFocusHandler,
): () => void {
  enterHandler = handler;
  return () => {
    if (enterHandler === handler) enterHandler = null;
  };
}

/** Register how to leave the detail editor back to the list. */
export function registerCodebaseDetailLeaveFocus(
  handler: CodebaseDetailFocusHandler,
): () => void {
  leaveHandler = handler;
  return () => {
    if (leaveHandler === handler) leaveHandler = null;
  };
}

export function requestCodebaseDetailEnterFocus(): boolean {
  return enterHandler?.() ?? false;
}

export function requestCodebaseDetailLeaveFocus(): boolean {
  return leaveHandler?.() ?? false;
}

/** True when keyboard focus is inside a CodeMirror surface in the workbench detail. */
export function isCodebaseDetailEditorFocused(
  target: EventTarget | null = typeof document !== "undefined"
    ? document.activeElement
    : null,
): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const workbench = target.closest("[data-codebase-workbench]");
  if (!workbench) return false;
  const detail = workbench.querySelector(".codebase-project-workbench__detail");
  if (!detail || !detail.contains(target)) return false;
  return Boolean(
    target.closest(".cm-editor, .cm-content, [contenteditable='true']"),
  );
}
