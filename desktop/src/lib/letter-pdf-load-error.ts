import { ApiClientError } from "@backsteros/api-client";

/** Shown when PDF bytes are Mac-only and local-core cannot serve them. */
export const LOCAL_CORE_PDF_OFFLINE_MESSAGE =
  "This Mac’s local-core is offline. Letter PDFs stay on this Mac and cannot be opened until local-core is running.";

export const LOCAL_CORE_PDF_UPLOAD_OFFLINE_MESSAGE =
  "This Mac’s local-core is offline. Letter PDFs stay on this Mac and cannot be uploaded until local-core is running.";

function isLocalCorePdfUnavailable(reason: unknown): boolean {
  if (reason instanceof ApiClientError) {
    if (
      reason.status === 503 &&
      (reason.code === "pdf_requires_local_core" ||
        /local-core|pdf_requires_local_core/i.test(reason.message))
    ) {
      return true;
    }
    if (reason.status === 0 || reason.status === 502 || reason.status === 504) {
      return true;
    }
  }

  if (reason instanceof TypeError) {
    return true;
  }

  if (reason instanceof Error) {
    const msg = reason.message.toLowerCase();
    if (
      msg.includes("failed to fetch") ||
      msg.includes("networkerror") ||
      msg.includes("load failed") ||
      msg.includes("econnrefused") ||
      msg.includes("connection refused")
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Map letter PDF download failures to UI copy.
 * Prefer "Mac / local-core offline" over "file missing" when the API is down
 * or returns 503 `pdf_requires_local_core` (cloud never holds .pdf bytes).
 */
export function letterPdfLoadErrorMessage(reason: unknown): string {
  if (isLocalCorePdfUnavailable(reason)) {
    return LOCAL_CORE_PDF_OFFLINE_MESSAGE;
  }
  if (reason instanceof Error) {
    return reason.message;
  }
  return "Could not load PDF";
}

/** Same local-core detection for upload failures. */
export function letterPdfUploadErrorMessage(reason: unknown): string {
  if (isLocalCorePdfUnavailable(reason)) {
    return LOCAL_CORE_PDF_UPLOAD_OFFLINE_MESSAGE;
  }
  if (reason instanceof Error) {
    return reason.message;
  }
  return "Could not upload PDF.";
}
