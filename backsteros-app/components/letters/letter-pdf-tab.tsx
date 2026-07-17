"use client";

import type { LetterAttachment } from "@backsteros/contracts";
import { PencilIcon } from "@primer/octicons-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { LetterPdfIcon } from "@/components/letters/letter-pdf-icon";
import { renameLetterAttachmentAction } from "@/lib/mutations/letters";

export function stripPdfExtension(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed) return "Document";
  return trimmed.replace(/\.pdf$/i, "") || "Document";
}

export function withPdfExtension(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Document.pdf";
  return /\.pdf$/i.test(trimmed) ? trimmed : `${trimmed}.pdf`;
}

type LetterPdfTabProps = {
  letterId: string;
  attachment: LetterAttachment;
  active: boolean;
  disabled?: boolean;
  shortcutHint?: string | null;
  onSelect: () => void;
  onRenamed?: () => void;
};

export function LetterPdfTab({
  letterId,
  attachment,
  active,
  disabled = false,
  shortcutHint = null,
  onSelect,
  onRenamed,
}: LetterPdfTabProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(
    stripPdfExtension(attachment.originalFilename),
  );
  const [saving, setSaving] = useState(false);
  const displayName = stripPdfExtension(attachment.originalFilename);
  const fullName = attachment.originalFilename?.trim() || "Document.pdf";

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
      return;
    }

    setSaving(true);
    const result = await renameLetterAttachmentAction({
      letterId,
      attachmentId: attachment.id,
      originalFilename: nextFilename,
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setEditing(false);
    onRenamed?.();
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
          <LetterPdfIcon size={14} />
        </span>
        <label className="sr-only" htmlFor={inputId}>
          Rename PDF
        </label>
        <input
          ref={inputRef}
          id={inputId}
          className="letter-pdf-tab-rename-input"
          value={draft}
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (!saving) void commitRename();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft(stripPdfExtension(attachment.originalFilename));
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
    >
      <button
        type="button"
        className="letter-pdf-tab-main"
        title={shortcutHint ? `${fullName} (${shortcutHint})` : fullName}
        disabled={disabled || saving}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <span className="letter-pdf-tab-icon" aria-hidden="true">
          <LetterPdfIcon size={14} />
        </span>
        <span className="letter-pdf-tab-label">{displayName}</span>
      </button>
      <button
        type="button"
        className="letter-pdf-tab-rename"
        aria-label={`Rename ${displayName}`}
        title="Rename"
        disabled={disabled || saving}
        onClick={(event) => {
          event.stopPropagation();
          setDraft(stripPdfExtension(attachment.originalFilename));
          setEditing(true);
        }}
      >
        <PencilIcon size={12} />
      </button>
    </div>
  );
}
