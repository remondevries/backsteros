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
