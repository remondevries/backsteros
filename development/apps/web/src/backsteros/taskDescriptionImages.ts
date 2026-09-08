import type { ComposerImageAttachment } from "~/composerDraftStore";

import { downloadBacksterosTaskImage } from "./client";
import { listTaskImageRefsFromMarkdown, parseTaskImageContentPath } from "./taskImagePaths";

function extensionForMimeType(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "png";
  }
}

/**
 * Resolve a markdown image `src` for preview. Authenticated task-image paths
 * become blob: URLs (caller owns revoke). Everything else passes through.
 */
export async function resolveBacksterosMarkdownImageSrc(
  src: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const parsed = parseTaskImageContentPath(src);
  if (!parsed) return src;
  const blob = await downloadBacksterosTaskImage(parsed.taskId, parsed.imageId, signal);
  return URL.createObjectURL(blob);
}

/**
 * Download task-description image embeds as composer attachments so kickoff
 * sends them to the agent (relative API paths alone are not viewable).
 */
export async function loadTaskDescriptionComposerImages(
  markdown: string,
  signal?: AbortSignal,
): Promise<ComposerImageAttachment[]> {
  const refs = listTaskImageRefsFromMarkdown(markdown);
  if (refs.length === 0) return [];

  const images: ComposerImageAttachment[] = [];
  for (const ref of refs) {
    try {
      const blob = await downloadBacksterosTaskImage(ref.taskId, ref.imageId, signal);
      const mimeType = blob.type && blob.type.startsWith("image/") ? blob.type : "image/png";
      const name = `task-image-${ref.imageId}.${extensionForMimeType(mimeType)}`;
      const file = new File([blob], name, { type: mimeType });
      images.push({
        type: "image",
        id: `backsteros-task-image-${ref.taskId}-${ref.imageId}`,
        name,
        mimeType,
        sizeBytes: file.size,
        previewUrl: URL.createObjectURL(file),
        file,
      });
    } catch {
      // Skip missing/unauthorized images — kickoff text still includes the path.
    }
  }
  return images;
}
