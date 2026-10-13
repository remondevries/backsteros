import {
  isBlockingModalOpen,
  isEditableShortcutTarget,
} from "../shortcuts/shortcut-guards.js";

/** Native Edit → Select All dispatches this into the webview (Tauri menu). */
export const SELECT_ALL_EVENT = "backsteros:select-all";

/**
 * ⌘A / Ctrl+A — select all rows in a multi-select list (tasks, transactions).
 */
export function isSelectAllShortcut(
  event: Pick<
    KeyboardEvent,
    "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
  >,
): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
    return false;
  }
  return event.key.toLowerCase() === "a" || event.code === "KeyA";
}

/** Select all text in the focused editable control. Returns true if handled. */
export function selectAllInFocusedEditable(
  target: EventTarget | null = typeof document !== "undefined"
    ? document.activeElement
    : null,
): boolean {
  if (!(target instanceof HTMLElement)) return false;

  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    if (target.disabled || target.readOnly) return false;
    target.focus();
    target.select();
    return true;
  }

  const editableRoot = target.isContentEditable
    ? target
    : target.closest("[contenteditable='true'], .cm-editor, [role='textbox']");
  if (!(editableRoot instanceof HTMLElement)) return false;

  // CodeMirror / role=textbox: leave selection to the editor when possible by
  // synthesizing select-all inside the focused field.
  if (editableRoot.classList.contains("cm-editor") || editableRoot.closest(".cm-editor")) {
    const cmContent = editableRoot.closest(".cm-editor")?.querySelector(
      ".cm-content",
    ) as HTMLElement | null;
    if (cmContent) {
      const selection = window.getSelection();
      if (!selection) return false;
      const range = document.createRange();
      range.selectNodeContents(cmContent);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
  }

  const selection = window.getSelection();
  if (!selection) return false;
  const range = document.createRange();
  range.selectNodeContents(editableRoot);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

export function shouldHandleSelectAllShortcut(
  event: KeyboardEvent,
  enabled: boolean,
): boolean {
  if (!enabled) return false;
  if (!isSelectAllShortcut(event)) return false;
  if (isBlockingModalOpen()) return false;
  if (isEditableShortcutTarget(event.target)) return false;
  if (
    typeof document !== "undefined" &&
    isEditableShortcutTarget(document.activeElement)
  ) {
    return false;
  }
  return true;
}
