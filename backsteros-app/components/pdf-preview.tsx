"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { PdfPreviewLoader } from "@/components/letters/pdf-preview-loader";
import { useAppApi } from "@/lib/api-context";

const LetterPdfViewer = dynamic(
  () =>
    import("@/components/letters/letter-pdf-viewer").then(
      (module) => module.LetterPdfViewer,
    ),
  {
    ssr: false,
    loading: () => (
      <PdfPreviewLoader label="Loading preview…" className="!h-full min-h-0 flex-1" />
    ),
  },
);

export function PdfPreview({
  letterId,
  attachmentId,
  className,
}: {
  letterId: string;
  attachmentId?: string | null;
  className?: string;
}) {
  const { client } = useAppApi();
  const [pdf, setPdf] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setPdf(null);
    setError(null);
    const load = attachmentId
      ? client.downloadLetterAttachment(letterId, attachmentId)
      : client.downloadLetterPdf(letterId);
    load
      .then((blob) => {
        if (controller.signal.aborted) return;
        setPdf(blob);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Could not load PDF");
        }
      });
    return () => {
      controller.abort();
    };
  }, [attachmentId, client, letterId]);

  if (error) {
    return (
      <div
        className={["pdf-preview-loader pdf-preview-loader--error", className]
          .filter(Boolean)
          .join(" ")}
        role="alert"
      >
        <p className="pdf-preview-loader-label">{error}</p>
      </div>
    );
  }
  if (!pdf) return <PdfPreviewLoader className={className} />;
  return <LetterPdfViewer file={pdf} className={className} />;
}
