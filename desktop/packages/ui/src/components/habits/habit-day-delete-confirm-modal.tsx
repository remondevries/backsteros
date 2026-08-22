"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";

export function HabitDayDeleteConfirmModal({
  dueYmd,
  deleting = false,
  error = null,
  onConfirm,
  onCancel,
}: {
  dueYmd: string;
  deleting?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!deleting) onCancel();
        return;
      }
      if (event.key === "d" || event.key === "D") {
        if (deleting) return;
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onConfirm();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [deleting, onCancel, onConfirm]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="entity-delete-modal-root"
      data-blocking-modal=""
      data-entity-delete-modal=""
      data-habit-day-delete-modal=""
    >
      <button
        type="button"
        aria-label="Cancel delete"
        className="entity-delete-modal-backdrop"
        disabled={deleting}
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="entity-delete-modal"
      >
        <h2 id={titleId} className="entity-delete-modal-title">
          Delete habit day?
        </h2>
        <p className="entity-delete-modal-body">
          Remove the recorded result for {dueYmd}. This cannot be undone. Press{" "}
          <kbd className="entity-delete-modal-kbd">D</kbd> again to confirm, or{" "}
          <kbd className="entity-delete-modal-kbd">Esc</kbd> to cancel.
        </p>
        {error ? (
          <p className="entity-delete-modal-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="entity-delete-modal-actions">
          <button
            type="button"
            disabled={deleting}
            onClick={onCancel}
            className="entity-delete-modal-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={onConfirm}
            className="entity-delete-modal-confirm"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
