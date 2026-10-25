"use client";

import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { WorkspaceIntegrationId } from "../../integrations/integration-catalog.js";
import { IntegrationMark } from "./integration-mark.js";
import {
  IntegrationSettingsModalChromeProvider,
  useIntegrationSettingsHeaderTrailingState,
} from "./integration-settings-modal-chrome.js";

export type IntegrationSettingsModalProps = {
  open: boolean;
  title: string;
  description?: string;
  integrationId?: WorkspaceIntegrationId | null;
  faviconHost?: string | null;
  onClose: () => void;
  /** Primary footer action. Defaults to closing the modal. */
  onSave?: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  saving?: boolean;
  children: ReactNode;
};

export function IntegrationSettingsModal({
  open,
  title,
  description,
  integrationId = null,
  faviconHost = null,
  onClose,
  onSave,
  saveLabel = "Save",
  saveDisabled = false,
  saving = false,
  children,
}: IntegrationSettingsModalProps) {
  const titleId = useId();
  const handleSave = onSave ?? onClose;
  const [headerTrailing, setHeaderTrailing] =
    useIntegrationSettingsHeaderTrailingState();

  useEffect(() => {
    if (!open) {
      setHeaderTrailing(null);
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose, open, setHeaderTrailing]);

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
          {integrationId && faviconHost ? (
            <IntegrationMark
              id={integrationId}
              faviconHost={faviconHost}
              size="md"
            />
          ) : null}
          <div className="integration-settings-modal__header-copy">
            <h2 id={titleId} className="integration-settings-modal__title">
              {title}
            </h2>
            <div className="integration-settings-modal__subtitle-row">
              {description ? (
                <p className="integration-settings-modal__description">
                  {description}
                </p>
              ) : (
                <span className="integration-settings-modal__description" />
              )}
              {headerTrailing ? (
                <div className="integration-settings-modal__header-trailing">
                  {headerTrailing}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="integration-settings-modal__body">
          <IntegrationSettingsModalChromeProvider
            onTrailingChange={setHeaderTrailing}
          >
            {children}
          </IntegrationSettingsModalChromeProvider>
        </div>
        <div className="integration-settings-modal__footer">
          <button
            type="button"
            className="entity-delete-modal-cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="integration-settings-modal__save"
            disabled={saveDisabled || saving}
            onClick={handleSave}
          >
            {saving ? "Saving…" : saveLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
