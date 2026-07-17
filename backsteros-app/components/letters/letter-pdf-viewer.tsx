"use client";

import { ZoomInIcon, ZoomOutIcon } from "@primer/octicons-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import { PdfPreviewLoader } from "@/components/letters/pdf-preview-loader";
import { DOCUMENT_CONTENT_MAX_WIDTH } from "@/lib/documents/content-layout";
import "@/lib/pdf/pdfjs-client-setup";
import { pdfJsWasmUrl, pdfJsWorkerSrc } from "@/lib/pdf/pdfjs-client-setup";
import {
  LETTER_PDF_ZOOM_IN_SHORTCUT_HINT,
  LETTER_PDF_ZOOM_OUT_SHORTCUT_HINT,
  useLetterPdfZoomShortcut,
} from "@/lib/shortcuts/letter-pdf-zoom-shortcut";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfJsWorkerSrc;
}

const PDF_OPTIONS = {
  isEvalSupported: false,
  useSystemFonts: true,
  wasmUrl: pdfJsWasmUrl,
} as const;

/** Match the notes editor column (`DOCUMENT_CONTENT_MAX_WIDTH`) at 100% zoom. */
const PDF_FIT_MAX_WIDTH_PX = Number.parseInt(DOCUMENT_CONTENT_MAX_WIDTH, 10);

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;
const ZOOM_DEFAULT = 1;

function clampZoom(value: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));
}

function fitWidthForContainer(containerWidth: number) {
  return Math.max(120, Math.min(containerWidth, PDF_FIT_MAX_WIDTH_PX));
}

function LazyPage({
  pageNumber,
  width,
  scrollRoot,
}: {
  pageNumber: number;
  width: number;
  scrollRoot: RefObject<HTMLDivElement | null>;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(pageNumber === 1);
  useEffect(() => {
    if (visible || !slot.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVisible(true);
      },
      { root: scrollRoot.current, rootMargin: "600px 0px" },
    );
    observer.observe(slot.current);
    return () => observer.disconnect();
  }, [scrollRoot, visible]);
  return (
    <div
      ref={slot}
      className="document-pdf-viewer-page-slot"
      style={{ minHeight: visible ? undefined : Math.round(width * 1.414) }}
    >
      {visible ? (
        <Page
          pageNumber={pageNumber}
          width={width}
          className="document-pdf-viewer-page"
          loading={
            <PdfPreviewLoader
              label="Loading page…"
              className="pdf-preview-loader--page"
            />
          }
        />
      ) : null}
    </div>
  );
}

function PdfPages({ file, zoom }: { file: Blob; zoom: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(0);
  const [fitWidth, setFitWidth] = useState(PDF_FIT_MAX_WIDTH_PX);
  const width = Math.max(120, Math.round(fitWidth * zoom));

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const resize = () => setFitWidth(fitWidthForContainer(element.clientWidth));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="document-pdf-viewer">
      <Document
        file={file}
        options={PDF_OPTIONS}
        loading={<PdfPreviewLoader />}
        error={
          <div
            className="pdf-preview-loader pdf-preview-loader--error"
            role="alert"
          >
            <p className="pdf-preview-loader-label">Could not render PDF.</p>
          </div>
        }
        onLoadSuccess={({ numPages }) => setPages(numPages)}
      >
        {Array.from({ length: pages }, (_, index) => (
          <LazyPage
            key={index}
            pageNumber={index + 1}
            width={width}
            scrollRoot={containerRef}
          />
        ))}
      </Document>
    </div>
  );
}

function PdfViewerControls({
  zoom,
  onZoomIn,
  onZoomOut,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="document-pdf-viewer-controls">
      <button
        type="button"
        className="document-pdf-viewer-control-button"
        onClick={onZoomOut}
        disabled={zoom <= ZOOM_MIN}
        aria-label={`Zoom out (${LETTER_PDF_ZOOM_OUT_SHORTCUT_HINT})`}
        title={`Zoom out (${LETTER_PDF_ZOOM_OUT_SHORTCUT_HINT})`}
      >
        <ZoomOutIcon size={14} />
      </button>
      <span className="document-pdf-viewer-zoom-label" aria-live="polite">
        {zoomPercent}%
      </span>
      <button
        type="button"
        className="document-pdf-viewer-control-button"
        onClick={onZoomIn}
        disabled={zoom >= ZOOM_MAX}
        aria-label={`Zoom in (${LETTER_PDF_ZOOM_IN_SHORTCUT_HINT})`}
        title={`Zoom in (${LETTER_PDF_ZOOM_IN_SHORTCUT_HINT})`}
      >
        <ZoomInIcon size={14} />
      </button>
    </div>
  );
}

export function LetterPdfViewer({
  file,
  className,
}: {
  file: Blob;
  className?: string;
}) {
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);

  function zoomIn() {
    setZoom((current) => clampZoom(current + ZOOM_STEP));
  }

  function zoomOut() {
    setZoom((current) => clampZoom(current - ZOOM_STEP));
  }

  useLetterPdfZoomShortcut({
    onZoomIn: zoomIn,
    onZoomOut: zoomOut,
  });

  return (
    <div className={`document-pdf-viewer-shell ${className ?? ""}`}>
      <PdfPages file={file} zoom={zoom} />
      <PdfViewerControls
        zoom={zoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
      />
    </div>
  );
}
