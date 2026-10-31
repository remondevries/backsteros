import type { ChatUiFilePart } from "@backsteros/contracts";

import { collectImageFiles } from "../documents/markdown-image-paste.js";

export type PendingChatImage = {
  id: string;
  file: File;
  /** Object URL for composer preview + demo message rendering. */
  previewUrl: string;
};

export function createPendingChatImages(
  files: readonly File[],
): PendingChatImage[] {
  return files.map((file) => ({
    id: `img-${crypto.randomUUID()}`,
    file,
    previewUrl: URL.createObjectURL(file),
  }));
}

export function revokePendingChatImages(
  images: readonly PendingChatImage[],
): void {
  for (const image of images) {
    if (image.previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(image.previewUrl);
    }
  }
}

function filePartKind(file: File): "image" | "file" {
  const mime = (file.type || "").toLowerCase();
  if (
    mime === "image/jpeg" ||
    mime === "image/png" ||
    mime === "image/gif" ||
    mime === "image/webp"
  ) {
    return "image";
  }
  return "file";
}

export function pendingChatImagesToFileParts(
  images: readonly PendingChatImage[],
): ChatUiFilePart[] {
  return images.map((image) => ({
    type: "file" as const,
    url: image.previewUrl,
    name: image.file.name || (filePartKind(image.file) === "image" ? "image" : "file"),
    mimeType: image.file.type || "application/octet-stream",
    kind: filePartKind(image.file),
  }));
}

/** Images from paste/drop; empty when the transfer has none. */
export function collectPendingChatImagesFromDataTransfer(
  data: DataTransfer | null | undefined,
): PendingChatImage[] {
  return createPendingChatImages(collectImageFiles(data));
}

/** Any files from an `<input type="file">` selection. */
export function createPendingChatFilesFromList(
  list: FileList | readonly File[] | null | undefined,
): PendingChatImage[] {
  if (!list) return [];
  const files = Array.from(list).filter((file) => file.size > 0);
  return createPendingChatImages(files);
}
