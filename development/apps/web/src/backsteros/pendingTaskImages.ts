/**
 * Pending task-description images for editors that run before a task id exists
 * (compose create modal, Grok file-task brief). Stage as blob: URLs for preview,
 * then upload via POST /tasks/:id/images and rewrite markdown after create.
 */

import { markdownImageSnippet } from "./markdown-editor/markdown-image-paste";

/** Matches core `MAX_TASK_IMAGE_BYTES` (10 MB). */
export const TASK_IMAGE_MAX_BYTES = 10_000_000;

export const TASK_IMAGE_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MARKDOWN_IMAGE_RE = /!\[[^\]]*]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;

export type PendingTaskImage = {
  readonly blobUrl: string;
  readonly file: File;
};

export type StagePendingTaskImagesResult = {
  readonly staged: PendingTaskImage[];
  readonly errors: string[];
};

export function normalizeTaskImageMimeType(mimeType: string | undefined): string | null {
  const raw = (mimeType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (raw === "image/jpg" || raw === "image/pjpeg") return "image/jpeg";
  if (TASK_IMAGE_ALLOWED_MIME_TYPES.has(raw)) return raw;
  return null;
}

export function taskImageRejectionReason(file: File): string | null {
  const mime = normalizeTaskImageMimeType(file.type);
  if (!mime) {
    return "Only JPEG, PNG, WebP, and GIF images are supported.";
  }
  if (file.size > TASK_IMAGE_MAX_BYTES) {
    return "Images must be 10 MB or smaller.";
  }
  return null;
}

/** Create blob: URLs for accepted files; collect human-readable reject reasons. */
export function stagePendingTaskImages(files: readonly File[]): StagePendingTaskImagesResult {
  const staged: PendingTaskImage[] = [];
  const errors: string[] = [];
  for (const file of files) {
    const reason = taskImageRejectionReason(file);
    if (reason) {
      errors.push(`${file.name || "image"}: ${reason}`);
      continue;
    }
    staged.push({
      blobUrl: URL.createObjectURL(file),
      file,
    });
  }
  return { staged, errors };
}

export function revokePendingTaskImageUrls(pending: Iterable<{ readonly blobUrl: string }>): void {
  for (const entry of pending) {
    try {
      URL.revokeObjectURL(entry.blobUrl);
    } catch {
      // ignore
    }
  }
}

/**
 * Rewrite or remove markdown image embeds.
 * `mapUrl` returning `null` drops the whole `![alt](url)` snippet.
 */
export function mapMarkdownImageUrls(
  markdown: string,
  mapUrl: (url: string) => string | null,
): string {
  const next = markdown.replace(MARKDOWN_IMAGE_RE, (full, url: string) => {
    const mapped = mapUrl(url);
    if (mapped === null) return "";
    if (mapped === url) return full;
    return full.replace(url, mapped);
  });
  return next
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Drop pending blob: image embeds so we never persist blob URLs on create. */
export function stripPendingBlobImageMarkdown(
  markdown: string,
  pendingBlobUrls: ReadonlySet<string>,
): string {
  if (pendingBlobUrls.size === 0) return markdown.trim();
  return mapMarkdownImageUrls(markdown, (url) => (pendingBlobUrls.has(url) ? null : url));
}

export function replacePendingBlobUrlsInMarkdown(
  markdown: string,
  replacements: ReadonlyMap<string, string>,
): string {
  if (replacements.size === 0) return markdown;
  return mapMarkdownImageUrls(markdown, (url) => replacements.get(url) ?? url);
}

export function listPendingBlobUrlsInMarkdown(
  markdown: string,
  pendingBlobUrls: ReadonlySet<string>,
): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of markdown.matchAll(MARKDOWN_IMAGE_RE)) {
    const url = match[1];
    if (!url || !pendingBlobUrls.has(url) || seen.has(url)) continue;
    seen.add(url);
    found.push(url);
  }
  return found;
}

export type UploadPendingTaskImage = (
  taskId: string,
  file: File,
) => Promise<{ readonly url: string }>;

/**
 * Upload staged files referenced by blob: URLs in markdown and rewrite those
 * URLs to authenticated task-image content paths.
 */
export async function commitPendingTaskImages(input: {
  readonly taskId: string;
  readonly markdown: string;
  readonly pendingByBlobUrl: ReadonlyMap<string, File>;
  readonly upload: UploadPendingTaskImage;
}): Promise<string> {
  const urls = listPendingBlobUrlsInMarkdown(
    input.markdown,
    new Set(input.pendingByBlobUrl.keys()),
  );
  if (urls.length === 0) return input.markdown;

  const replacements = new Map<string, string>();
  for (const blobUrl of urls) {
    const file = input.pendingByBlobUrl.get(blobUrl);
    if (!file) continue;
    const image = await input.upload(input.taskId, file);
    replacements.set(blobUrl, image.url);
  }
  return replacePendingBlobUrlsInMarkdown(input.markdown, replacements);
}

/** Append markdown image lines for newly staged blob URLs. */
export function appendPendingImageMarkdown(markdown: string, blobUrls: readonly string[]): string {
  if (blobUrls.length === 0) return markdown;
  const block = blobUrls.map((url) => markdownImageSnippet(url)).join("\n");
  const base = markdown.trimEnd();
  if (!base) return `${block}\n`;
  const sep = base.endsWith("\n") ? "" : "\n";
  return `${base}${sep}${block}\n`;
}
