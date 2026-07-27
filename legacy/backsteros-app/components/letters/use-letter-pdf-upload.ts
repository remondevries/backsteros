"use client";

import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { uploadLetterPdfAction } from "@/lib/mutations/letters";

/**
 * Letter PDF upload with immediate progress UI.
 * Shows the circular indicator on the same frame as file selection,
 * then yields a paint before the network request starts.
 */
export function useLetterPdfUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const inFlightRef = useRef(false);

  const reset = useCallback(() => {
    inFlightRef.current = false;
    setUploading(false);
    setProgress(null);
    setFile(null);
  }, []);

  const upload = useCallback(
    async (letterId: string, nextFile: File) => {
      if (inFlightRef.current) {
        return { ok: false as const, error: "Upload already in progress." };
      }
      inFlightRef.current = true;

      flushSync(() => {
        setFile(nextFile);
        setUploading(true);
        setProgress(null);
      });

      // Let the progress ring paint before the PUT starts (local uploads can
      // finish in the same turn otherwise).
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });

      try {
        return await uploadLetterPdfAction({
          letterId,
          file: nextFile,
          onProgress: setProgress,
        });
      } finally {
        reset();
      }
    },
    [reset],
  );

  return {
    uploading,
    progress,
    file,
    upload,
    setProgress,
    reset,
  };
}
