"use client";

import type { LetterAttachment } from "@backsteros/contracts";
import type { LetterPdfTabReorderBind } from "@backsteros/ui";
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
  draggableTab?: boolean;
  dragging?: boolean;
  insertBefore?: boolean;
  insertAfter?: boolean;
  reorderBind?: LetterPdfTabReorderBind;
  onSelect: () => void;
  onRenamed?: () => void;
};

export function LetterPdfTab({
  letterId,
  attachment,
  active,
  disabled = false,
  shortcutHint = null,
  draggableTab = false,
  dragging = false,
  insertBefore = false,
  insertAfter = false,
  reorderBind,
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
  const canDrag = draggableTab && !disabled && !saving && !editing;

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
        dragging ? "letter-pdf-tab--dragging" : null,
        insertBefore ? "letter-pdf-tab--insert-before" : null,
        insertAfter ? "letter-pdf-tab--insert-after" : null,
        canDrag ? "letter-pdf-tab--draggable" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      role="tab"
      aria-selected={active}
      aria-controls="letter-pdf-preview-panel"
      id={`letter-pdf-tab-${attachment.id}`}
      title={
        canDrag
          ? `${fullName} — drag to reorder`
          : shortcutHint
            ? `${fullName} (${shortcutHint})`
            : fullName
      }
      {...(canDrag && reorderBind ? reorderBind : {})}
    >
      <div
        className="letter-pdf-tab-main"
        role="button"
        tabIndex={disabled || saving ? -1 : 0}
        title={shortcutHint ? `${fullName} (${shortcutHint})` : fullName}
        aria-disabled={disabled || saving ? true : undefined}
        onClick={(event) => {
          event.stopPropagation();
          if (disabled || saving) return;
          onSelect();
        }}
        onKeyDown={(event) => {
          if (disabled || saving) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            onSelect();
          }
        }}
      >
        <span className="letter-pdf-tab-icon" aria-hidden="true">
          <LetterPdfIcon size={14} />
        </span>
        <span className="letter-pdf-tab-label">{displayName}</span>
      </div>
      <button
        type="button"
        className="letter-pdf-tab-rename"
        data-letter-pdf-tab-no-drag=""
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
