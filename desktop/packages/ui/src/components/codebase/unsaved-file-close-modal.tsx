import { useEffect, useId } from "react";
import { createPortal } from "react-dom";

export function UnsavedFileCloseModal({
  fileName,
  saving = false,
  error = null,
  onSave,
  onDiscard,
  onCancel,
}: {
  fileName: string;
  saving?: boolean;
  error?: string | null;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!saving) onCancel();
        return;
      }
      if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        event.stopPropagation();
        if (!saving) onSave();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onCancel, onSave, saving]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="entity-delete-modal-root"
      data-blocking-modal=""
      data-unsaved-file-close-modal=""
    >
      <button
        type="button"
        aria-label="Cancel"
        className="entity-delete-modal-backdrop"
        disabled={saving}
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="entity-delete-modal"
      >
        <h2 id={titleId} className="entity-delete-modal-title">
          Save changes to {fileName}?
        </h2>
        <p className="entity-delete-modal-body">
          This file has unsaved changes. Save before closing, discard them, or
          cancel to keep editing.
        </p>
        {error ? (
          <p className="entity-delete-modal-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="entity-delete-modal-actions console-unsaved-close-actions">
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="entity-delete-modal-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onDiscard}
            className="console-unsaved-close-discard"
          >
            Don&apos;t Save
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onSave}
            className="console-unsaved-close-save"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
