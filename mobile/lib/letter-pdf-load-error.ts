import { ApiClientError } from "@backsteros/api-client";

/** Letter PDF bytes live on the Mac local-core — not in cloud sync. */
export const LOCAL_CORE_PDF_OFFLINE_MESSAGE =
  "Letter PDFs are stored on your Mac. They cannot be opened until your Mac's local-core is running and reachable.";

export const LOCAL_CORE_PDF_UPLOAD_OFFLINE_MESSAGE =
  "Letter PDFs are stored on your Mac. They cannot be uploaded until your Mac's local-core is running and reachable.";

export const LOCAL_CORE_PDF_DELETE_OFFLINE_MESSAGE =
  "Letter PDFs are stored on your Mac. They cannot be deleted until your Mac's local-core is running and reachable.";

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
 * Prefer local-core offline wording over generic failure when the API returns
 * 503 `pdf_requires_local_core` (cloud never holds .pdf bytes).
 */
export function letterPdfLoadErrorMessage(reason: unknown): string {
  if (isLocalCorePdfUnavailable(reason)) {
    return LOCAL_CORE_PDF_OFFLINE_MESSAGE;
  }
  if (reason instanceof Error) {
    return reason.message;
  }
  return "Could not load PDF.";
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

/** Same local-core detection for attachment delete failures. */
export function letterPdfDeleteErrorMessage(reason: unknown): string {
  if (isLocalCorePdfUnavailable(reason)) {
    return LOCAL_CORE_PDF_DELETE_OFFLINE_MESSAGE;
  }
  if (reason instanceof Error) {
    return reason.message;
  }
  return "Could not delete PDF.";
}
