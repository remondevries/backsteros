/**
 * Pure vault replication planning + path validation (no Postgres / storage).
 * Keeps unit tests free of DATABASE_URL side effects.
 */
import path from "node:path";

import { rewriteLegacyKnowledgeBaseStorageKey } from "../../lib/storage.js";

export type VaultFileMeta = {
  relativePath: string;
  mtimeMs: number;
  size: number;
};

export type VaultManifestEntry = {
  mtimeMs: number;
  size: number;
  sha256?: string;
};

export type VaultManifest = Record<string, VaultManifestEntry>;

export type VaultManifestDiff = {
  upserts: VaultFileMeta[];
  deletes: string[];
};

export class VaultPathError extends Error {
  readonly code = "bad_vault_path" as const;
  constructor(message: string) {
    super(message);
    this.name = "VaultPathError";
  }
}

/** Directory names that must never appear in vault markdown manifests. */
const SKIP_DIRECTORY_NAMES = new Set(["node_modules", ".git"]);

/**
 * Skip dependency trees, VCS, and hidden folders (e.g. `.backsteros`, `.cache`).
 * Shared by walks, manifests, watchers, peer listings, and delete planners so
 * mixed builds never delete (or pull) paths the other side filters out.
 */
export function shouldSkipVaultWalkDirectory(name: string): boolean {
  if (SKIP_DIRECTORY_NAMES.has(name)) return true;
  if (name.startsWith(".")) return true;
  return false;
}

/** True when any path segment is a skipped directory (node_modules / .git / hidden). */
export function isSkippedVaultRelativePath(relativePath: string): boolean {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.some((part) => shouldSkipVaultWalkDirectory(part));
}

/**
 * Drop skipped paths from a saved or peer-sourced manifest.
 * Safe to call repeatedly; does not invent keys.
 */
export function pruneVaultManifest(manifest: VaultManifest): VaultManifest {
  const out: VaultManifest = {};
  for (const [relativePath, entry] of Object.entries(manifest)) {
    const rewritten = rewriteLegacyKnowledgeBaseStorageKey(relativePath);
    if (isSkippedVaultRelativePath(rewritten)) continue;
    const prev = out[rewritten];
    if (!prev || entry.mtimeMs >= prev.mtimeMs) {
      out[rewritten] = entry;
    }
  }
  return out;
}

export function filterVaultFileMetaList(
  files: readonly VaultFileMeta[],
): VaultFileMeta[] {
  return files.filter((file) => !isSkippedVaultRelativePath(file.relativePath));
}

function basenameOf(relativePath: string): string {
  const parts = relativePath.split("/");
  return parts[parts.length - 1] ?? relativePath;
}

/** Normalize and validate a vault-relative markdown path (posix). */
export function normalizeVaultMarkdownPath(raw: string): string {
  const trimmed = raw.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed.startsWith("/") || trimmed.includes("\0")) {
    throw new VaultPathError("Invalid vault path");
  }
  const segments = trimmed
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".");
  if (segments.length === 0 || segments.some((s) => s === "..")) {
    throw new VaultPathError("Path traversal is not allowed");
  }
  // Legacy vault-root "Knowledge Base/…" → Spaces/knowledge-base/second-brain/…
  const rewritten = rewriteLegacyKnowledgeBaseStorageKey(segments.join("/"));
  const relativePath = rewritten
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".")
    .join("/");
  if (isSkippedVaultRelativePath(relativePath)) {
    throw new VaultPathError(
      "Paths under node_modules, .git, or hidden folders are not replicated",
    );
  }
  const base = basenameOf(relativePath);
  if (base.startsWith("._") || base === ".DS_Store") {
    throw new VaultPathError("macOS junk paths are not replicated");
  }
  if (!base.toLowerCase().endsWith(".md")) {
    throw new VaultPathError("Only .md files are replicated");
  }
  return relativePath;
}

export function resolveSafeVaultAbsolute(
  vaultRoot: string,
  relativePath: string,
): string {
  const normalized = normalizeVaultMarkdownPath(relativePath);
  const root = path.resolve(vaultRoot);
  const absolute = path.resolve(root, ...normalized.split("/"));
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new VaultPathError("Resolved path escapes vault root");
  }
  return absolute;
}

/**
 * Local listing can reuse the on-disk vault-manifest when nothing is dirty.
 * Empty manifest or a forced/full-dirty signal requires a real walk.
 */
export function shouldSkipFullVaultWalk(input: {
  manifestEntryCount: number;
  dirtyPaths: readonly string[];
  forceFullScan: boolean;
}): boolean {
  if (input.forceFullScan) return false;
  if (input.manifestEntryCount === 0) return false;
  if (input.dirtyPaths.includes("*")) return false;
  return input.dirtyPaths.length === 0;
}

/** Treat the synced manifest as the current local file list (no FS). */
export function vaultFileMetaFromManifest(
  manifest: VaultManifest,
): VaultFileMeta[] {
  const pruned = pruneVaultManifest(manifest);
  const byPath = new Map<string, VaultFileMeta>();
  for (const [relativePath, entry] of Object.entries(pruned)) {
    byPath.set(relativePath, {
      relativePath,
      mtimeMs: entry.mtimeMs,
      size: entry.size,
    });
  }
  return [...byPath.values()].sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath),
  );
}

/**
 * Merge dirty path stats into the previous manifest listing.
 * `null` stat means the path was deleted on disk.
 * Skipped paths are never added (and are dropped from previous).
 */
export function applyDirtyVaultPathStats(input: {
  previous: VaultManifest;
  dirtyStats: ReadonlyMap<string, { mtimeMs: number; size: number } | null>;
}): VaultFileMeta[] {
  const byPath = new Map(
    vaultFileMetaFromManifest(input.previous).map((file) => [
      file.relativePath,
      file,
    ]),
  );

  for (const [relativePath, statOrNull] of input.dirtyStats) {
    const rewritten = rewriteLegacyKnowledgeBaseStorageKey(relativePath);
    if (isSkippedVaultRelativePath(rewritten)) {
      byPath.delete(rewritten);
      continue;
    }
    if (statOrNull == null) {
      byPath.delete(rewritten);
      continue;
    }
    byPath.set(rewritten, {
      relativePath: rewritten,
      mtimeMs: statOrNull.mtimeMs,
      size: statOrNull.size,
    });
  }

  return [...byPath.values()].sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath),
  );
}

export function diffVaultManifest(
  current: readonly VaultFileMeta[],
  previous: VaultManifest,
): VaultManifestDiff {
  const prunedPrevious = pruneVaultManifest(previous);
  const filteredCurrent = filterVaultFileMetaList(current);
  const upserts: VaultFileMeta[] = [];
  const currentPaths = new Set<string>();

  for (const file of filteredCurrent) {
    currentPaths.add(file.relativePath);
    const prior = prunedPrevious[file.relativePath];
    if (
      !prior ||
      prior.mtimeMs !== file.mtimeMs ||
      prior.size !== file.size
    ) {
      upserts.push(file);
    }
  }

  const deletes: string[] = [];
  for (const priorPath of Object.keys(prunedPrevious)) {
    // Never delete because a path was filtered (node_modules / .git / hidden).
    if (isSkippedVaultRelativePath(priorPath)) continue;
    if (!currentPaths.has(priorPath)) {
      deletes.push(priorPath);
    }
  }
  deletes.sort((a, b) => a.localeCompare(b));
  upserts.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return { upserts, deletes };
}

/**
 * Whether peer should be written locally.
 * Never overwrite a non-empty local body with an empty peer file — even if
 * peer mtime is newer (same empty-over-nonempty invariant as push / updateDocumentContent).
 */
export function shouldPullVaultFile(
  remote: VaultFileMeta,
  local: VaultFileMeta | undefined,
): boolean {
  if (!local) return true;
  if (remote.size === 0 && local.size > 0) return false;
  return (
    remote.mtimeMs > local.mtimeMs ||
    (local.size === 0 && remote.size > 0)
  );
}

/** Peer files that should be written locally (missing or strictly newer on peer). */
export function planVaultPull(
  local: readonly VaultFileMeta[],
  peer: readonly VaultFileMeta[],
): VaultFileMeta[] {
  const localFiltered = filterVaultFileMetaList(local);
  const peerFiltered = filterVaultFileMetaList(peer);
  const localByPath = new Map(
    localFiltered.map((file) => [file.relativePath, file] as const),
  );
  return peerFiltered
    .filter((remote) =>
      shouldPullVaultFile(remote, localByPath.get(remote.relativePath)),
    )
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/**
 * Whether local should push this path to the peer.
 * Never overwrite a non-empty peer body with an empty local file — even if
 * local mtime is newer (prevents accidental document emptying).
 */
export function shouldPushVaultFile(
  local: VaultFileMeta,
  peer: VaultFileMeta | undefined,
): boolean {
  if (!peer) return true;
  if (local.size === 0 && peer.size > 0) return false;
  return local.mtimeMs >= peer.mtimeMs;
}

/** Local files eligible to push after peer LWW + empty-body guards. */
export function planVaultPush(
  local: readonly VaultFileMeta[],
  peer: readonly VaultFileMeta[],
): VaultFileMeta[] {
  const localFiltered = filterVaultFileMetaList(local);
  const peerFiltered = filterVaultFileMetaList(peer);
  const peerByPath = new Map(
    peerFiltered.map((file) => [file.relativePath, file] as const),
  );
  return localFiltered
    .filter((file) => shouldPushVaultFile(file, peerByPath.get(file.relativePath)))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/**
 * Local paths that existed on the peer last sync and are gone remotely, while
 * the local file still matches the last synced meta — treat as remote deletes.
 *
 * Skipped paths (node_modules / .git / hidden) are pruned from all three inputs
 * first so a mixed-build peer that still lists 60k node_modules entries cannot
 * trip the incomplete-peer guard or invent deletes for filtered paths.
 */
export function planVaultPullDeletes(
  local: readonly VaultFileMeta[],
  peer: readonly VaultFileMeta[],
  previous: VaultManifest,
): string[] {
  const localFiltered = filterVaultFileMetaList(local);
  const peerFiltered = filterVaultFileMetaList(peer);
  const prunedPrevious = pruneVaultManifest(previous);

  const peerCount = peerFiltered.length;
  const localCount = localFiltered.length;
  // Incomplete peer manifest — do not delete local markdown (hybrid recovery safety).
  if (localCount >= 20 && peerCount < Math.max(20, Math.floor(localCount * 0.25))) {
    return [];
  }

  const peerPaths = new Set(peerFiltered.map((f) => f.relativePath));
  const localByPath = new Map(
    localFiltered.map((file) => [file.relativePath, file] as const),
  );
  const deletes: string[] = [];
  for (const [relativePath, prior] of Object.entries(prunedPrevious)) {
    if (isSkippedVaultRelativePath(relativePath)) continue;
    if (peerPaths.has(relativePath)) continue;
    const here = localByPath.get(relativePath);
    if (!here) continue;
    if (here.mtimeMs === prior.mtimeMs && here.size === prior.size) {
      deletes.push(relativePath);
    }
  }
  deletes.sort((a, b) => a.localeCompare(b));
  return deletes;
}
