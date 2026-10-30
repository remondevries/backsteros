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

export function pendingChatImagesToFileParts(
  images: readonly PendingChatImage[],
): ChatUiFilePart[] {
  return images.map((image) => ({
    type: "file" as const,
    url: image.previewUrl,
    name: image.file.name || "image",
    mimeType: image.file.type || "image/png",
    kind: "image" as const,
  }));
}

/** Images from paste/drop; empty when the transfer has none. */
export function collectPendingChatImagesFromDataTransfer(
  data: DataTransfer | null | undefined,
): PendingChatImage[] {
  return createPendingChatImages(collectImageFiles(data));
}
