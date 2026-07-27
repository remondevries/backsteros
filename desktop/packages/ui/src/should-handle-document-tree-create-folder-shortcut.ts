import { isKnowledgeSectionPath } from "./entity-routes.js";
import { isGoLeaderSequencePending } from "./go-leader-sequence-gate.js";
import { isNativeDatePickerOpen } from "./native-date-picker.js";
import { isSearchableDropdownPanelOpen } from "./should-handle-list-keyboard-navigation.js";
import {
  isBlockingModalOpen,
  shouldHandleGlobalShortcut,
} from "./shortcut-guards.js";

export const DOCUMENT_TREE_CREATE_FOLDER_SHORTCUT_HINT = "⇧C";

/** Project documents section (standalone or org-scoped). */
export function isProjectDocumentsSectionPath(pathname: string): boolean {
  return (
    /^\/projects\/[^/]+\/documents(?:\/|$)/.test(pathname) ||
    /^\/organizations\/[^/]+\/projects\/[^/]+\/documents(?:\/|$)/.test(pathname)
  );
}

export function isDocumentLibrarySectionPath(pathname: string): boolean {
  return (
    isKnowledgeSectionPath(pathname) || isProjectDocumentsSectionPath(pathname)
  );
}

export function isDocumentTreeCreateFolderShortcutKey(
  event: Pick<KeyboardEvent, "key" | "code">,
): boolean {
  return (
    (event.key.length === 1 && event.key.toLowerCase() === "c") ||
    event.code === "KeyC"
  );
}

export function hasDocumentTreeCreateFolderShortcutModifiers(
  event: KeyboardEvent,
): boolean {
  return (
    event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey
  );
}

export function shouldHandleDocumentTreeCreateFolderShortcut(
  event: KeyboardEvent,
  pathname: string,
): boolean {
  return (
    isDocumentTreeCreateFolderShortcutKey(event) &&
    hasDocumentTreeCreateFolderShortcutModifiers(event) &&
    isDocumentLibrarySectionPath(pathname) &&
    !isGoLeaderSequencePending() &&
    shouldHandleGlobalShortcut(event) &&
    !isSearchableDropdownPanelOpen() &&
    !isNativeDatePickerOpen() &&
    !isBlockingModalOpen()
  );
}
