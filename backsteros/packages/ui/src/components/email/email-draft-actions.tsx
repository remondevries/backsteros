"use client";

import { useCallback, useEffect, useRef } from "react";

import { useContentViewModeShortcut } from "../../content/use-content-view-mode-shortcut.js";
import { shouldHandleGlobalShortcut } from "../../shortcuts/shortcut-guards.js";
import { SegmentedPillToggle } from "../list-nav/list-board-view-shell.js";
import { useEntityHeaderActionsContextOptional } from "../entity-actions/entity-header-actions-context.js";
import { TrashIcon } from "@primer/octicons-react";

export type EmailDraftBodyMode = "edit" | "preview";

export type EmailDraftActionsProps = {
  onSend?: () => void;
  /** Edit mode primary action — replaces Send. */
  onSaveDraft?: () => void;
  onDelete?: () => void;
  sending?: boolean;
  savingDraft?: boolean;
  deleting?: boolean;
  disabled?: boolean;
  bodyMode?: EmailDraftBodyMode;
  onBodyModeChange?: (mode: EmailDraftBodyMode) => void;
  savingBody?: boolean;
  /** Hide send/save/delete — show only the preview/edit toggle. */
  modeOnly?: boolean;
  /**
   * When false, skip registering ⌘E / ⌘Enter / D (e.g. parent already owns
   * mode shortcuts for a keep-alive surface). Defaults to true.
   */
  shortcutsEnabled?: boolean;
  /** Label used in the delete confirm modal. */
  deleteEntityLabel?: string;
};

function isPlainDeleteShortcut(event: KeyboardEvent): boolean {
  return (
    event.key.toLowerCase() === "d" &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey
  );
}

function isPrimaryShortcut(event: KeyboardEvent): boolean {
  return (
    event.key === "Enter" &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}

export function EmailDraftActions({
  onSend,
  onSaveDraft,
  onDelete,
  sending = false,
  savingDraft = false,
  deleting = false,
  disabled = false,
  bodyMode = "preview",
  onBodyModeChange,
  savingBody = false,
  modeOnly = false,
  shortcutsEnabled = true,
  deleteEntityLabel = "this draft",
}: EmailDraftActionsProps) {
  const isEditMode = bodyMode === "edit";
  const showSave = isEditMode && onSaveDraft != null;
  const showSend = !isEditMode && onSend != null;
  const showDelete = onDelete != null;
  const showPrimaryActions =
    !modeOnly && (showSave || showSend || showDelete);
  const busy = disabled || sending || deleting || savingBody || savingDraft;
  const sendDisabled = busy || onSend == null;
  const saveDisabled = busy || onSaveDraft == null;
  const deleteDisabled = busy;
  const entityActions = useEntityHeaderActionsContextOptional();

  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;
  const onSaveDraftRef = useRef(onSaveDraft);
  onSaveDraftRef.current = onSaveDraft;
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  const bodyModeRef = useRef(bodyMode);
  bodyModeRef.current = bodyMode;
  const sendDisabledRef = useRef(sendDisabled);
  sendDisabledRef.current = sendDisabled;
  const saveDisabledRef = useRef(saveDisabled);
  saveDisabledRef.current = saveDisabled;
  const deleteDisabledRef = useRef(deleteDisabled);
  deleteDisabledRef.current = deleteDisabled;
  const deleteEntityLabelRef = useRef(deleteEntityLabel);
  deleteEntityLabelRef.current = deleteEntityLabel;
  const openDeleteModalRef = useRef(entityActions?.openDeleteModal);
  openDeleteModalRef.current = entityActions?.openDeleteModal;
  const deleteModalOpenRef = useRef(entityActions?.deleteModalOpen ?? false);
  deleteModalOpenRef.current = entityActions?.deleteModalOpen ?? false;

  const requestDelete = useCallback(() => {
    const deleteHandler = onDeleteRef.current;
    if (!deleteHandler || deleteDisabledRef.current) return;

    const openDeleteModal = openDeleteModalRef.current;
    if (openDeleteModal) {
      openDeleteModal({
        entityLabel: deleteEntityLabelRef.current,
        confirmLabel: "Delete",
        actionVerb: "Delete",
        onDelete: async () => {
          try {
            await Promise.resolve(deleteHandler());
            return { ok: true as const };
          } catch (error) {
            return {
              ok: false as const,
              error:
                error instanceof Error
                  ? error.message
                  : "Could not delete draft.",
            };
          }
        },
      });
      return;
    }
    deleteHandler();
  }, []);

  useEmailDraftBodyModeShortcuts({
    mode: bodyMode,
    onModeChange: (mode) => {
      onBodyModeChange?.(mode);
    },
    enabled:
      shortcutsEnabled &&
      Boolean(onBodyModeChange) &&
      !disabled &&
      !savingBody &&
      !savingDraft,
  });

  // Preview: ⌘Enter sends. Edit: ⌘Enter saves draft. D opens delete confirm.
  useEffect(() => {
    if (!shortcutsEnabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (isPrimaryShortcut(event)) {
        if (event.defaultPrevented) return;
        if (bodyModeRef.current === "edit") {
          if (saveDisabledRef.current || !onSaveDraftRef.current) return;
          event.preventDefault();
          event.stopPropagation();
          onSaveDraftRef.current();
          return;
        }
        if (sendDisabledRef.current || !onSendRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        onSendRef.current();
        return;
      }

      if (!isPlainDeleteShortcut(event)) return;
      if (bodyModeRef.current !== "preview" && bodyModeRef.current !== "edit") {
        return;
      }
      if (deleteDisabledRef.current || !onDeleteRef.current) return;
      if (deleteModalOpenRef.current) return;
      if (!shouldHandleGlobalShortcut(event)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      requestDelete();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [requestDelete, shortcutsEnabled]);

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
          disabled={disabled || savingBody || savingDraft}
          ariaLabel="Draft body view mode"
        />
      ) : null}
      {showPrimaryActions ? (
        <div className="email-draft-actions__send-group">
          {showDelete ? (
            <button
              type="button"
              className="email-draft-delete-btn"
              aria-label="Delete draft"
              title="Delete draft (D)"
              onClick={requestDelete}
              disabled={deleteDisabled}
              aria-disabled={deleteDisabled}
            >
              <TrashIcon size={14} />
            </button>
          ) : null}
          {showSave ? (
            <button
              type="button"
              className="email-draft-send-btn"
              onClick={onSaveDraft}
              disabled={saveDisabled}
              aria-disabled={saveDisabled}
              title="Save draft (⌘Enter)"
            >
              {savingDraft || savingBody ? "Saving…" : "Save draft"}
            </button>
          ) : null}
          {showSend ? (
            <button
              type="button"
              className="email-draft-send-btn"
              onClick={onSend}
              disabled={sendDisabled}
              aria-disabled={sendDisabled}
              title="Send (⌘Enter)"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          ) : null}
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
