/**
 * Task description images are stored as authenticated content paths
 * (`/api/v1/tasks/:taskId/images/:imageId`). Mirrors `@backsteros/contracts`
 * without depending on that package from BacksterDEV.
 */

export type ParsedTaskImageContentPath = {
  readonly taskId: string;
  readonly imageId: string;
};

/** Parse a relative or absolute task-image content URL. */
export function parseTaskImageContentPath(src: string): ParsedTaskImageContentPath | null {
  let path = src.trim();
  if (!path) return null;
  try {
    if (/^https?:\/\//i.test(path)) {
      path = new URL(path).pathname;
    }
  } catch {
    return null;
  }
  const match = path.match(/^\/api\/v1\/tasks\/([^/]+)\/images\/([^/]+)\/?$/);
  if (!match?.[1] || !match[2]) return null;
  return {
    taskId: decodeURIComponent(match[1]),
    imageId: decodeURIComponent(match[2]),
  };
}

/** Markdown image srcs: `![alt](url)` — capture group is the URL. */
const MARKDOWN_IMAGE_SRC_RE = /!\[[^\]]*]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;

/**
 * Unique authenticated task-image embeds found in markdown (description /
 * kickoff text). Order follows first appearance.
 */
export function listTaskImageRefsFromMarkdown(markdown: string): ParsedTaskImageContentPath[] {
  const seen = new Set<string>();
  const refs: ParsedTaskImageContentPath[] = [];
  for (const match of markdown.matchAll(MARKDOWN_IMAGE_SRC_RE)) {
    const src = match[1];
    if (!src) continue;
    const parsed = parseTaskImageContentPath(src);
    if (!parsed) continue;
    const key = `${parsed.taskId}/${parsed.imageId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(parsed);
  }
  return refs;
}
