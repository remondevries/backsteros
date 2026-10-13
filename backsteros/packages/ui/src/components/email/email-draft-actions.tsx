"use client";

import { useRef } from "react";

import { useContentViewModeShortcut } from "../../content/use-content-view-mode-shortcut.js";
import { SegmentedPillToggle } from "../list-nav/list-board-view-shell.js";
import { TrashIcon } from "@primer/octicons-react";

export type EmailDraftBodyMode = "edit" | "preview";

export type EmailDraftActionsProps = {
  onSend?: () => void;
  onDelete?: () => void;
  sending?: boolean;
  deleting?: boolean;
  disabled?: boolean;
  bodyMode?: EmailDraftBodyMode;
  onBodyModeChange?: (mode: EmailDraftBodyMode) => void;
  savingBody?: boolean;
  /** Hide send/delete — show only the preview/edit toggle. */
  modeOnly?: boolean;
};

export function EmailDraftActions({
  onSend,
  onDelete,
  sending = false,
  deleting = false,
  disabled = false,
  bodyMode = "preview",
  onBodyModeChange,
  savingBody = false,
  modeOnly = false,
}: EmailDraftActionsProps) {
  const isEditMode = bodyMode === "edit";
  const showSendDelete = !modeOnly && onSend != null && onDelete != null;
  const sendDisabled = disabled || sending || deleting || savingBody || isEditMode;
  const deleteDisabled = disabled || sending || deleting || savingBody;

  return (
    <div className="email-draft-actions">
      {onBodyModeChange ? (
        <SegmentedPillToggle
          value={bodyMode}
          options={[
            { value: "preview", label: "Preview" },
            { value: "edit", label: "Edit" },
          ]}
          onChange={onBodyModeChange}
          disabled={disabled || savingBody}
          ariaLabel="Draft body view mode"
        />
      ) : null}
      {showSendDelete ? (
        <div
          className={`email-draft-actions__send-group${isEditMode ? " is-edit-mode" : ""}`}
        >
          <button
            type="button"
            className="email-draft-delete-btn"
            aria-label="Delete draft"
            title="Delete draft"
            onClick={onDelete}
            disabled={deleteDisabled}
            aria-disabled={deleteDisabled}
          >
            <TrashIcon size={14} />
          </button>
          <button
            type="button"
            className="email-draft-send-btn"
            onClick={onSend}
            disabled={sendDisabled}
            aria-disabled={sendDisabled}
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** ⌘/Ctrl+E toggles edit ↔ preview; ⌘/Ctrl+P forces preview. */
export function useEmailDraftBodyModeShortcuts({
  mode,
  onModeChange,
  enabled = true,
}: {
  mode: EmailDraftBodyMode;
  onModeChange: (mode: EmailDraftBodyMode) => void;
  enabled?: boolean;
}) {
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useContentViewModeShortcut({
    enabled,
    onToggle: () => {
      onModeChange(modeRef.current === "edit" ? "preview" : "edit");
    },
    onForcePreview: () => {
      onModeChange("preview");
    },
  });
}
