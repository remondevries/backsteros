"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

import { useEntityHeaderActionsContext } from "./entity-header-actions-context.js";

export function EntityDuplicateConfirmModal() {
  const {
    activeDuplicateConfig,
    duplicateModalOpen,
    closeDuplicateModal,
    confirmDuplicate,
    isDuplicatePending,
    duplicateError,
  } = useEntityHeaderActionsContext();

  useEffect(() => {
    if (!duplicateModalOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDuplicateModal();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [closeDuplicateModal, duplicateModalOpen]);

  if (
    !duplicateModalOpen ||
    !activeDuplicateConfig ||
    activeDuplicateConfig.confirm !== "project"
  ) {
    return null;
  }

  const label = activeDuplicateConfig.entityLabel ?? "project";

  return createPortal(
    <div
      className="entity-delete-modal-root"
      data-blocking-modal=""
      data-entity-duplicate-modal=""
    >
      <button
        type="button"
        aria-label="Cancel duplicate"
        className="entity-delete-modal-backdrop"
        onClick={closeDuplicateModal}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="entity-duplicate-modal-title"
        className="entity-delete-modal"
      >
        <h2
          id="entity-duplicate-modal-title"
          className="entity-delete-modal-title"
        >
          Duplicate {label}?
        </h2>
        <p className="entity-delete-modal-body">
          Create a copy of this project. Choose a blank project, or also copy
          its tasks.
        </p>
        {duplicateError ? (
          <p className="entity-delete-modal-error" role="alert">
            {duplicateError}
          </p>
        ) : null}
        <div className="entity-delete-modal-actions entity-duplicate-modal-actions">
          <button
            type="button"
            disabled={isDuplicatePending}
            onClick={closeDuplicateModal}
            className="entity-delete-modal-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDuplicatePending}
            onClick={() => confirmDuplicate({ includeTasks: false })}
            className="entity-duplicate-modal-secondary"
          >
            {isDuplicatePending ? "Duplicating…" : "Blank project"}
          </button>
          <button
            type="button"
            disabled={isDuplicatePending}
            onClick={() => confirmDuplicate({ includeTasks: true })}
            className="entity-duplicate-modal-primary"
          >
            {isDuplicatePending ? "Duplicating…" : "Include tasks"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
