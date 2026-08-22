"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { PencilIcon, TrashIcon } from "@primer/octicons-react";

import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import {
  TaskCommentEditor,
  type TaskCommentEditorHandle,
} from "../tasks/task-comment-editor.js";

export type EmailThreadCommentBubbleProps = {
  body: string;
  author: "user" | "agent";
  timestamp?: string | number | Date | null;
  /** Display name for agent comments (thread assignee). */
  authorName?: string | null;
  /** Avatar for agent comments (thread assignee). */
  authorAvatarSrc?: string | null;
  /** Chat-style enter animation for newly appended comments. */
  entering?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
  onSaveEdit?: (body: string) => void | Promise<void>;
  deleting?: boolean;
  saving?: boolean;
};

function formatCommentTime(value: string | number | Date | null | undefined): string {
  if (value == null) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Chat-style comment on the email thread timeline.
 * Click the bubble to reveal floating edit/delete actions (Apple-style —
 * no layout shift). Pencil enters inline edit; trash soft-deletes.
 */
export function EmailThreadCommentBubble({
  body,
  author,
  timestamp = null,
  authorName = null,
  authorAvatarSrc = null,
  entering = false,
  selected = false,
  onSelect,
  onDelete,
  onSaveEdit,
  deleting = false,
  saving = false,
}: EmailThreadCommentBubbleProps) {
  const timeLabel = formatCommentTime(timestamp);
  const trimmed = body.trim();
  const isAgent = author === "agent";
  const displayName = isAgent
    ? authorName?.trim() || "Assignee"
    : "You";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(trimmed);
  const editorRef = useRef<TaskCommentEditorHandle | null>(null);

  useEffect(() => {
    if (!selected) setEditing(false);
  }, [selected]);

  useEffect(() => {
    if (!editing) {
      setDraft(trimmed);
      return;
    }
    const frame = requestAnimationFrame(() => {
      editorRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [editing, trimmed]);

  const handleBubbleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (editing) return;
      event.stopPropagation();
      onSelect?.();
    },
    [editing, onSelect],
  );

  const handleStartEdit = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (!onSaveEdit) return;
      setDraft(trimmed);
      setEditing(true);
    },
    [onSaveEdit, trimmed],
  );

  const handleCancelEdit = useCallback(() => {
    setDraft(trimmed);
    setEditing(false);
  }, [trimmed]);

  const handleSaveEdit = useCallback(async () => {
    const next = draft.trim();
    if (!onSaveEdit || !next || next === trimmed) {
      setEditing(false);
      return;
    }
    await onSaveEdit(next);
    setEditing(false);
  }, [draft, onSaveEdit, trimmed]);

  const handleEditKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleCancelEdit();
      }
    },
    [handleCancelEdit],
  );

  const showActions = selected && !editing && (onDelete != null || onSaveEdit != null);
  const busy = deleting || saving;

  return (
    <div
      className={`email-thread-comment-row${
        isAgent
          ? " email-thread-comment-row--agent"
          : " email-thread-comment-row--user"
      }${entering ? " email-thread-comment-row--enter" : ""}${
        selected ? " is-selected" : ""
      }${editing ? " is-editing" : ""}`}
      data-email-comment-bubble
    >
      <div className="email-thread-comment__author-row">
        {isAgent ? (
          <span className="email-thread-comment__avatar" aria-hidden="true">
            <EntityAvatarIcon
              src={authorAvatarSrc}
              size={18}
              kind="contact"
            />
          </span>
        ) : null}
        <span className="email-thread-comment__author">{displayName}</span>
      </div>
      <div className="email-thread-comment__bubble-shell">
        {showActions ? (
          <div
            className="email-thread-comment__actions"
            role="toolbar"
            aria-label="Comment actions"
            onClick={(event) => event.stopPropagation()}
          >
            {onSaveEdit ? (
              <button
                type="button"
                className="email-thread-comment__action email-thread-comment__action--edit"
                aria-label="Edit comment"
                title="Edit"
                onClick={handleStartEdit}
                disabled={busy}
              >
                <PencilIcon size={14} />
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className="email-thread-comment__action email-thread-comment__action--delete"
                aria-label="Delete comment"
                title="Delete"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
                disabled={busy}
              >
                <TrashIcon size={14} />
              </button>
            ) : null}
          </div>
        ) : null}
        <div
          className={`email-thread-comment${
            isAgent
              ? " email-thread-comment--agent"
              : " email-thread-comment--user"
          }`}
          role="button"
          tabIndex={0}
          aria-pressed={selected}
          onClick={handleBubbleClick}
          onKeyDown={(event) => {
            if (editing) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect?.();
            }
          }}
        >
          {editing ? (
            <div
              className="email-thread-comment__edit"
              onClick={(event) => event.stopPropagation()}
            >
              <TaskCommentEditor
                editorRef={editorRef}
                className="email-thread-comment__edit-input"
                variant="edit"
                value={draft}
                onChange={setDraft}
                onKeyDown={handleEditKeyDown}
                onSubmitShortcut={() => {
                  void handleSaveEdit();
                }}
                disabled={saving}
                autoFocus
                ariaLabel="Edit comment"
              />
              <div className="email-thread-comment__edit-actions">
                <button
                  type="button"
                  className="email-thread-comment__edit-cancel"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleCancelEdit();
                  }}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="email-thread-comment__edit-save"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleSaveEdit();
                  }}
                  disabled={saving || !draft.trim()}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="email-thread-comment__body">
              {trimmed || "…"}
            </div>
          )}
        </div>
      </div>
      {timeLabel ? (
        <time
          className="email-thread-comment__time"
          dateTime={
            timestamp instanceof Date
              ? timestamp.toISOString()
              : typeof timestamp === "string"
                ? timestamp
                : undefined
          }
        >
          {timeLabel}
        </time>
      ) : null}
    </div>
  );
}
