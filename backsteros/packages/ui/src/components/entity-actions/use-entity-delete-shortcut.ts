"use client";

import { useEffect } from "react";

import { resolveDocumentTreeDeleteConfig } from "../../documents/document-tree-delete-shortcut.js";
import { shouldHandleGlobalShortcut } from "../../shortcuts/shortcut-guards.js";

import { useEntityHeaderActionsContext } from "./entity-header-actions-context.js";
import { useLatestRef } from "./use-latest-ref.js";

function isPlainDeleteShortcut(event: KeyboardEvent): boolean {
  return (
    event.key.toLowerCase() === "d" &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey
  );
}

function isDeleteConfirmShortcut(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return false;
  }
  return (
    isPlainDeleteShortcut(event) ||
    event.key === "Enter" ||
    event.code === "Enter" ||
    event.code === "NumpadEnter"
  );
}

function isPlainSecondaryShortcut(
  event: KeyboardEvent,
  shortcutKey: string | null | undefined,
): boolean {
  const expected = shortcutKey?.trim().toLowerCase();
  if (!expected) return false;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return false;
  }
  return event.key.toLowerCase() === expected;
}

export function useEntityDeleteShortcut() {
  const {
    deleteConfig,
    activeDeleteConfig,
    deleteModalOpen,
    openDeleteModal,
    confirmDelete,
    confirmDeleteSecondary,
    isDeletePending,
  } = useEntityHeaderActionsContext();
  const deleteConfigRef = useLatestRef(deleteConfig);
  const activeDeleteConfigRef = useLatestRef(activeDeleteConfig);
  const confirmDeleteRef = useLatestRef(confirmDelete);
  const confirmDeleteSecondaryRef = useLatestRef(confirmDeleteSecondary);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Modal confirm must not require a registered deleteConfig — drafts open
      // the modal with an override config only (EmailDraftActions), so
      // deleteConfig stays null while modalDeleteConfig holds the action.
      if (deleteModalOpen) {
        if (isDeletePending) return;
        const secondaryKey =
          activeDeleteConfigRef.current?.secondaryAction?.shortcutKey;
        if (isPlainSecondaryShortcut(event, secondaryKey)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          confirmDeleteSecondaryRef.current();
          return;
        }
        if (!isDeleteConfirmShortcut(event)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        confirmDeleteRef.current();
        return;
      }

      const treeDeleteConfig = resolveDocumentTreeDeleteConfig();
      const effectiveDeleteConfig =
        treeDeleteConfig ?? deleteConfigRef.current;

      if (!effectiveDeleteConfig || isDeletePending) {
        return;
      }

      if (!shouldHandleGlobalShortcut(event)) {
        return;
      }

      if (!isPlainDeleteShortcut(event)) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      openDeleteModal();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    activeDeleteConfigRef,
    confirmDeleteRef,
    confirmDeleteSecondaryRef,
    deleteConfigRef,
    deleteModalOpen,
    isDeletePending,
    openDeleteModal,
  ]);
}
