import { isContentEditModeActive } from "../content/content-view-mode.js";

export const BLOCKING_MODAL_SELECTORS = [
  "[data-blocking-modal]",
  "[data-compose-modal]",
  "[data-entity-delete-modal]",
  "[data-entity-duplicate-modal]",
  "[data-entity-icon-picker]",
  "[cmdk-dialog][data-state='open']",
] as const;

export const BLOCKING_MODAL_SELECTOR = BLOCKING_MODAL_SELECTORS.join(", ");

export function isBlockingModalOpen(): boolean {
  if (typeof document === "undefined") return false;
  return document.querySelector(BLOCKING_MODAL_SELECTOR) !== null;
}

export function isTargetInsideBlockingModal(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.closest(BLOCKING_MODAL_SELECTOR) !== null;
}

/**
 * True when keyboard focus is in a field that should receive typed characters
 * (and page/list hotkeys must yield).
 */
export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }

  if (target.isContentEditable) {
    return true;
  }

  if (target.closest(".cm-editor") || target.closest("[role='textbox']")) {
    return true;
  }

  // xterm focuses a helper textarea; also guard the host so j/k cannot steal
  // keys while the user is typing in a terminal.
  if (
    target.closest(".xterm") ||
    target.classList.contains("xterm-helper-textarea")
  ) {
    return true;
  }

  return false;
}

/**
 * Enter/Space activation for a `role="button"` wrapper. Ignores keys that
 * bubbled from nested controls (including React portal children such as a
 * searchable-dropdown search field).
 */
export function isDirectRoleButtonActivationKey(event: {
  key: string;
  repeat?: boolean;
  shiftKey?: boolean;
  target: EventTarget | null;
  currentTarget: EventTarget | null;
}): boolean {
  if (event.repeat) return false;
  if (event.target !== event.currentTarget) return false;
  if (event.key === "Enter") return true;
  if (event.key === " " || event.key === "Spacebar") {
    // Shift+Space toggles list multi-select instead of activating the row.
    return !event.shiftKey;
  }
  return false;
}

/** Page-level shortcuts should not run while editing content or a modal is open. */
export function shouldBlockPageShortcuts(): boolean {
  return isContentEditModeActive() || isBlockingModalOpen();
}

export function shouldHandleGlobalShortcut(event: KeyboardEvent): boolean {
  if (isBlockingModalOpen() && !isTargetInsideBlockingModal(event.target)) {
    return false;
  }

  if (isEditableShortcutTarget(event.target)) {
    return false;
  }

  // Capture-phase listeners sometimes see a non-field target while focus is
  // still in an input (or a searchable-dropdown listbox).
  if (
    typeof document !== "undefined" &&
    isEditableShortcutTarget(document.activeElement)
  ) {
    return false;
  }

  return true;
}

/**
 * Product-tab chrome (⌘W / ⌘T / ⌘⇧T / ⌘⇧[ / ⌘⇧]) must run even when focus
 * is in an editor, the agent chat composer, or the terminal. Otherwise ⌘W
 * is left for the OS/menu and can close the window instead of a tab.
 *
 * Still yield while a blocking modal (compose, command palette, …) owns the UI.
 */
export function shouldHandleTabChromeShortcut(_event: KeyboardEvent): boolean {
  return !isBlockingModalOpen();
}
