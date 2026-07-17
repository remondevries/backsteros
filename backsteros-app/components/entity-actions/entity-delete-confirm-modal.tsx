"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

import { useEntityHeaderActionsContext } from "./entity-header-actions-context";

export function EntityDeleteConfirmModal() {
  const {
    activeDeleteConfig,
    deleteModalOpen,
    closeDeleteModal,
    confirmDelete,
    isDeletePending,
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      data-blocking-modal=""
      data-entity-delete-modal=""
    >
      <button
        type="button"
        aria-label="Cancel delete"
        className="absolute inset-0 border-none bg-black/60 p-0"
        onClick={closeDeleteModal}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="entity-delete-modal-title"
        className="relative z-10 w-full max-w-md rounded-xl border border-white/10 bg-[#141414] p-5 shadow-2xl"
      >
        <h2
          id="entity-delete-modal-title"
          className="text-sm font-medium text-foreground/90"
        >
          Delete {activeDeleteConfig.entityLabel}?
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-foreground/50">
          This action cannot be undone. Press{" "}
          <kbd className="rounded border border-white/10 px-1 py-0.5 font-mono text-[10px] text-foreground/70">
            D
          </kbd>{" "}
          again to confirm, or{" "}
          <kbd className="rounded border border-white/10 px-1 py-0.5 font-mono text-[10px] text-foreground/70">
            Esc
          </kbd>{" "}
          to cancel.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={isDeletePending}
            onClick={closeDeleteModal}
            className="rounded-md px-3 py-1.5 text-xs text-foreground/60 transition-colors hover:bg-white/[0.06] hover:text-foreground/80 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDeletePending}
            onClick={confirmDelete}
            className="max-w-[16rem] rounded-md bg-red-500/15 px-3 py-1.5 text-left text-xs font-medium leading-snug text-red-400 transition-colors hover:bg-red-500/25 disabled:opacity-50"
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
