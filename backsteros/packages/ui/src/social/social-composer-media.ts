const DOCUMENT_MIME_PREFIXES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

function isDocumentMime(type: string): boolean {
  return DOCUMENT_MIME_PREFIXES.some(
    (prefix) => type === prefix || type.startsWith(`${prefix};`),
  );
}

/** Collect image/video/document files from paste or drop. */
export function collectSocialMediaFiles(
  data: DataTransfer | null | undefined,
): File[] {
  if (!data) return [];
  return [...(data.files ?? [])].filter(
    (file) =>
      file.type.startsWith("image/") ||
      file.type.startsWith("video/") ||
      isDocumentMime(file.type),
  );
}

export function socialMediaKindForFile(
  file: File,
): "image" | "video" | "document" | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (isDocumentMime(file.type)) return "document";
  return null;
}

export function fileToBase64DataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read media file"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string" || !result) {
        reject(new Error("Failed to read media file"));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}

export type SocialComposerDraftMedia = {
  /** Stable client id for React keys / remove. */
  localId: string;
  kind: "image" | "video" | "document";
  /** Present for newly pasted/dropped files; omitted for already-persisted media. */
  file?: File;
  /** Object URL or authenticated blob URL for preview. */
  previewUrl: string;
  /** When set, this media is already on the planned post — skip re-upload. */
  persistedId?: string;
};

export function createComposerDraftMedia(
  file: File,
): SocialComposerDraftMedia | null {
  const kind = socialMediaKindForFile(file);
  if (!kind) return null;
  return {
    localId: `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    file,
    previewUrl: URL.createObjectURL(file),
  };
}

export function isRevocableMediaPreviewUrl(url: string): boolean {
  return url.startsWith("blob:");
}

export function revokeComposerDraftMedia(
  items: readonly SocialComposerDraftMedia[],
): void {
  for (const item of items) {
    // Tray still owns persisted previews — don't kill thumbs when clearing edit.
    if (item.persistedId) continue;
    if (isRevocableMediaPreviewUrl(item.previewUrl)) {
      URL.revokeObjectURL(item.previewUrl);
    }
  }
}
