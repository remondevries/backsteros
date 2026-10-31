"use client";

import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { LetterPdfViewer } from "./letter-pdf-viewer";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export function ChatPdfPageThumb({
  fileUrl,
  filename,
}: {
  fileUrl: string;
  filename: string;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(fileUrl);
        const next = await response.blob();
        if (!cancelled) setBlob(next);
      } catch {
        if (!cancelled) setBlob(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  if (!blob) {
    return <span className="chat-ui-file-card__glyph">PDF</span>;
  }

  return (
    <Document
      file={blob}
      loading={<span className="chat-ui-file-card__glyph">PDF</span>}
      error={<span className="chat-ui-file-card__glyph">PDF</span>}
    >
      <Page
        pageNumber={1}
        width={40}
        renderAnnotationLayer={false}
        renderTextLayer={false}
        className="chat-ui-file-card__pdf-thumb"
        aria-label={`${filename} preview`}
      />
    </Document>
  );
}

export function ChatPdfOverlay({
  fileUrl,
  filename,
  onClose,
}: {
  fileUrl: string;
  filename: string;
  onClose: () => void;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(fileUrl);
        const next = await response.blob();
        if (!cancelled) setBlob(next);
      } catch {
        if (!cancelled) setBlob(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="chat-ui-pdf-overlay" role="dialog" aria-modal="true">
      <div className="chat-ui-pdf-overlay__bar">
        <span>{filename}</span>
        <button
          type="button"
          className="chat-ui-pdf-overlay__close"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <div className="chat-ui-pdf-overlay__body">
        {blob ? <LetterPdfViewer file={blob} /> : null}
      </div>
    </div>
  );
}
