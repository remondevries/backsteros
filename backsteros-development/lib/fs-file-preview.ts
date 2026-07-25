const RASTER_IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "ico",
  "avif",
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
  svg: "image/svg+xml",
};

export type FilePreviewKind = "svg" | "image" | "text";

export function fileExtension(filePath: string): string {
  const name = filePath.split("/").pop()?.toLowerCase() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1);
}

export function filePreviewKind(filePath: string): FilePreviewKind {
  const ext = fileExtension(filePath);
  if (ext === "svg") return "svg";
  if (RASTER_IMAGE_EXTENSIONS.has(ext)) return "image";
  return "text";
}

export function mimeTypeForFilePath(filePath: string): string | null {
  const ext = fileExtension(filePath);
  return MIME_BY_EXTENSION[ext] ?? null;
}

export function buildFsRawFileUrl(
  workingDirectory: string,
  filePath: string,
): string {
  const url = new URL("/api/fs/raw", window.location.origin);
  url.searchParams.set("root", workingDirectory);
  url.searchParams.set("path", filePath);
  return url.toString();
}
