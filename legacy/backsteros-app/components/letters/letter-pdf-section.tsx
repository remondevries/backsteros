"use client";

import type { LetterAttachment } from "@backsteros/contracts";
import { useLetterPdfTabReorder } from "@backsteros/ui";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
} from "@primer/octicons-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { Letter } from "@/lib/db/schema";
import { CircularProgress } from "@/components/ui/circular-progress";
import { PdfPreview } from "@/components/pdf-preview";
import { LETTER_PDF_ATTACHMENT_SHORTCUT_MAX } from "@/lib/shortcuts/letter-pdf-attachment-shortcut";
import { LETTER_PDF_MAXIMIZE_SHORTCUT_HINT } from "@/lib/shortcuts/letter-pdf-maximize-shortcut";
import { LETTER_PDF_TOGGLE_SHORTCUT_HINT } from "@/lib/shortcuts/letter-pdf-toggle-shortcut";
import { reorderLetterAttachmentsAction } from "@/lib/mutations/letters";

import { LetterPdfDropzone } from "./letter-pdf-dropzone";
import { LetterPdfIcon } from "./letter-pdf-icon";
import { LetterPdfMaximizeIcon } from "./letter-pdf-maximize-icon";
import { LetterPdfTab, stripPdfExtension } from "./letter-pdf-tab";
import { useLetterPdfUpload } from "./use-letter-pdf-upload";

type LetterPdfSectionProps = {
  letter: Letter;
  attachments: LetterAttachment[];
  selectedAttachmentId: string | null;
  pdfOpen: boolean;
  pdfMaximized?: boolean;
  onSelectAttachment: (attachmentId: string) => void;
  onTogglePdf: () => void;
  onToggleMaximize?: () => void;
  onSaved?: () => void;
};

export function LetterPdfSection({
  letter,
  attachments: attachmentsProp,
  selectedAttachmentId,
  pdfOpen,
  pdfMaximized = false,
  onSelectAttachment,
  onTogglePdf,
  onToggleMaximize,
  onSaved,
}: LetterPdfSectionProps) {
  const pdfUpload = useLetterPdfUpload();
  const [attachments, setAttachments] = useState(attachmentsProp);
  const hasPdf = attachments.length > 0 || Boolean(letter.storageKey);
  const hasRatio = pdfUpload.progress != null && pdfUpload.progress > 0;
  const percent = hasRatio ? Math.round((pdfUpload.progress ?? 0) * 100) : null;
  const legacyName = stripPdfExtension(
    letter.originalFilename?.trim() || "Document.pdf",
  );
  const canReorder = attachments.length > 1 && !pdfUpload.uploading;

  useEffect(() => {
    setAttachments(attachmentsProp);
  }, [attachmentsProp]);

  const {
    displayAttachments,
    draggingId,
    insertBeforeId,
    isDragging,
    bindTab,
    consumeClickSuppression,
  } = useLetterPdfTabReorder({
    attachments,
    enabled: canReorder,
    onReorder: async (orderedIds) => {
      const byId = new Map(attachments.map((entry) => [entry.id, entry]));
      const optimistic = orderedIds
        .map((id) => byId.get(id))
        .filter((entry): entry is LetterAttachment => Boolean(entry));
      const previous = attachments;
      setAttachments(optimistic);

      const result = await reorderLetterAttachmentsAction({
        letterId: letter.id,
        orderedIds,
      });
      if (!result.ok) {
        setAttachments(previous);
        toast.error(result.error);
        return;
      }
      setAttachments(result.attachments);
      onSaved?.();
    },
  });

  async function uploadPdf(file: File) {
    const result = await pdfUpload.upload(letter.id, file);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.attachmentId) {
      onSelectAttachment(result.attachmentId);
    } else {
      onSelectAttachment("");
    }
    onSaved?.();
  }

  if (!hasPdf) {
    return (
      <div className="letter-pdf-section letter-pdf-section--empty flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-2">
        <LetterPdfDropzone
          file={pdfUpload.file}
          uploading={pdfUpload.uploading}
          uploadProgress={pdfUpload.progress}
          onFileSelect={(file) => {
            if (!file) return;
            void uploadPdf(file);
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={[
        "letter-pdf-section flex min-h-0 flex-1 flex-col overflow-hidden",
        pdfOpen ? null : "letter-pdf-section--collapsed",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className="letter-pdf-tabs letter-pdf-tabs--row shrink-0"
        role="tablist"
        aria-label="Letter PDFs"
      >
        <button
          type="button"
          className="letter-pdf-tabs-toggle-hitbox"
          aria-expanded={pdfOpen}
          aria-controls="letter-pdf-preview-panel"
          title={
            pdfOpen
              ? `Hide PDF (${LETTER_PDF_TOGGLE_SHORTCUT_HINT})`
              : `Show PDF (${LETTER_PDF_TOGGLE_SHORTCUT_HINT})`
          }
          aria-label={
            pdfOpen
              ? `Hide PDF viewer (${LETTER_PDF_TOGGLE_SHORTCUT_HINT})`
              : `Show PDF viewer (${LETTER_PDF_TOGGLE_SHORTCUT_HINT})`
          }
          onClick={onTogglePdf}
        />

        <div
          className={[
            "letter-pdf-tabs-start",
            isDragging ? "letter-pdf-tabs-start--reordering" : null,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {displayAttachments.map((attachment, index) => {
            const active = pdfOpen && selectedAttachmentId === attachment.id;
            const shortcutHint =
              index < LETTER_PDF_ATTACHMENT_SHORTCUT_MAX
                ? String(index + 1)
                : null;
            const isLast = index === displayAttachments.length - 1;
            return (
              <LetterPdfTab
                key={attachment.id}
                letterId={letter.id}
                attachment={attachment}
                active={active}
                disabled={pdfUpload.uploading}
                shortcutHint={shortcutHint}
                draggableTab={canReorder}
                dragging={draggingId === attachment.id}
                insertBefore={
                  Boolean(draggingId) &&
                  insertBeforeId === attachment.id &&
                  draggingId !== attachment.id
                }
                insertAfter={
                  Boolean(draggingId) &&
                  insertBeforeId === null &&
                  isLast &&
                  draggingId !== attachment.id
                }
                reorderBind={bindTab(attachment.id)}
                onSelect={() => {
                  if (consumeClickSuppression()) return;
                  onSelectAttachment(attachment.id);
                }}
                onRenamed={onSaved}
              />
            );
          })}

          {attachments.length === 0 && letter.storageKey ? (
            <button
              type="button"
              role="tab"
              aria-selected={pdfOpen}
              aria-controls="letter-pdf-preview-panel"
              id="letter-pdf-tab-legacy"
              className={[
                "letter-pdf-tab",
                "letter-pdf-tab--legacy",
                pdfOpen ? "letter-pdf-tab--active" : null,
              ]
                .filter(Boolean)
                .join(" ")}
              title={`${letter.originalFilename || "Document.pdf"} (1)`}
              disabled={pdfUpload.uploading}
              onClick={(event) => {
                event.stopPropagation();
                onSelectAttachment("");
              }}
            >
              <span className="letter-pdf-tab-icon" aria-hidden="true">
                <LetterPdfIcon size={14} />
              </span>
              <span className="letter-pdf-tab-label">{legacyName}</span>
            </button>
          ) : null}

          {pdfUpload.uploading ? (
            <div
              className="letter-pdf-tab letter-pdf-tab--upload-icon letter-pdf-tab--uploading"
              aria-busy="true"
              title={
                percent != null ? `Uploading ${percent}%` : "Uploading…"
              }
            >
              <CircularProgress
                value={pdfUpload.progress ?? 0}
                indeterminate={!hasRatio}
                size={14}
                strokeWidth={2.25}
              />
            </div>
          ) : (
            <label
              data-letter-pdf-tab-end-zone=""
              className={[
                "letter-pdf-tab",
                "letter-pdf-tab--upload-icon",
                draggingId && insertBeforeId === null
                  ? "letter-pdf-tab--insert-before"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
              title="Upload PDF"
              onClick={(event) => event.stopPropagation()}
            >
              <span className="sr-only">Upload PDF</span>
              <PlusIcon size={14} />
              <input
                type="file"
                accept="application/pdf"
                className="sr-only"
                disabled={pdfUpload.uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  void uploadPdf(file);
                }}
              />
            </label>
          )}
        </div>

        <div className="letter-pdf-tabs-end">
          {onToggleMaximize ? (
            <button
              type="button"
              className="letter-pdf-tab letter-pdf-tab--maximize"
              aria-pressed={pdfMaximized}
              title={
                pdfMaximized
                  ? `Show notes (${LETTER_PDF_MAXIMIZE_SHORTCUT_HINT})`
                  : `Expand PDF (${LETTER_PDF_MAXIMIZE_SHORTCUT_HINT})`
              }
              aria-label={
                pdfMaximized
                  ? `Restore notes and shrink PDF (${LETTER_PDF_MAXIMIZE_SHORTCUT_HINT})`
                  : `Expand PDF over notes (${LETTER_PDF_MAXIMIZE_SHORTCUT_HINT})`
              }
              onClick={(event) => {
                event.stopPropagation();
                onToggleMaximize();
              }}
            >
              <LetterPdfMaximizeIcon size={14} minimized={pdfMaximized} />
            </button>
          ) : null}
          <span
            className="letter-pdf-tab letter-pdf-tab--collapse"
            aria-hidden="true"
          >
            {pdfOpen ? (
              <ChevronDownIcon size={14} />
            ) : (
              <ChevronUpIcon size={14} />
            )}
          </span>
        </div>
      </div>

      {pdfOpen ? (
        <div
          id="letter-pdf-preview-panel"
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <PdfPreview
            letterId={letter.id}
            attachmentId={selectedAttachmentId}
            className="!h-full min-h-0 flex-1"
          />
        </div>
      ) : null}
    </div>
  );
}
