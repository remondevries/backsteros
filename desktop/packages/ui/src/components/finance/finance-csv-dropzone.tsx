"use client";

import { CheckCircleFillIcon } from "@primer/octicons-react";
import { useCallback, useRef, useState } from "react";

export type FinanceCsvDropzoneProps = {
  file?: File | null;
  disabled?: boolean;
  uploading?: boolean;
  uploadProgress?: number | null;
  /** When true, the dropzone shows a finished/success state (check icon). */
  complete?: boolean;
  onFileSelect: (file: File | null) => void;
};

function isCsvFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type === "text/csv" ||
    file.type === "application/vnd.ms-excel" ||
    name.endsWith(".csv")
  );
}

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "";
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function FinanceCsvDropzone({
  file = null,
  disabled = false,
  uploading = false,
  uploadProgress = null,
  complete = false,
  onFileSelect,
}: FinanceCsvDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isUploading = uploading || uploadProgress != null;
  const hasRatio = uploadProgress != null && uploadProgress >= 0;
  const percent = hasRatio
    ? Math.min(100, Math.round(uploadProgress * 100))
    : null;
  const isProcessing =
    isUploading && (percent == null || percent >= 100);
  const locked = disabled || isUploading;

  const acceptFile = useCallback(
    (next: File | null) => {
      if (!next) {
        onFileSelect(null);
        return;
      }
      if (!isCsvFile(next)) return;
      onFileSelect(next);
    },
    [onFileSelect],
  );

  let ariaLabel = "Drop CSV or browse";
  if (complete) {
    ariaLabel = "CSV import finished";
  } else if (isProcessing) {
    ariaLabel = "Processing CSV import";
  } else if (isUploading) {
    ariaLabel =
      percent != null ? `Uploading CSV ${percent}%` : "Uploading CSV";
  } else if (file) {
    ariaLabel = `CSV selected: ${file.name}`;
  }

  return (
    <div className="letter-pdf-dropzone finance-csv-dropzone">
      <div
        role="button"
        tabIndex={locked ? -1 : 0}
        aria-disabled={locked}
        aria-busy={isUploading || undefined}
        aria-label={ariaLabel}
        className={[
          "letter-pdf-dropzone__surface",
          isDragging ? "letter-pdf-dropzone__surface--dragging" : null,
          locked ? "letter-pdf-dropzone__surface--disabled" : null,
          isUploading ? "finance-csv-dropzone__surface--busy" : null,
          complete ? "finance-csv-dropzone__surface--complete" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => {
          if (locked) return;
          inputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (locked) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!locked) setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!locked) setIsDragging(true);
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
          if (locked) return;
          acceptFile(event.dataTransfer.files?.[0] ?? null);
        }}
      >
        {complete ? (
          <div className="letter-pdf-dropzone__stack finance-csv-dropzone__complete">
            <span
              className="finance-csv-dropzone__check"
              aria-hidden="true"
            >
              <CheckCircleFillIcon size={28} />
            </span>
            <p className="letter-pdf-dropzone__title">Import finished</p>
            <p className="letter-pdf-dropzone__hint">
              Drop a new CSV to import another file
            </p>
          </div>
        ) : isUploading ? (
          <div className="letter-pdf-dropzone__stack finance-csv-dropzone__busy">
            <span
              className="finance-csv-dropzone__spinner"
              aria-hidden="true"
            />
            <p className="letter-pdf-dropzone__title">
              {isProcessing
                ? "Processing…"
                : percent != null
                  ? `Uploading ${percent}%`
                  : "Uploading…"}
            </p>
            {file ? (
              <p className="letter-pdf-dropzone__meta">{file.name}</p>
            ) : null}
            <p className="letter-pdf-dropzone__hint">
              {isProcessing
                ? "Parsing and importing transactions"
                : "Please wait while the file uploads"}
            </p>
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
              Drop a new CSV to replace
            </p>
          </>
        ) : (
          <>
            <p className="letter-pdf-dropzone__title">Drop bank CSV here</p>
            <p className="letter-pdf-dropzone__hint">
              ING NL or AMEX NL · or click to browse
            </p>
          </>
        )}
      </div>

      {file && !isUploading && !complete ? (
        <button
          type="button"
          className="letter-pdf-dropzone__remove"
          disabled={disabled}
          onClick={() => {
            onFileSelect(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
        >
          Remove CSV
        </button>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="letter-pdf-dropzone__input"
        disabled={locked}
        onChange={(event) => {
          acceptFile(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
    </div>
  );
}
