"use client";

import { useEffect } from "react";

import { requestDocumentTreeFolderRename } from "./document-tree-folder-rename-shortcut.js";
import { getFocusedListKeyboardItemId } from "./focused-list-keyboard-item.js";
import { isBlockingModalOpen } from "./shortcut-guards.js";
import { useLatestRef } from "./use-latest-ref.js";

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

/** When a folder row is keyboard-focused, ⌘R renames the folder instead of the entity title. */
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

export function useTitleRenameShortcut(
  onRename: () => void,
  { enabled = true }: { enabled?: boolean } = {},
): void {
  const onRenameRef = useLatestRef(onRename);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!isTitleRenameShortcut(event)) {
        return;
      }

      // Allow ⌘R while the body editor is open — only block for modals.
      // (shouldBlockPageShortcuts also treats content edit mode as blocking.)
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
  }, [enabled, onRenameRef]);
}
