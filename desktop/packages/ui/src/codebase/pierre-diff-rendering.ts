import type { FileDiffMetadata } from "@pierre/diffs";
import { parsePatchFiles } from "@pierre/diffs/utils/parsePatchFiles";
import type { GithubPullRequestFile, GithubPullRequestFileStatus } from "@backsteros/contracts";

export const DIFF_THEME_NAMES = {
  light: "pierre-light",
  dark: "pierre-dark",
} as const;

export type DiffThemeName = (typeof DIFF_THEME_NAMES)[keyof typeof DIFF_THEME_NAMES];

export function resolveDiffThemeName(theme: "light" | "dark"): DiffThemeName {
  return theme === "dark" ? DIFF_THEME_NAMES.dark : DIFF_THEME_NAMES.light;
}

const FNV_OFFSET_BASIS_32 = 0x811c9dc5;
const FNV_PRIME_32 = 0x01000193;
const SECONDARY_HASH_SEED = 0x9e3779b9;
const SECONDARY_HASH_MULTIPLIER = 0x85ebca6b;

function fnv1a32(
  input: string,
  seed = FNV_OFFSET_BASIS_32,
  multiplier = FNV_PRIME_32,
): number {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, multiplier) >>> 0;
  }
  return hash >>> 0;
}

function buildPatchCacheKey(patch: string, scope: string): string {
  const normalizedPatch = patch.trim();
  const primary = fnv1a32(normalizedPatch).toString(36);
  const secondary = fnv1a32(
    normalizedPatch,
    SECONDARY_HASH_SEED,
    SECONDARY_HASH_MULTIPLIER,
  ).toString(36);
  return `${scope}:${normalizedPatch.length}:${primary}:${secondary}`;
}

/**
 * GitHub's `patch` field is hunk-only (`@@ ...`). Pierre expects unified
 * `---` / `+++` headers (same as `@git-diff-view`).
 */
export function toUnifiedDiff(
  filename: string,
  previousFilename: string | null,
  patch: string,
  status: GithubPullRequestFileStatus,
): string {
  const trimmed = patch.replace(/^\uFEFF/, "").trimStart();
  if (
    trimmed.startsWith("diff ") ||
    trimmed.startsWith("--- ") ||
    trimmed.startsWith("+++ ")
  ) {
    return trimmed.endsWith("\n") ? trimmed : `${trimmed}\n`;
  }

  const oldPath =
    status === "added" ? "/dev/null" : `a/${previousFilename ?? filename}`;
  const newPath = status === "removed" ? "/dev/null" : `b/${filename}`;
  const body = trimmed.endsWith("\n") ? trimmed : `${trimmed}\n`;
  return `--- ${oldPath}\n+++ ${newPath}\n${body}`;
}

/**
 * Pierre's partial-patch parser keeps hunk render starts in source-file
 * coordinates. Compact them so the virtualizer iterates continuous rows.
 */
export function compactPartialHunkOffsets(file: FileDiffMetadata): FileDiffMetadata {
  if (!file.isPartial) return file;

  let splitLineStart = 0;
  let unifiedLineStart = 0;
  const hunks = file.hunks.map((hunk) => {
    const compactHunk = {
      ...hunk,
      splitLineStart,
      unifiedLineStart,
    };
    splitLineStart += hunk.splitLineCount;
    unifiedLineStart += hunk.unifiedLineCount;
    return compactHunk;
  });

  return {
    ...file,
    hunks,
    splitLineCount: splitLineStart,
    unifiedLineCount: unifiedLineStart,
    ...(file.cacheKey ? { cacheKey: `${file.cacheKey}:compact-partial` } : {}),
  };
}

export function resolveFileDiffPath(fileDiff: FileDiffMetadata): string {
  const raw = fileDiff.name ?? fileDiff.prevName ?? "";
  if (raw.startsWith("a/") || raw.startsWith("b/")) {
    return raw.slice(2);
  }
  return raw;
}

export function parseGithubFilesToPierreDiffs(
  files: ReadonlyArray<GithubPullRequestFile>,
  cacheScope: string,
): {
  fileDiffs: FileDiffMetadata[];
  skipped: GithubPullRequestFile[];
} {
  const fileDiffs: FileDiffMetadata[] = [];
  const skipped: GithubPullRequestFile[] = [];

  for (const file of files) {
    if (!file.patch?.trim()) {
      skipped.push(file);
      continue;
    }

    const unified = toUnifiedDiff(
      file.filename,
      file.previousFilename,
      file.patch,
      file.status,
    );

    try {
      const parsed = parsePatchFiles(
        unified.trim(),
        buildPatchCacheKey(unified, `${cacheScope}:${file.filename}`),
      );
      const next = parsed.flatMap((entry) =>
        entry.files.map(compactPartialHunkOffsets),
      );
      if (next.length === 0) {
        skipped.push(file);
        continue;
      }
      fileDiffs.push(...next);
    } catch {
      skipped.push(file);
    }
  }

  return { fileDiffs, skipped };
}

/**
 * Map Pierre surfaces onto desktop code tokens (ported from BacksterDEV
 * `DIFF_SURFACE_THEME_UNSAFE_CSS` + sticky header chrome).
 */
export const PIERRE_DIFF_UNSAFE_CSS = `
[data-diffs-header],
[data-diff],
[data-file],
[data-error-wrapper],
[data-virtualizer-buffer] {
  --diffs-header-font-family: var(--font-sans) !important;
  --diffs-font-family: var(--font-mono) !important;
  --diffs-bg: var(--code-background) !important;
  --diffs-light-bg: var(--code-background) !important;
  --diffs-dark-bg: var(--code-background) !important;
  --diffs-token-light-bg: transparent;
  --diffs-token-dark-bg: transparent;
  --diffs-bg-context-override: color-mix(in srgb, var(--code-background) 97%, var(--code-foreground));
  --diffs-bg-hover-override: color-mix(in srgb, var(--code-background) 94%, var(--code-foreground));
  --diffs-bg-separator-override: color-mix(
    in srgb,
    var(--code-background) 95%,
    var(--code-foreground)
  );
  --diffs-bg-buffer-override: color-mix(in srgb, var(--code-background) 90%, var(--code-foreground));
  --diffs-bg-addition-override: light-dark(
    color-mix(in srgb, var(--code-background) 50%, var(--success, #3fb950)),
    color-mix(in srgb, var(--code-background) 70%, var(--success, #3fb950))
  );
  --diffs-bg-addition-number-override: light-dark(
    color-mix(in srgb, var(--code-background) 35%, var(--success, #3fb950)),
    color-mix(in srgb, var(--code-background) 60%, var(--success, #3fb950))
  );
  --diffs-bg-addition-hover-override: color-mix(
    in srgb,
    var(--code-background) 85%,
    var(--success, #3fb950)
  );
  --diffs-bg-addition-emphasis-override: color-mix(
    in srgb,
    var(--code-background) 80%,
    var(--success, #3fb950)
  );
  --diffs-bg-deletion-override: light-dark(
    color-mix(in srgb, var(--code-background) 50%, var(--destructive, #f85149)),
    color-mix(in srgb, var(--code-background) 70%, var(--destructive, #f85149))
  );
  --diffs-bg-deletion-number-override: light-dark(
    color-mix(in srgb, var(--code-background) 35%, var(--destructive, #f85149)),
    color-mix(in srgb, var(--code-background) 60%, var(--destructive, #f85149))
  );
  --diffs-bg-deletion-hover-override: color-mix(
    in srgb,
    var(--code-background) 85%,
    var(--destructive, #f85149)
  );
  --diffs-bg-deletion-emphasis-override: color-mix(
    in srgb,
    var(--code-background) 80%,
    var(--destructive, #f85149)
  );
  background-color: var(--diffs-bg) !important;
  color: var(--code-foreground) !important;
}

[data-file-info] {
  background-color: var(--code-background) !important;
  border-block-color: transparent !important;
  color: var(--code-foreground) !important;
}

[data-diffs-header] {
  position: sticky !important;
  top: 0;
  z-index: 4;
  background-color: var(--code-background) !important;
  border-bottom-color: transparent !important;
  align-items: center !important;
  font-family: var(--font-sans) !important;
  font-size: 12px !important;
  line-height: 1 !important;
  min-height: 32px !important;
  padding-block: 6px !important;
  padding-inline: 8px 12px !important;
}

[data-diffs-header]:hover {
  background-color: var(--code-background) !important;
  box-shadow: inset 3px 0 color-mix(in srgb, var(--code-foreground) 24%, transparent);
}

:is([data-separator="line-info"], [data-separator="line-info-basic"]) {
  height: 24px !important;
  margin-block: 0 !important;
  background-color: var(--code-background) !important;
}

:is([data-separator="line-info"], [data-separator="line-info-basic"])
  [data-separator-wrapper] {
  padding-inline: 8px 12px !important;
  background-color: transparent !important;
}

:is([data-separator="line-info"], [data-separator="line-info-basic"])
  [data-separator-content] {
  gap: 8px;
  padding-inline: 0 !important;
  background-color: transparent !important;
  color: color-mix(in srgb, var(--code-foreground) 52%, var(--code-background)) !important;
  font-family: var(--font-sans) !important;
  font-size: 11px !important;
  text-decoration: none !important;
}

[data-title] {
  cursor: pointer;
  font-family: var(--font-sans) !important;
}

[data-diffs-header] [data-additions-count],
[data-diffs-header] [data-deletions-count] {
  font-family: var(--font-mono) !important;
  font-size: 11px !important;
  font-variant-numeric: tabular-nums;
  line-height: 1 !important;
}
`;
