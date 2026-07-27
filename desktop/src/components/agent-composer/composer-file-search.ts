/**
 * Bounded path search under a project working directory for @-mentions.
 */

import { projectFs, type FsTreeEntry } from "../../lib/project-fs";

export type ComposerPathSearchEntry = {
  path: string;
  /** Path relative to cwd when possible. */
  relativePath: string;
  kind: "file" | "directory";
  label: string;
};

const MAX_RESULTS = 40;
const MAX_DEPTH = 6;
const MAX_VISITED = 800;

function normalizeRoot(cwd: string): string {
  return cwd.replace(/\\/g, "/").replace(/\/+$/, "");
}

function toRelative(root: string, absolute: string): string {
  const rootNorm = normalizeRoot(root);
  const absNorm = absolute.replace(/\\/g, "/");
  if (absNorm === rootNorm) return ".";
  if (absNorm.startsWith(`${rootNorm}/`)) {
    return absNorm.slice(rootNorm.length + 1);
  }
  return absNorm;
}

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

function scorePath(relativePath: string, query: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const full = relativePath.toLowerCase();
  const name = basename(relativePath).toLowerCase();
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (full.includes(`/${q}`)) return 2;
  if (name.includes(q)) return 3;
  if (full.includes(q)) return 4;
  // Fuzzy: all query chars in order
  let qi = 0;
  for (let i = 0; i < full.length && qi < q.length; i += 1) {
    if (full[i] === q[qi]) qi += 1;
  }
  if (qi === q.length) return 10;
  return null;
}

/**
 * BFS under `cwd`, ranking entries that match `query`.
 * Skips heavy directories via projectFs.listEntries (which already filters SKIP_NAMES / dotfiles).
 */
export async function searchProjectPaths(
  cwd: string | null | undefined,
  query: string,
): Promise<{
  entries: ComposerPathSearchEntry[];
  error: string | null;
}> {
  const root = cwd?.trim();
  if (!root || root === "~") {
    return {
      entries: [],
      error: "Set a working directory to @-mention files.",
    };
  }

  const ranked: Array<{
    entry: ComposerPathSearchEntry;
    score: number;
  }> = [];
  const queue: Array<{ path: string; depth: number }> = [
    { path: root, depth: 0 },
  ];
  let visited = 0;
  let firstError: string | null = null;

  while (queue.length > 0 && visited < MAX_VISITED && ranked.length < MAX_RESULTS * 3) {
    const next = queue.shift();
    if (!next) break;
    visited += 1;

    const listed = await projectFs.listEntries(next.path);
    if (listed.error && next.depth === 0) {
      firstError = listed.error;
      break;
    }

    for (const child of listed.entries as FsTreeEntry[]) {
      const relativePath = toRelative(root, child.path);
      const score = scorePath(relativePath, query);
      if (score !== null) {
        ranked.push({
          score,
          entry: {
            path: child.path,
            relativePath,
            kind: child.kind,
            label: child.name,
          },
        });
      }
      if (child.kind === "directory" && next.depth + 1 < MAX_DEPTH) {
        queue.push({ path: child.path, depth: next.depth + 1 });
      }
    }
  }

  ranked.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.entry.relativePath.localeCompare(b.entry.relativePath, undefined, {
      sensitivity: "base",
    });
  });

  return {
    entries: ranked.slice(0, MAX_RESULTS).map((r) => r.entry),
    error: firstError,
  };
}
