/** Guess a MIME type from a filename extension for task file attachments. */
const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  heic: "image/heic",
  heif: "image/heif",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  html: "text/html",
  htm: "text/html",
  json: "application/json",
  xml: "application/xml",
  eml: "message/rfc822",
  msg: "application/vnd.ms-outlook",
  ics: "text/calendar",
  zip: "application/zip",
  gz: "application/gzip",
  tar: "application/x-tar",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  rtf: "application/rtf",
  pages: "application/vnd.apple.pages",
  numbers: "application/vnd.apple.numbers",
  key: "application/vnd.apple.keynote",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

export function extensionFromFilename(fileName: string): string {
  const base = fileName.trim().split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function contentTypeFromFilename(fileName: string): string | null {
  const ext = extensionFromFilename(fileName);
  if (!ext) return null;
  return EXTENSION_CONTENT_TYPES[ext] ?? null;
}

/**
 * Resolve stored Content-Type for a task attachment upload.
 * Prefer a concrete request Content-Type; otherwise guess from filename.
 */
export function resolveTaskAttachmentContentType(
  contentTypeHeader: string | null | undefined,
  fileName: string,
): string {
  const header = (contentTypeHeader ?? "")
    .split(";")[0]
    ?.trim()
    .toLowerCase();
  if (
    header &&
    header !== "application/octet-stream" &&
    header !== "binary/octet-stream"
  ) {
    return header;
  }
  return contentTypeFromFilename(fileName) ?? "application/octet-stream";
}
