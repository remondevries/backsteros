import { isProjectDocumentsSectionPath } from "@/lib/document-navigation-path";
import { isGoLeaderSequencePending } from "@/lib/shortcuts/go-leader-sequence-gate";
import { isBlockingModalOpen } from "@/lib/shortcuts/is-blocking-modal-open";
import { isKnowledgeSectionPath } from "@/lib/knowledge/navigation-path";
import { isNativeDatePickerOpen } from "@/lib/native-date-picker";
import { isSearchableDropdownPanelOpen } from "@/lib/shortcuts/should-handle-list-keyboard-navigation";
import { shouldHandleGlobalShortcut } from "@/lib/shortcuts/should-handle-global-shortcut";

export const DOCUMENT_TREE_CREATE_FOLDER_SHORTCUT_HINT = "⇧C";

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
    event.shiftKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey
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
