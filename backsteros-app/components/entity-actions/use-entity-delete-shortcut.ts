"use client";

import { useEffect } from "react";

import { useLatestRef } from "@/hooks/use-latest-ref";
import { resolveDocumentTreeDeleteConfig } from "@/lib/shortcuts/document-tree-delete-shortcut";
import { shouldBlockPageShortcuts } from "@/lib/shortcuts/is-blocking-modal-open";

import { useEntityHeaderActionsContext } from "./entity-header-actions-context";

function isPlainDeleteShortcut(event: KeyboardEvent): boolean {
  return (
    event.key.toLowerCase() === "d" &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
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

      if (isEditableTarget(event.target)) {
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

      if (shouldBlockPageShortcuts()) {
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
  }, [confirmDeleteRef, deleteConfigRef, deleteModalOpen, isDeletePending, openDeleteModal]);
}
