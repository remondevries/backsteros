import { isContentEditModeActive } from "./content-view-mode.js";

export const BLOCKING_MODAL_SELECTORS = [
  "[data-blocking-modal]",
  "[data-compose-modal]",
  "[data-entity-delete-modal]",
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

/** Page-level shortcuts should not run while editing content or a modal is open. */
export function shouldBlockPageShortcuts(): boolean {
  return isContentEditModeActive() || isBlockingModalOpen();
}

export function shouldHandleGlobalShortcut(event: KeyboardEvent): boolean {
  if (isBlockingModalOpen() && !isTargetInsideBlockingModal(event.target)) {
    return false;
  }

  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return true;
  }

  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return false;
  }

  if (target.isContentEditable) {
    return false;
  }

  if (target.closest(".cm-editor") || target.closest("[role='textbox']")) {
    return false;
  }

  // xterm focuses a helper textarea; also guard the host so j/k cannot steal
  // keys while the user is typing in a terminal.
  if (
    target.closest(".xterm") ||
    target.classList.contains("xterm-helper-textarea")
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
