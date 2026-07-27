import { isGoLeaderSequencePending } from "./go-leader-sequence-gate.js";
import { shouldHandleGlobalShortcut } from "./shortcut-guards.js";

function isListKeyboardNavigationKey(key: string): boolean {
  return key === "j" || key === "k" || key === "ArrowDown" || key === "ArrowUp";
}

function listKeyboardNavDirection(key: string): "up" | "down" | null {
  if (key === "j" || key === "ArrowDown") {
    return "down";
  }
  if (key === "k" || key === "ArrowUp") {
    return "up";
  }
  return null;
}

export function isSearchableDropdownPanelOpen(): boolean {
  return document.querySelector("[data-searchable-dropdown-panel]") !== null;
}

function shouldHandleListKeyboardShortcut(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }

  if (!shouldHandleGlobalShortcut(event)) {
    return false;
  }

  if (isSearchableDropdownPanelOpen()) {
    return false;
  }

  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return true;
  }

  if (target.closest(".cm-editor")) {
    return false;
  }

  if (target.closest("[data-searchable-dropdown-panel]")) {
    return false;
  }

  if (target.closest(".command-dialog") || target.closest(".command-palette")) {
    return false;
  }

  if (target.closest("[data-compose-modal]")) {
    return false;
  }

  return true;
}

export function shouldHandleListKeyboardNavigation(
  event: KeyboardEvent,
): boolean {
  const key = event.key;
  if (!isListKeyboardNavigationKey(key)) {
    return false;
  }

  if ((key === "j" || key === "k") && isGoLeaderSequencePending()) {
    return false;
  }

  return shouldHandleListKeyboardShortcut(event);
}

export function isListKeyboardActivateKey(
  event: Pick<KeyboardEvent, "key" | "code" | "repeat">,
): boolean {
  if (event.repeat) {
    return false;
  }

  return (
    event.key === "Enter" ||
    event.key === " " ||
    event.key === "Spacebar" ||
    event.code === "Space"
  );
}

export function shouldHandleListKeyboardActivate(event: KeyboardEvent): boolean {
  if (!isListKeyboardActivateKey(event)) {
    return false;
  }

  return shouldHandleListKeyboardShortcut(event);
}

function isBoardHorizontalNavigationKey(key: string): boolean {
  return (
    key === "h" || key === "l" || key === "ArrowLeft" || key === "ArrowRight"
  );
}

/** Horizontal board direction for h/l/arrow keys; used by opt-in resolveNextItemId. */
export function boardKeyboardNavDirection(
  key: string,
): "left" | "right" | "up" | "down" | null {
  if (key === "h" || key === "ArrowLeft") return "left";
  if (key === "l" || key === "ArrowRight") return "right";
  return listKeyboardNavDirection(key);
}

export function shouldHandleBoardKeyboardNavigation(
  event: KeyboardEvent,
): boolean {
  const key = event.key;
  if (isBoardHorizontalNavigationKey(key)) {
    return shouldHandleListKeyboardShortcut(event);
  }

  return shouldHandleListKeyboardNavigation(event);
}

export { isListKeyboardNavigationKey, listKeyboardNavDirection };
