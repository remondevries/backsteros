import {
  LETTER_PDF_ZOOM_IN_SHORTCUT_HINT,
  LETTER_PDF_ZOOM_OUT_SHORTCUT_HINT,
  useLetterPdfZoomShortcut,
} from "@backsteros/ui";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { useDesktopApi } from "../lib/api-context";
import "./letter-pdf-viewer.css";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const PDF_OPTIONS = {
  isEvalSupported: false,
  useSystemFonts: true,
  wasmUrl: "/",
} as const;

const PDF_FIT_MAX_WIDTH_PX = 720;
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

function PdfPreviewLoader({
  label = "Loading PDF…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={["pdf-preview-loader", className].filter(Boolean).join(" ")}
    >
      <p className="pdf-preview-loader-label">{label}</p>
    </div>
  );
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
        −
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
        +
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

/**
 * Fetches a letter PDF from the API when one is available.
 * Prefers attachment download when `attachmentId` is set.
 * Holds the blob in component state only — no session LRU (Tier D).
 */
export function LetterPdfPreview({
  letterId,
  attachmentId = null,
  useApi,
  revision = 0,
}: {
  letterId: string;
  attachmentId?: string | null;
  useApi: boolean;
  /** Bump after upload to force reload. */
  revision?: number;
}) {
  const { client } = useDesktopApi();
  const [pdf, setPdf] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setPdf(null);
    setError(null);

    void (async () => {
      try {
        if (!useApi) {
          if (!controller.signal.aborted) {
            setError("No PDF available");
          }
          return;
        }
        const blob = attachmentId
          ? await client.downloadLetterAttachment(letterId, attachmentId)
          : await client.downloadLetterPdf(letterId);
        if (controller.signal.aborted) return;
        setPdf(blob);
        setError(null);
      } catch (reason) {
        if (!controller.signal.aborted) {
          setPdf(null);
          setError(
            reason instanceof Error ? reason.message : "Could not load PDF",
          );
        }
      }
    })();

    return () => controller.abort();
  }, [attachmentId, client, letterId, revision, useApi]);

  if (error && !pdf) {
    return (
      <div className="pdf-preview-loader pdf-preview-loader--error" role="alert">
        <p className="pdf-preview-loader-label">{error}</p>
      </div>
    );
  }
  if (!pdf) {
    return <PdfPreviewLoader label="Loading preview…" />;
  }
  return <LetterPdfViewer file={pdf} />;
}
