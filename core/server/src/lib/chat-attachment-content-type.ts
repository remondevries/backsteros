/**
 * Chat attachment MIME sniffing + kind classification.
 * Images: JPEG/PNG/GIF/WebP only (no SVG — executable XML).
 * PDFs: `%PDF` magic. Everything else is a generic downloadable file.
 */
import {
  contentTypeFromFilename,
  extensionFromFilename,
} from "./task-attachment-content-type.js";
import { sniffTaskImageContentType } from "./task-image-content-type.js";

export const MAX_CHAT_ATTACHMENT_BYTES = 25_000_000;

export type ChatAttachmentKind = "image" | "pdf" | "file";

function sniffPdf(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

/** Block MIME types that must never render inline in the chat UI. */
const EXECUTABLE_OR_SCRIPT_MIME = new Set([
  "image/svg+xml",
  "text/html",
  "application/xhtml+xml",
  "application/javascript",
  "text/javascript",
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-executable",
  "application/x-mach-binary",
  "application/vnd.microsoft.portable-executable",
]);

export function resolveChatAttachmentContentType(
  declared: string | null | undefined,
  fileName: string,
  bytes: Uint8Array,
): { contentType: string; kind: ChatAttachmentKind } {
  const sniffedImage = sniffTaskImageContentType(bytes);
  if (sniffedImage) {
    return { contentType: sniffedImage, kind: "image" };
  }
  if (sniffPdf(bytes)) {
    return { contentType: "application/pdf", kind: "pdf" };
  }

  const header = (declared ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  const fromName = contentTypeFromFilename(fileName);
  let contentType =
    header &&
    header !== "application/octet-stream" &&
    header !== "binary/octet-stream"
      ? header
      : (fromName ?? "application/octet-stream");

  if (contentType === "image/jpg" || contentType === "image/pjpeg") {
    contentType = "image/jpeg";
  }

  // Never treat SVG / HTML / scripts as inline images.
  if (
    EXECUTABLE_OR_SCRIPT_MIME.has(contentType) ||
    contentType.startsWith("image/svg")
  ) {
    return { contentType, kind: "file" };
  }

  if (
    contentType === "application/pdf" ||
    extensionFromFilename(fileName) === "pdf"
  ) {
    return { contentType: "application/pdf", kind: "pdf" };
  }

  if (
    contentType === "image/jpeg" ||
    contentType === "image/png" ||
    contentType === "image/gif" ||
    contentType === "image/webp"
  ) {
    // Declared image without magic — still downloadable, not inline-rendered.
    return { contentType, kind: "file" };
  }

  return { contentType, kind: "file" };
}

export function chatAttachmentDownloadUrl(
  threadId: string,
  attachmentId: string,
): string {
  return `/api/v1/chat/threads/${encodeURIComponent(threadId)}/attachments/${encodeURIComponent(attachmentId)}`;
}
