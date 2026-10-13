"use client";

import { useCallback, useRef, useState } from "react";

export type LetterPdfDropzoneProps = {
  file?: File | null;
  disabled?: boolean;
  uploading?: boolean;
  /** 0–1 byte progress; null = indeterminate while uploading. */
  uploadProgress?: number | null;
  onFileSelect: (file: File | null) => void;
};

function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "";
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Compact PDF drop / browse zone for letter compose and add-attachment mode.
 */
export function LetterPdfDropzone({
  file = null,
  disabled = false,
  uploading = false,
  uploadProgress = null,
  onFileSelect,
}: LetterPdfDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isUploading = uploading || uploadProgress != null;
  const hasRatio = uploadProgress != null && uploadProgress > 0;
  const percent = hasRatio ? Math.round(uploadProgress * 100) : null;

  const acceptFile = useCallback(
    (next: File | null) => {
      if (!next) {
        onFileSelect(null);
        return;
      }
      if (!isPdfFile(next)) {
        return;
      }
      onFileSelect(next);
    },
    [onFileSelect],
  );

  return (
    <div className="letter-pdf-dropzone">
      <div
        role="button"
        tabIndex={disabled || isUploading ? -1 : 0}
        aria-disabled={disabled || isUploading}
        aria-busy={isUploading || undefined}
        aria-label={
          isUploading
            ? percent != null
              ? `Uploading PDF ${percent}%`
              : "Uploading PDF"
            : file
              ? `PDF selected: ${file.name}`
              : "Drop PDF or browse"
        }
        className={[
          "letter-pdf-dropzone__surface",
          isDragging ? "letter-pdf-dropzone__surface--dragging" : null,
          disabled || isUploading
            ? "letter-pdf-dropzone__surface--disabled"
            : null,
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => {
          if (disabled || isUploading) return;
          inputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (disabled || isUploading) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!disabled && !isUploading) setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!disabled && !isUploading) setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsDragging(false);
          if (disabled || isUploading) return;
          const dropped = event.dataTransfer.files?.[0] ?? null;
          acceptFile(dropped);
        }}
      >
        {isUploading ? (
          <div className="letter-pdf-dropzone__stack">
            <p className="letter-pdf-dropzone__title">
              {percent != null ? `Uploading ${percent}%` : "Uploading…"}
            </p>
            {file ? (
              <p className="letter-pdf-dropzone__meta">{file.name}</p>
            ) : null}
          </div>
        ) : file ? (
          <>
            <p className="letter-pdf-dropzone__title">{file.name}</p>
            {file.size > 0 ? (
              <p className="letter-pdf-dropzone__meta">
                {formatFileSize(file.size)}
              </p>
            ) : null}
            <p className="letter-pdf-dropzone__hint">
              Drop a new PDF to replace
            </p>
          </>
        ) : (
          <>
            <p className="letter-pdf-dropzone__title">Drop PDF here</p>
            <p className="letter-pdf-dropzone__hint">or click to browse</p>
          </>
        )}
      </div>

      {file && !isUploading ? (
        <button
          type="button"
          className="letter-pdf-dropzone__remove"
          disabled={disabled}
          onClick={() => {
            onFileSelect(null);
            if (inputRef.current) {
              inputRef.current.value = "";
            }
          }}
        >
          Remove PDF
        </button>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="letter-pdf-dropzone__input"
        disabled={disabled || isUploading}
        onChange={(event) => {
          acceptFile(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
    </div>
  );
}
