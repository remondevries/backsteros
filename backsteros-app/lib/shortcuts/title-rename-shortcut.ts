import { useEffect } from "react";

import { useLatestRef } from "@/hooks/use-latest-ref";
import { requestDocumentTreeFolderRename } from "@/lib/shortcuts/document-tree-folder-rename-shortcut";
import { getFocusedListKeyboardItemId } from "@/lib/shortcuts/focused-list-keyboard-item";
import { isBlockingModalOpen } from "@/lib/shortcuts/is-blocking-modal-open";

export function isTitleRenameShortcut(event: KeyboardEvent): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "r"
  );
}

export function focusAndSelectTitleInput(
  input: HTMLInputElement | null | undefined,
): void {
  if (!input) {
    return;
  }

  input.focus();
  input.select();
}

/**
 * BOS has no document tree UI yet, so there's no registered rename handler
 * and no folder-path nav id format to parse. This branch is a no-op until
 * the document tree lands — it always falls through to onRename.
 */
function tryHandleDocumentTreeFolderRenameShortcut(
  event: KeyboardEvent,
): boolean {
  const focusedItemId = getFocusedListKeyboardItemId();
  if (!focusedItemId) {
    return false;
  }

  if (!requestDocumentTreeFolderRename(focusedItemId)) {
    return false;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  return true;
}

export function useTitleRenameShortcut(onRename: () => void): void {
  const onRenameRef = useLatestRef(onRename);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isTitleRenameShortcut(event)) {
        return;
      }

      // Allow ⌘R while the body editor is open — only block for modals.
      if (isBlockingModalOpen()) {
        return;
      }

      if (tryHandleDocumentTreeFolderRenameShortcut(event)) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      onRenameRef.current();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onRenameRef]);
}
