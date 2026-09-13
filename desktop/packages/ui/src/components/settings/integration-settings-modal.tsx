"use client";

import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type IntegrationSettingsModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
};

export function IntegrationSettingsModal({
  open,
  title,
  description,
  onClose,
  children,
}: IntegrationSettingsModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose, open]);

  if (!open) return null;

  return createPortal(
    <div
      className="entity-delete-modal-root"
      data-blocking-modal=""
      data-integration-settings-modal=""
    >
      <button
        type="button"
        aria-label="Close"
        className="entity-delete-modal-backdrop"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="entity-delete-modal integration-settings-modal"
      >
        <div className="integration-settings-modal__header">
          <div className="integration-settings-modal__header-copy">
            <h2 id={titleId} className="entity-delete-modal-title">
              {title}
            </h2>
            {description ? (
              <p className="entity-delete-modal-body">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="entity-delete-modal-cancel"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="integration-settings-modal__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
