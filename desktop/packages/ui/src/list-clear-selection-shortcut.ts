import {
  isBlockingModalOpen,
  isEditableShortcutTarget,
} from "./shortcut-guards.js";

/** True while a SearchableDropdown menu panel (or expanded trigger) is open. */
export function isSearchableDropdownMenuOpen(): boolean {
  if (typeof document === "undefined") return false;
  if (document.querySelector("[data-searchable-dropdown-panel]")) {
    return true;
  }
  return (
    document.querySelector(
      '[data-searchable-dropdown-root] [aria-expanded="true"]',
    ) !== null
  );
}

/**
 * Escape — clear multi-select on list rows (tasks, transactions).
 * Yields to modals, open dropdowns, and editable fields.
 */
export function shouldHandleClearSelectionShortcut(
  event: KeyboardEvent,
  enabled: boolean,
): boolean {
  if (!enabled) return false;
  if (event.key !== "Escape" || event.repeat) return false;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return false;
  }
  if (isBlockingModalOpen()) return false;
  if (isSearchableDropdownMenuOpen()) return false;
  if (isEditableShortcutTarget(event.target)) return false;
  if (
    typeof document !== "undefined" &&
    isEditableShortcutTarget(document.activeElement)
  ) {
    return false;
  }
  return true;
}
