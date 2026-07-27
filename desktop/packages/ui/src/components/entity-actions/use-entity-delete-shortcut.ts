"use client";

import { useEffect } from "react";

import { resolveDocumentTreeDeleteConfig } from "../../document-tree-delete-shortcut.js";
import { shouldHandleGlobalShortcut } from "../../shortcut-guards.js";

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

export function useEntityDeleteShortcut() {
  const {
    deleteConfig,
    deleteModalOpen,
    openDeleteModal,
    confirmDelete,
    isDeletePending,
  } = useEntityHeaderActionsContext();
  const deleteConfigRef = useLatestRef(deleteConfig);
  const confirmDeleteRef = useLatestRef(confirmDelete);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const treeDeleteConfig = resolveDocumentTreeDeleteConfig();
      const effectiveDeleteConfig =
        treeDeleteConfig ?? deleteConfigRef.current;

      if (!effectiveDeleteConfig || isDeletePending) {
        return;
      }

      if (deleteModalOpen) {
        if (isPlainDeleteShortcut(event)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          confirmDeleteRef.current();
        }
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
    confirmDeleteRef,
    deleteConfigRef,
    deleteModalOpen,
    isDeletePending,
    openDeleteModal,
  ]);
}
