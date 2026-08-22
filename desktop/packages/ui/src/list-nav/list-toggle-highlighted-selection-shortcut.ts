import {
  isBlockingModalOpen,
  isEditableShortcutTarget,
  shouldHandleGlobalShortcut,
} from "../shortcuts/shortcut-guards.js";
import { isSearchableDropdownMenuOpen } from "./list-clear-selection-shortcut.js";
import { isAnyLeaderSequencePending } from "../shortcuts/leader-sequence-gate.js";

/**
 * Shift+Space — toggle the checkbox of the keyboard-highlighted list row
 * (transactions; same idea as clicking the row checkbox).
 */
export function isToggleHighlightedSelectionShortcut(
  event: Pick<
    KeyboardEvent,
    "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat"
  >,
): boolean {
  if (event.repeat) return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (!event.shiftKey) return false;
  return (
    event.key === " " ||
    event.key === "Spacebar" ||
    event.code === "Space"
  );
}

export function shouldHandleToggleHighlightedSelectionShortcut(
  event: KeyboardEvent,
  enabled: boolean,
): boolean {
  if (!enabled) return false;
  if (!isToggleHighlightedSelectionShortcut(event)) return false;
  if (isAnyLeaderSequencePending()) return false;
  if (isBlockingModalOpen()) return false;
  if (isSearchableDropdownMenuOpen()) return false;
  if (!shouldHandleGlobalShortcut(event)) return false;
  if (isEditableShortcutTarget(event.target)) return false;
  if (
    typeof document !== "undefined" &&
    isEditableShortcutTarget(document.activeElement)
  ) {
    return false;
  }
  return true;
}
