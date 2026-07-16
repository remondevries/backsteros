"use client";

import { useEffect, useState } from "react";

import { useAppApi } from "@/lib/api-context";

export function PdfPreview({ letterId }: { letterId: string }) {
  const { client } = useAppApi();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    const controller = new AbortController();
    client
      .downloadLetterPdf(letterId)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Could not load PDF");
        }
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [client, letterId]);

  if (error) return <div className="inline-error">{error}</div>;
  if (!url) return <div className="loading-block">Loading PDF…</div>;
  return <iframe className="pdf-preview" src={url} title="Letter PDF preview" />;
}
