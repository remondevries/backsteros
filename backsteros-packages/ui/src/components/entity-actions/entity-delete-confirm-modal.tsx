"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

import { useEntityHeaderActionsContext } from "./entity-header-actions-context.js";

export function EntityDeleteConfirmModal() {
  const {
    activeDeleteConfig,
    deleteModalOpen,
    closeDeleteModal,
    confirmDelete,
    isDeletePending,
    deleteError,
  } = useEntityHeaderActionsContext();

  useEffect(() => {
    if (!deleteModalOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDeleteModal();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [closeDeleteModal, deleteModalOpen]);

  if (!deleteModalOpen || !activeDeleteConfig) {
    return null;
  }

  return createPortal(
    <div
      className="entity-delete-modal-root"
      data-blocking-modal=""
      data-entity-delete-modal=""
    >
      <button
        type="button"
        aria-label="Cancel delete"
        className="entity-delete-modal-backdrop"
        onClick={closeDeleteModal}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="entity-delete-modal-title"
        className="entity-delete-modal"
      >
        <h2
          id="entity-delete-modal-title"
          className="entity-delete-modal-title"
        >
          Delete {activeDeleteConfig.entityLabel}?
        </h2>
        <p className="entity-delete-modal-body">
          This action cannot be undone. Press{" "}
          <kbd className="entity-delete-modal-kbd">D</kbd> again to confirm, or{" "}
          <kbd className="entity-delete-modal-kbd">Esc</kbd> to cancel.
        </p>
        {deleteError ? (
          <p className="entity-delete-modal-error" role="alert">
            {deleteError}
          </p>
        ) : null}
        <div className="entity-delete-modal-actions">
          <button
            type="button"
            disabled={isDeletePending}
            onClick={closeDeleteModal}
            className="entity-delete-modal-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDeletePending}
            onClick={confirmDelete}
            className="entity-delete-modal-confirm"
          >
            {isDeletePending
              ? "Deleting…"
              : (activeDeleteConfig.confirmLabel ?? "Delete")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
