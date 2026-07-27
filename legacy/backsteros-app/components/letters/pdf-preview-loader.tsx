"use client";

import { CircularProgress } from "@/components/ui/circular-progress";

type PdfPreviewLoaderProps = {
  label?: string;
  className?: string;
};

/**
 * Centered PDF preview loading state (spinner + label).
 */
export function PdfPreviewLoader({
  label = "Loading PDF…",
  className,
}: PdfPreviewLoaderProps) {
  return (
    <div
      className={["pdf-preview-loader", className].filter(Boolean).join(" ")}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <CircularProgress
        indeterminate
        size={28}
        strokeWidth={2.5}
        label={label}
      />
      <p className="pdf-preview-loader-label">{label}</p>
    </div>
  );
}
