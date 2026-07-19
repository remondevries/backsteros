"use client";

import { PencilIcon, XIcon } from "@primer/octicons-react";
import { useEffect, useId, useRef, useState } from "react";

import {
  stripPdfExtension,
  withPdfExtension,
} from "../letter-pdf-filename.js";
import { LetterIcon } from "./letter-icon.js";

export type LetterPdfTabAttachment = {
  id: string;
  originalFilename: string;
};

export type LetterPdfRenameResult =
  | { ok: true }
  | { ok: false; error: string };

export type LetterPdfDeleteResult =
  | { ok: true }
  | { ok: false; error: string };

type LetterPdfTabProps = {
  attachment: LetterPdfTabAttachment;
  active: boolean;
  disabled?: boolean;
  shortcutHint?: string | null;
  onSelect: () => void;
  onRename?: (
    attachmentId: string,
    originalFilename: string,
  ) => Promise<LetterPdfRenameResult> | LetterPdfRenameResult;
  onRenamed?: () => void;
  onDelete?: (
    attachmentId: string,
  ) => Promise<LetterPdfDeleteResult> | LetterPdfDeleteResult;
};

export function LetterPdfTab({
  attachment,
  active,
  disabled = false,
  shortcutHint = null,
  onSelect,
  onRename,
  onRenamed,
  onDelete,
}: LetterPdfTabProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(
    stripPdfExtension(attachment.originalFilename),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const displayName = stripPdfExtension(attachment.originalFilename);
  const fullName = attachment.originalFilename?.trim() || "Document.pdf";
  const busy = saving || deleting;

  useEffect(() => {
    if (!editing) {
      setDraft(stripPdfExtension(attachment.originalFilename));
    }
  }, [attachment.originalFilename, editing]);

  useEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [editing]);

  async function commitRename() {
    const nextFilename = withPdfExtension(draft);
    const currentFilename = withPdfExtension(
      attachment.originalFilename || "Document",
    );
    if (nextFilename === currentFilename) {
      setEditing(false);
      setError(null);
      return;
    }

    if (!onRename) {
      setEditing(false);
      return;
    }

    setSaving(true);
    setError(null);
    const result = await onRename(attachment.id, nextFilename);
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setEditing(false);
    onRenamed?.();
  }

  async function commitDelete() {
    if (!onDelete || deleting) return;
    setDeleting(true);
    setError(null);
    const result = await onDelete(attachment.id);
    setDeleting(false);
    if (!result.ok) {
      setError(result.error);
    }
  }

  if (editing) {
    return (
      <form
        className={[
          "letter-pdf-tab",
          "letter-pdf-tab--editing",
          active ? "letter-pdf-tab--active" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        onSubmit={(event) => {
          event.preventDefault();
          void commitRename();
        }}
      >
        <span className="letter-pdf-tab-icon" aria-hidden="true">
          <LetterIcon size={14} />
        </span>
        <label className="sr-only" htmlFor={inputId}>
          Rename PDF
        </label>
        <input
          ref={inputRef}
          id={inputId}
          className="letter-pdf-tab-rename-input"
          value={draft}
          disabled={busy}
          aria-invalid={error ? true : undefined}
          title={error ?? undefined}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (!busy) void commitRename();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft(stripPdfExtension(attachment.originalFilename));
              setError(null);
              setEditing(false);
            }
          }}
        />
      </form>
    );
  }

  return (
    <div
      className={[
        "letter-pdf-tab",
        active ? "letter-pdf-tab--active" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      role="tab"
      aria-selected={active}
      aria-controls="letter-pdf-preview-panel"
      id={`letter-pdf-tab-${attachment.id}`}
      title={error ?? undefined}
    >
      <button
        type="button"
        className="letter-pdf-tab-main"
        title={shortcutHint ? `${fullName} (${shortcutHint})` : fullName}
        disabled={disabled || busy}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <span className="letter-pdf-tab-icon" aria-hidden="true">
          <LetterIcon size={14} />
        </span>
        <span className="letter-pdf-tab-label">{displayName}</span>
      </button>
      <span className="letter-pdf-tab-actions">
        {onRename ? (
          <button
            type="button"
            className="letter-pdf-tab-rename"
            aria-label={`Rename ${displayName}`}
            title="Rename"
            disabled={disabled || busy}
            onClick={(event) => {
              event.stopPropagation();
              setDraft(stripPdfExtension(attachment.originalFilename));
              setError(null);
              setEditing(true);
            }}
          >
            <PencilIcon size={12} />
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            className="letter-pdf-tab-delete"
            aria-label={`Delete ${displayName}`}
            title="Delete"
            disabled={disabled || busy}
            onClick={(event) => {
              event.stopPropagation();
              void commitDelete();
            }}
          >
            <XIcon size={12} />
          </button>
        ) : null}
      </span>
    </div>
  );
}
