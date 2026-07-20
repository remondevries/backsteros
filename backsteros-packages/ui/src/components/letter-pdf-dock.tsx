"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { LETTER_PDF_ATTACHMENT_SHORTCUT_MAX } from "../letter-pdf-attachment-shortcut.js";
import { stripPdfExtension } from "../letter-pdf-filename.js";
import { LETTER_PDF_MAXIMIZE_SHORTCUT_HINT } from "../letter-pdf-maximize-shortcut.js";
import { LETTER_PDF_TOGGLE_SHORTCUT_HINT } from "../letter-pdf-toggle-shortcut.js";
import { useLetterPdfTabReorder } from "../use-letter-pdf-tab-reorder.js";
import { LetterIcon } from "./letter-icon.js";
import { LetterPdfDropzone } from "./letter-pdf-dropzone.js";
import {
  LetterPdfTab,
  type LetterPdfDeleteResult,
  type LetterPdfRenameResult,
  type LetterPdfTabAttachment,
} from "./letter-pdf-tab.js";
import { ResizableBottomPanel } from "./resizable-bottom-panel.js";

export const LETTER_PDF_PANEL_HEIGHT_KEY = "letter-pdf-panel-height";
export const LETTER_PDF_VISIBLE_KEY = "letter-pdf-preview-visible";

function PlusIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z"
      />
    </svg>
  );
}

function ChevronIcon({
  pointing,
  size = 14,
}: {
  pointing: "up" | "down";
  size?: number;
}) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d={
          pointing === "down"
            ? "M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
            : "M4.22 9.78a.75.75 0 0 0 1.06 0L8 7.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L8.53 5.47a.75.75 0 0 0-1.06 0L4.22 8.72a.75.75 0 0 0 0 1.06Z"
        }
      />
    </svg>
  );
}

function MaximizeIcon({
  minimized = false,
  size = 14,
}: {
  minimized?: boolean;
  size?: number;
}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {minimized ? (
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M3.22 3.22a.75.75 0 0 1 1.06 0l3.97 3.97V4.5a.75.75 0 0 1 1.5 0V9a.75.75 0 0 1-.75.75H4.5a.75.75 0 0 1 0-1.5h2.69L3.22 4.28a.75.75 0 0 1 0-1.06Zm17.56 0a.75.75 0 0 1 0 1.06l-3.97 3.97h2.69a.75.75 0 0 1 0 1.5H15a.75.75 0 0 1-.75-.75V4.5a.75.75 0 0 1 1.5 0v2.69l3.97-3.97a.75.75 0 0 1 1.06 0ZM3.75 15a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-2.69l-3.97 3.97a.75.75 0 0 1-1.06-1.06l3.97-3.97H4.5a.75.75 0 0 1-.75-.75Zm10.5 0a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-2.69l3.97 3.97a.75.75 0 1 1-1.06 1.06l-3.97-3.97v2.69a.75.75 0 0 1-1.5 0V15Z"
          clipRule="evenodd"
        />
      ) : (
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M15 3.75a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0V5.56l-3.97 3.97a.75.75 0 1 1-1.06-1.06l3.97-3.97h-2.69a.75.75 0 0 1-.75-.75Zm-12 0A.75.75 0 0 1 3.75 3h4.5a.75.75 0 0 1 0 1.5H5.56l3.97 3.97a.75.75 0 0 1-1.06 1.06L4.5 5.56v2.69a.75.75 0 0 1-1.5 0v-4.5Zm11.47 11.78a.75.75 0 1 1 1.06-1.06l3.97 3.97v-2.69a.75.75 0 0 1 1.5 0v4.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1 0-1.5h2.69l-3.97-3.97Zm-4.94-1.06a.75.75 0 0 1 0 1.06L5.56 19.5h2.69a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 1 1.5 0v2.69l3.97-3.97a.75.75 0 0 1 1.06 0Z"
          clipRule="evenodd"
        />
      )}
    </svg>
  );
}

export type LetterPdfDockProps = {
  /** @deprecated Prefer `legacyTitle` / attachment tabs. */
  title?: string;
  emptyMessage?: string;
  /** When false, show empty dropzone chrome only (no document tab). */
  hasDocument?: boolean;
  /** Optional host-owned PDF preview (bytes stay outside shared UI). */
  children?: ReactNode;
  /**
   * Legacy: immediate pick/upload. Prefer `onUploadFile` so + opens a dropzone.
   */
  onUploadClick?: () => void;
  /** When set, + replaces the viewer with a drag/drop zone and calls this. */
  onUploadFile?: (file: File) => void;
  onToggleMaximize?: () => void;
  maximized?: boolean;
  /** Controlled open state (matches Next LetterPdfSection). */
  pdfOpen?: boolean;
  onTogglePdf?: () => void;
  attachments?: readonly LetterPdfTabAttachment[];
  selectedAttachmentId?: string | null;
  onSelectAttachment?: (attachmentId: string) => void;
  onRenameAttachment?: (
    attachmentId: string,
    originalFilename: string,
  ) => Promise<LetterPdfRenameResult> | LetterPdfRenameResult;
  onAttachmentRenamed?: () => void;
  onDeleteAttachment?: (
    attachmentId: string,
  ) => Promise<LetterPdfDeleteResult> | LetterPdfDeleteResult;
  /** Persist a new tab order after drag-and-drop. */
  onReorderAttachments?: (
    orderedIds: string[],
  ) => void | Promise<void>;
  hasLegacyPdf?: boolean;
  legacyTitle?: string;
  uploading?: boolean;
  uploadProgress?: number | null;
};

/**
 * Presentational letter PDF dock — tab chrome matches web `LetterPdfSection`
 * (multi tabs / collapse / maximize / upload). Viewer bytes stay host-owned.
 */
export function LetterPdfDock({
  title = "Document.pdf",
  emptyMessage = "Drop a PDF here or upload an attachment.",
  hasDocument = true,
  children,
  onUploadClick,
  onUploadFile,
  onToggleMaximize,
  maximized = false,
  pdfOpen: pdfOpenProp,
  onTogglePdf,
  attachments = [],
  selectedAttachmentId = null,
  onSelectAttachment,
  onRenameAttachment,
  onAttachmentRenamed,
  onDeleteAttachment,
  onReorderAttachments,
  hasLegacyPdf = false,
  legacyTitle,
  uploading = false,
  uploadProgress = null,
}: LetterPdfDockProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(true);
  const [addingPdf, setAddingPdf] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const wasUploadingRef = useRef(false);
  const isControlled = pdfOpenProp !== undefined;
  const pdfOpen = isControlled ? Boolean(pdfOpenProp) : uncontrolledOpen;
  const canUseDropzone = Boolean(onUploadFile);
  const canReorder =
    Boolean(onReorderAttachments) && attachments.length > 1 && !uploading;
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
    onReorder: onReorderAttachments,
  });

  useEffect(() => {
    if (uploading) {
      wasUploadingRef.current = true;
      return;
    }
    if (wasUploadingRef.current) {
      wasUploadingRef.current = false;
      setPendingFile(null);
      setAddingPdf(false);
    }
  }, [uploading]);

  function togglePdf() {
    if (onTogglePdf) {
      onTogglePdf();
      return;
    }
    if (!isControlled) {
      setUncontrolledOpen((open) => !open);
    }
  }

  function openPdfPanel() {
    if (onTogglePdf && !pdfOpen) {
      onTogglePdf();
      return;
    }
    if (!isControlled) {
      setUncontrolledOpen(true);
    }
  }

  function selectAttachment(attachmentId: string) {
    if (consumeClickSuppression()) return;
    setAddingPdf(false);
    setPendingFile(null);
    if (onSelectAttachment) {
      onSelectAttachment(attachmentId);
      return;
    }
    if (!isControlled) {
      setUncontrolledOpen(true);
    }
  }

  function startAddPdf() {
    if (uploading) return;
    if (canUseDropzone) {
      setPendingFile(null);
      setAddingPdf(true);
      openPdfPanel();
      return;
    }
    onUploadClick?.();
  }

  function handleDropzoneFile(file: File | null) {
    if (!file) {
      setPendingFile(null);
      return;
    }
    setPendingFile(file);
    onUploadFile?.(file);
  }

  const legacyName = stripPdfExtension(
    (legacyTitle ?? title).trim() || "Document.pdf",
  );
  const showLegacyTab = attachments.length === 0 && hasLegacyPdf;
  const multiMode = attachments.length > 0 || hasLegacyPdf;
  const showUploadControl = Boolean(onUploadFile || onUploadClick);
  const showDropzone =
    canUseDropzone && (addingPdf || uploading || !hasDocument);

  const dropzone = (
    <LetterPdfDropzone
      file={pendingFile}
      uploading={uploading}
      uploadProgress={uploadProgress}
      onFileSelect={handleDropzoneFile}
    />
  );

  const previewBody = showDropzone ? (
    dropzone
  ) : children ? (
    <div className="letter-pdf-section-preview">{children}</div>
  ) : (
    <div className="letter-pdf-section-empty letter-pdf-section-empty--preview">
      <p>{emptyMessage}</p>
      {showUploadControl ? (
        <button
          type="button"
          className="letter-pdf-tab letter-pdf-tab--upload"
          onClick={startAddPdf}
        >
          Upload PDF
        </button>
      ) : null}
    </div>
  );

  if (!hasDocument && !multiMode) {
    return (
      <ResizableBottomPanel
        storageKey={LETTER_PDF_PANEL_HEIGHT_KEY}
        defaultHeight={280}
        minHeight={140}
        className="letter-pdf-section letter-pdf-section--empty"
      >
        {canUseDropzone ? (
          dropzone
        ) : (
          <div className="letter-pdf-section-empty">
            <p>{emptyMessage}</p>
            {showUploadControl ? (
              <button
                type="button"
                className="letter-pdf-tab letter-pdf-tab--upload"
                onClick={startAddPdf}
              >
                Upload PDF
              </button>
            ) : null}
          </div>
        )}
      </ResizableBottomPanel>
    );
  }

  return (
    <ResizableBottomPanel
      storageKey={LETTER_PDF_PANEL_HEIGHT_KEY}
      defaultHeight={280}
      minHeight={140}
      collapsed={!pdfOpen}
      collapsedHeight={46}
      className={[
        "letter-pdf-section",
        pdfOpen ? null : "letter-pdf-section--collapsed",
        maximized ? "letter-pdf-section--maximized" : null,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className="letter-pdf-tabs letter-pdf-tabs--row"
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
          onClick={togglePdf}
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
            const active =
              pdfOpen &&
              !addingPdf &&
              !uploading &&
              selectedAttachmentId === attachment.id;
            const shortcutHint =
              index < LETTER_PDF_ATTACHMENT_SHORTCUT_MAX
                ? String(index + 1)
                : null;
            const isLast = index === displayAttachments.length - 1;
            return (
              <LetterPdfTab
                key={attachment.id}
                attachment={attachment}
                active={active}
                disabled={uploading}
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
                onSelect={() => selectAttachment(attachment.id)}
                onRename={onRenameAttachment}
                onRenamed={onAttachmentRenamed}
                onDelete={onDeleteAttachment}
              />
            );
          })}

          {showLegacyTab ? (
            <button
              type="button"
              role="tab"
              aria-selected={pdfOpen && !addingPdf && !uploading}
              aria-controls="letter-pdf-preview-panel"
              id="letter-pdf-tab-legacy"
              className={[
                "letter-pdf-tab",
                "letter-pdf-tab--legacy",
                pdfOpen && !addingPdf && !uploading
                  ? "letter-pdf-tab--active"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
              title={`${legacyTitle ?? title} (1)`}
              disabled={uploading}
              onClick={(event) => {
                event.stopPropagation();
                selectAttachment("");
              }}
            >
              <span className="letter-pdf-tab-icon" aria-hidden="true">
                <LetterIcon size={14} />
              </span>
              <span className="letter-pdf-tab-label">{legacyName}</span>
            </button>
          ) : null}

          {!multiMode ? (
            <button
              type="button"
              role="tab"
              aria-selected={pdfOpen && !addingPdf && !uploading}
              className={[
                "letter-pdf-tab",
                "letter-pdf-tab--legacy",
                pdfOpen && !addingPdf && !uploading
                  ? "letter-pdf-tab--active"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
              title={title}
              onClick={(event) => {
                event.stopPropagation();
                selectAttachment("");
              }}
            >
              <span className="letter-pdf-tab-icon" aria-hidden="true">
                <LetterIcon size={14} />
              </span>
              <span className="letter-pdf-tab-label">{legacyName}</span>
            </button>
          ) : null}

          {showUploadControl ? (
            <button
              type="button"
              data-letter-pdf-tab-end-zone=""
              className={[
                "letter-pdf-tab",
                "letter-pdf-tab--upload-icon",
                addingPdf || uploading ? "letter-pdf-tab--active" : null,
                draggingId && insertBeforeId === null
                  ? "letter-pdf-tab--insert-before"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
              title="Upload PDF"
              aria-label="Upload PDF"
              aria-pressed={addingPdf || uploading}
              disabled={uploading}
              onClick={(event) => {
                event.stopPropagation();
                startAddPdf();
              }}
            >
              <PlusIcon size={14} />
            </button>
          ) : null}
        </div>

        <div className="letter-pdf-tabs-end">
          {onToggleMaximize ? (
            <button
              type="button"
              className="letter-pdf-tab letter-pdf-tab--maximize"
              aria-pressed={maximized}
              title={
                maximized
                  ? `Show notes (${LETTER_PDF_MAXIMIZE_SHORTCUT_HINT})`
                  : `Expand PDF (${LETTER_PDF_MAXIMIZE_SHORTCUT_HINT})`
              }
              aria-label={
                maximized
                  ? `Restore notes and shrink PDF (${LETTER_PDF_MAXIMIZE_SHORTCUT_HINT})`
                  : `Expand PDF over notes (${LETTER_PDF_MAXIMIZE_SHORTCUT_HINT})`
              }
              onClick={(event) => {
                event.stopPropagation();
                onToggleMaximize();
              }}
            >
              <MaximizeIcon size={14} minimized={maximized} />
            </button>
          ) : null}
          <span
            className="letter-pdf-tab letter-pdf-tab--collapse"
            aria-hidden="true"
          >
            {pdfOpen ? (
              <ChevronIcon pointing="down" />
            ) : (
              <ChevronIcon pointing="up" />
            )}
          </span>
        </div>
      </div>

      {pdfOpen ? (
        <div id="letter-pdf-preview-panel" className="letter-pdf-preview-panel">
          {previewBody}
        </div>
      ) : null}
    </ResizableBottomPanel>
  );
}
