/**
 * Continuous markdown vault twinning on the core-replication tick.
 * Local role: pull from peer (LWW by mtime) then push local changes.
 * Cloud role: serves vault HTTP only. PDFs / macOS junk are never synced.
 *
 * Local listing is manifest-first: a no-change tick reuses vault-manifest.json
 * (no full .md walk). fs.watch marks dirty paths; only those are re-stat'd.
 * Periodic full walk remains a safety net.
 */
import { createHash } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { appendOpsLog } from "../../lib/ops-log-buffer.js";
import {
  getVaultPathCache,
  isStorageConfigured,
  resolveVaultPath,
} from "../../lib/storage.js";
import { getCoreReplicationConfig } from "./config.js";

import {
  VaultPathError,
  applyDirtyVaultPathStats,
  diffVaultManifest,
  normalizeVaultMarkdownPath,
  planVaultPull,
  planVaultPullDeletes,
  planVaultPush,
  resolveSafeVaultAbsolute,
  shouldPullVaultFile,
  shouldPushVaultFile,
  shouldSkipFullVaultWalk,
  vaultFileMetaFromManifest,
  type VaultFileMeta,
  type VaultManifest,
  type VaultManifestDiff,
  type VaultManifestEntry,
} from "./vault-plan.js";

export {
  VaultPathError,
  applyDirtyVaultPathStats,
  diffVaultManifest,
  normalizeVaultMarkdownPath,
  planVaultPull,
  planVaultPullDeletes,
  planVaultPush,
  resolveSafeVaultAbsolute,
  shouldPullVaultFile,
  shouldPushVaultFile,
  shouldSkipFullVaultWalk,
  vaultFileMetaFromManifest,
};
export type {
  VaultFileMeta,
  VaultManifest,
  VaultManifestDiff,
  VaultManifestEntry,
};

export const VAULT_MANIFEST_RELATIVE_PATH =
  ".backsteros/replication/vault-manifest.json";

export const VAULT_REPLICATION_PAGE_SIZE = 50;
export const VAULT_MAX_MARKDOWN_BYTES = 5 * 1024 * 1024;
/** Safety net: full vault walk even when the dirty set is empty. */
export const VAULT_FULL_SCAN_EVERY_TICKS = 40;

const dirtyMarkdownPaths = new Set<string>();
let vaultWatcher: FSWatcher | null = null;
let vaultWatcherRoot: string | null = null;
let ticksSinceFullScan = 0;

/** Test / ops: mark paths dirty (`*` = force full walk). */
export function markVaultMarkdownDirty(relativePath: string): void {
  dirtyMarkdownPaths.add(relativePath.replace(/\\/g, "/"));
}

/** Test helper: clear dirty set + tick counter (does not stop the watcher). */
export function resetVaultListingStateForTests(): void {
  dirtyMarkdownPaths.clear();
  ticksSinceFullScan = 0;
}

export function peekVaultDirtyPathsForTests(): string[] {
  return [...dirtyMarkdownPaths].sort();
}

function noteVaultWatchEvent(filename: string | null): void {
  if (!filename) {
    dirtyMarkdownPaths.add("*");
    return;
  }
  const normalized = filename.replace(/\\/g, "/");
  const base = path.posix.basename(normalized);
  if (shouldSkipDirentName(base)) return;
  if (base.toLowerCase().endsWith(".md")) {
    dirtyMarkdownPaths.add(normalized);
    return;
  }
  // Directory / non-md change may mean a new .md appeared — force a walk.
  dirtyMarkdownPaths.add("*");
}

export function ensureVaultChangeWatcher(vaultRoot: string): void {
  const root = path.resolve(vaultRoot);
  if (vaultWatcher && vaultWatcherRoot === root) return;
  if (vaultWatcher) {
    vaultWatcher.close();
    vaultWatcher = null;
    vaultWatcherRoot = null;
  }
  try {
    vaultWatcher = watch(root, { recursive: true }, (_event, filename) => {
      noteVaultWatchEvent(typeof filename === "string" ? filename : null);
    });
    vaultWatcherRoot = root;
    vaultWatcher.on("error", () => {
      dirtyMarkdownPaths.add("*");
    });
  } catch {
    // Recursive watch unsupported — fall back to periodic full walks.
    dirtyMarkdownPaths.add("*");
  }
}

function manifestAbsolutePath(vaultRoot: string): string {
  return path.join(path.resolve(vaultRoot), VAULT_MANIFEST_RELATIVE_PATH);
}

function shouldSkipDirentName(name: string): boolean {
  if (name === ".DS_Store" || name === ".AppleDouble") return true;
  if (name.startsWith("._")) return true;
  return false;
}

function isMarkdownFileName(name: string): boolean {
  if (shouldSkipDirentName(name)) return false;
  return name.toLowerCase().endsWith(".md");
}

async function walkMarkdownFiles(
  dirAbsolute: string,
  relativeDir: string,
  out: VaultFileMeta[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dirAbsolute, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (shouldSkipDirentName(entry.name)) continue;
    const childRel = relativeDir
      ? `${relativeDir}/${entry.name}`
      : entry.name;
    const childAbs = path.join(dirAbsolute, entry.name);
    if (entry.isDirectory()) {
      await walkMarkdownFiles(childAbs, childRel, out);
      continue;
    }
    if (!entry.isFile() || !isMarkdownFileName(entry.name)) continue;
    try {
      const info = await stat(childAbs);
      out.push({
        relativePath: childRel.replace(/\\/g, "/"),
        mtimeMs: Math.trunc(info.mtimeMs),
        size: info.size,
      });
    } catch {
      // Race with delete — skip
    }
  }
}

export async function listMarkdownFiles(
  vaultRoot: string,
): Promise<VaultFileMeta[]> {
  const root = path.resolve(vaultRoot);
  const out: VaultFileMeta[] = [];
  await walkMarkdownFiles(root, "", out);
  out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return out;
}

export type LocalVaultListing = {
  files: VaultFileMeta[];
  /** How the listing was produced. */
  scanned: "full" | "manifest" | "dirty";
};

/**
 * Manifest-first local listing for replication ticks.
 * - No dirty paths + non-empty manifest → reuse manifest (no walk, no .md stat).
 * - Specific dirty .md paths → stat only those; merge into manifest listing.
 * - Empty manifest, `*`, or forceFullScan → full walk.
 */
export async function resolveLocalMarkdownListing(
  vaultRoot: string,
  previous: VaultManifest,
  options?: { forceFullScan?: boolean },
): Promise<LocalVaultListing> {
  const dirty = [...dirtyMarkdownPaths];
  const forceFullScan = options?.forceFullScan === true;
  const skipWalk = shouldSkipFullVaultWalk({
    manifestEntryCount: Object.keys(previous).length,
    dirtyPaths: dirty,
    forceFullScan,
  });

  if (skipWalk) {
    return {
      files: vaultFileMetaFromManifest(previous),
      scanned: "manifest",
    };
  }

  if (
    !forceFullScan &&
    Object.keys(previous).length > 0 &&
    dirty.length > 0 &&
    !dirty.includes("*")
  ) {
    const dirtyStats = new Map<
      string,
      { mtimeMs: number; size: number } | null
    >();
    for (const relativePath of dirty) {
      try {
        const absolute = resolveSafeVaultAbsolute(vaultRoot, relativePath);
        const info = await stat(absolute);
        dirtyStats.set(relativePath, {
          mtimeMs: Math.trunc(info.mtimeMs),
          size: info.size,
        });
      } catch {
        dirtyStats.set(relativePath, null);
      }
    }
    dirtyMarkdownPaths.clear();
    return {
      files: applyDirtyVaultPathStats({ previous, dirtyStats }),
      scanned: "dirty",
    };
  }

  const files = await listMarkdownFiles(vaultRoot);
  dirtyMarkdownPaths.clear();
  return { files, scanned: "full" };
}

export async function readVaultManifest(
  vaultRoot: string,
): Promise<VaultManifest> {
  try {
    const raw = await readFile(manifestAbsolutePath(vaultRoot), "utf8");
    const parsed = JSON.parse(raw) as VaultManifest;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

export async function writeVaultManifest(
  vaultRoot: string,
  manifest: VaultManifest,
): Promise<void> {
  const absolute = manifestAbsolutePath(vaultRoot);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export async function sha256File(absolutePath: string): Promise<string> {
  const bytes = await readFile(absolutePath);
  return createHash("sha256").update(bytes).digest("hex");
}

export async function readVaultMarkdownBase64(
  vaultRoot: string,
  relativePath: string,
): Promise<{ contentBase64: string; mtimeMs: number; size: number }> {
  const absolute = resolveSafeVaultAbsolute(vaultRoot, relativePath);
  const info = await stat(absolute);
  if (info.size > VAULT_MAX_MARKDOWN_BYTES) {
    throw new VaultPathError(
      `Markdown file exceeds ${VAULT_MAX_MARKDOWN_BYTES} bytes`,
    );
  }
  const bytes = await readFile(absolute);
  return {
    contentBase64: bytes.toString("base64"),
    mtimeMs: Math.trunc(info.mtimeMs),
    size: info.size,
  };
}

export async function applyVaultFilePut(
  vaultRoot: string,
  input: { path: string; mtimeMs: number; contentBase64: string },
): Promise<"applied" | "skipped"> {
  const relativePath = normalizeVaultMarkdownPath(input.path);
  const absolute = resolveSafeVaultAbsolute(vaultRoot, relativePath);
  const bytes = Buffer.from(input.contentBase64, "base64");
  if (bytes.byteLength > VAULT_MAX_MARKDOWN_BYTES) {
    throw new VaultPathError(
      `Markdown file exceeds ${VAULT_MAX_MARKDOWN_BYTES} bytes`,
    );
  }

  try {
    const existing = await stat(absolute);
    // Never clobber a non-empty body with empty bytes (document-emptying guard).
    if (bytes.byteLength === 0 && existing.size > 0) {
      return "skipped";
    }
    if (
      existing.mtimeMs >= input.mtimeMs &&
      existing.size === bytes.byteLength
    ) {
      return "skipped";
    }
  } catch {
    // missing — apply
  }

  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes);
  const mtimeSec = input.mtimeMs / 1000;
  await utimes(absolute, mtimeSec, mtimeSec);
  markVaultMarkdownDirty(relativePath);
  return "applied";
}

export async function applyVaultFileDelete(
  vaultRoot: string,
  relativePathRaw: string,
): Promise<"applied" | "skipped"> {
  const relativePath = normalizeVaultMarkdownPath(relativePathRaw);
  const absolute = resolveSafeVaultAbsolute(vaultRoot, relativePath);
  try {
    await rm(absolute, { force: true });
    markVaultMarkdownDirty(relativePath);
    return "applied";
  } catch {
    return "skipped";
  }
}

async function resolveConfiguredVaultRoot(): Promise<string | null> {
  if (!isStorageConfigured() && !getVaultPathCache()) {
    try {
      return await resolveVaultPath();
    } catch {
      return null;
    }
  }
  try {
    return await resolveVaultPath();
  } catch {
    return null;
  }
}

function replicationHeaders(secret: string): HeadersInit {
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
}

export type VaultPushResult = {
  upserted: number;
  deleted: number;
  remaining: number;
};

export type VaultPullResult = {
  applied: number;
  skipped: number;
  remaining: number;
};

async function fetchPeerManifest(
  peerUrl: string,
  secret: string,
  timeoutMs: number,
): Promise<VaultFileMeta[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `${peerUrl}/internal/core-replication/vault/manifest`,
      {
        headers: { Authorization: `Bearer ${secret}` },
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`vault manifest failed (${response.status}): ${text}`);
    }
    const body = (await response.json()) as { files?: VaultFileMeta[] };
    return body.files ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

type VaultTickContext = {
  vaultRoot: string;
  localFiles: VaultFileMeta[];
  previous: VaultManifest;
};

/**
 * Local-core: pull newer/missing markdown from peer (cloud), then callers push.
 * LWW by mtimeMs — peer wins when strictly newer. Deletes apply only when the
 * local file still matches the last synced manifest entry.
 */
export async function pullVaultFromPeer(
  options: {
    pageSize?: number;
    timeoutMs?: number;
    /** Precomputed listing from syncVaultWithPeer (avoids a second walk). */
    tick?: VaultTickContext;
  } = {},
): Promise<VaultPullResult | null> {
  const config = getCoreReplicationConfig();
  if (!config || config.role !== "local") {
    return null;
  }

  const vaultRoot =
    options.tick?.vaultRoot ?? (await resolveConfiguredVaultRoot());
  if (!vaultRoot) {
    return null;
  }

  const pageSize = options.pageSize ?? VAULT_REPLICATION_PAGE_SIZE;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const previous =
    options.tick?.previous ?? (await readVaultManifest(vaultRoot));
  const localFiles =
    options.tick?.localFiles ??
    (await resolveLocalMarkdownListing(vaultRoot, previous)).files;
  const peerFiles = await fetchPeerManifest(
    config.peerUrl,
    config.secret,
    timeoutMs,
  );

  const pullList = planVaultPull(localFiles, peerFiles);
  const deleteList = planVaultPullDeletes(localFiles, peerFiles, previous);
  const pullBatch = pullList.slice(0, pageSize);
  const deleteBudget = Math.max(0, pageSize - pullBatch.length);
  const deleteBatch = deleteList.slice(0, deleteBudget);

  let applied = 0;
  let skipped = 0;
  const nextManifest: VaultManifest = { ...previous };

  for (const remote of pullBatch) {
    const url = new URL(`${config.peerUrl}/internal/core-replication/vault/file`);
    url.searchParams.set("path", remote.relativePath);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${config.secret}` },
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `vault GET ${remote.relativePath} failed (${response.status}): ${text}`,
        );
      }
      const body = (await response.json()) as {
        path?: string;
        mtimeMs?: number;
        contentBase64?: string;
      };
      if (
        typeof body.path !== "string" ||
        typeof body.mtimeMs !== "number" ||
        typeof body.contentBase64 !== "string"
      ) {
        throw new Error(`vault GET ${remote.relativePath} returned invalid body`);
      }
      const result = await applyVaultFilePut(vaultRoot, {
        path: body.path,
        mtimeMs: body.mtimeMs,
        contentBase64: body.contentBase64,
      });
      if (result === "applied") {
        applied += 1;
        const { syncDocumentMetadataAfterVaultWrite } = await import(
          "../vault-document-metadata.js"
        );
        await syncDocumentMetadataAfterVaultWrite(body.path);
      } else {
        skipped += 1;
      }
      nextManifest[remote.relativePath] = {
        mtimeMs: body.mtimeMs,
        size: Buffer.from(body.contentBase64, "base64").byteLength,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  for (const relativePath of deleteBatch) {
    const result = await applyVaultFileDelete(vaultRoot, relativePath);
    if (result === "applied") applied += 1;
    else skipped += 1;
    delete nextManifest[relativePath];
  }

  if (applied > 0 || skipped > 0 || deleteBatch.length > 0 || pullBatch.length > 0) {
    await writeVaultManifest(vaultRoot, nextManifest);
  }
  if (applied > 0 || deleteBatch.length > 0) {
    appendOpsLog(
      "info",
      "vault replication pull",
      `${applied} applied, ${skipped} skipped, ${deleteBatch.length} deleted`,
    );
  }

  const remaining =
    pullList.length - pullBatch.length + (deleteList.length - deleteBatch.length);

  return { applied, skipped, remaining };
}

/**
 * Local-core only: push a page of markdown vault diffs to the peer.
 * Updates the on-disk manifest only for successfully synced paths.
 */
export async function pushVaultToPeer(
  options: {
    pageSize?: number;
    timeoutMs?: number;
    tick?: VaultTickContext;
  } = {},
): Promise<VaultPushResult | null> {
  const config = getCoreReplicationConfig();
  if (!config || config.role !== "local") {
    return null;
  }

  const vaultRoot =
    options.tick?.vaultRoot ?? (await resolveConfiguredVaultRoot());
  if (!vaultRoot) {
    appendOpsLog(
      "info",
      "vault replication skipped",
      "vault path not configured",
    );
    return null;
  }

  const pageSize = options.pageSize ?? VAULT_REPLICATION_PAGE_SIZE;
  const timeoutMs = options.timeoutMs ?? 120_000;
  let previous =
    options.tick?.previous ?? (await readVaultManifest(vaultRoot));
  const current =
    options.tick?.localFiles ??
    (await resolveLocalMarkdownListing(vaultRoot, previous)).files;

  // After bootstrap/rsync, local may have no manifest yet. Use the peer
  // manifest as baseline so we only push real drift instead of every file.
  if (Object.keys(previous).length === 0) {
    try {
      const peerFiles = await fetchPeerManifest(
        config.peerUrl,
        config.secret,
        timeoutMs,
      );
      const seeded: VaultManifest = {};
      for (const file of peerFiles) {
        seeded[file.relativePath] = {
          mtimeMs: file.mtimeMs,
          size: file.size,
        };
      }
      previous = seeded;
    } catch {
      // Peer unreachable — fall through and page upserts from empty baseline
    }
  }

  // Prefer peer when it is strictly newer so we don't overwrite cloud offline writes.
  // Also never push an empty local file over a non-empty peer body.
  let peerFiles: VaultFileMeta[] = [];
  try {
    peerFiles = await fetchPeerManifest(config.peerUrl, config.secret, timeoutMs);
  } catch {
    peerFiles = [];
  }
  const currentForPush = planVaultPush(current, peerFiles);
  const peerByPath = new Map(
    peerFiles.map((file) => [file.relativePath, file] as const),
  );

  const diff = diffVaultManifest(currentForPush, previous);

  // Only delete on peer when local removed a path we previously synced and peer
  // still has the old meta (avoid deleting peer-only agent files).
  const deletes = diff.deletes.filter((relativePath) => {
    const remote = peerByPath.get(relativePath);
    const prior = previous[relativePath];
    if (!remote || !prior) return false;
    return remote.mtimeMs === prior.mtimeMs && remote.size === prior.size;
  });

  const upsertBatch = diff.upserts.slice(0, pageSize);
  const deleteBudget = Math.max(0, pageSize - upsertBatch.length);
  const deleteBatch = deletes.slice(0, deleteBudget);

  let upserted = 0;
  let deleted = 0;
  const nextManifest: VaultManifest = { ...previous };

  for (const file of upsertBatch) {
    const payload = await readVaultMarkdownBase64(vaultRoot, file.relativePath);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(
        `${config.peerUrl}/internal/core-replication/vault/file`,
        {
          method: "PUT",
          headers: replicationHeaders(config.secret),
          body: JSON.stringify({
            path: file.relativePath,
            mtimeMs: payload.mtimeMs,
            contentBase64: payload.contentBase64,
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `vault PUT ${file.relativePath} failed (${response.status}): ${text}`,
        );
      }
      const absolute = resolveSafeVaultAbsolute(vaultRoot, file.relativePath);
      nextManifest[file.relativePath] = {
        mtimeMs: payload.mtimeMs,
        size: payload.size,
        sha256: await sha256File(absolute),
      };
      upserted += 1;
    } finally {
      clearTimeout(timeout);
    }
  }

  for (const relativePath of deleteBatch) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = new URL(
        `${config.peerUrl}/internal/core-replication/vault/file`,
      );
      url.searchParams.set("path", relativePath);
      const response = await fetch(url, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${config.secret}` },
        signal: controller.signal,
      });
      if (!response.ok && response.status !== 404) {
        const text = await response.text();
        throw new Error(
          `vault DELETE ${relativePath} failed (${response.status}): ${text}`,
        );
      }
      delete nextManifest[relativePath];
      deleted += 1;
    } finally {
      clearTimeout(timeout);
    }
  }

  // Keep peer-only files in the local manifest so pull-deletes and future
  // LWW comparisons stay accurate after a push page.
  for (const remote of peerFiles) {
    if (!nextManifest[remote.relativePath]) {
      nextManifest[remote.relativePath] = {
        mtimeMs: remote.mtimeMs,
        size: remote.size,
      };
    }
  }

  if (upserted > 0 || deleted > 0) {
    await writeVaultManifest(vaultRoot, nextManifest);
    appendOpsLog(
      "info",
      "vault replication push",
      `${upserted} upserted, ${deleted} deleted`,
    );
  } else {
    const onDisk = await readVaultManifest(vaultRoot);
    if (Object.keys(onDisk).length === 0) {
      if (Object.keys(previous).length > 0 || peerFiles.length > 0) {
        await writeVaultManifest(vaultRoot, nextManifest);
      } else if (current.length > 0) {
        const seeded: VaultManifest = {};
        for (const file of current) {
          seeded[file.relativePath] = {
            mtimeMs: file.mtimeMs,
            size: file.size,
          };
        }
        await writeVaultManifest(vaultRoot, seeded);
      }
    }
  }

  const remaining =
    diff.upserts.length -
    upsertBatch.length +
    (deletes.length - deleteBatch.length);

  return { upserted, deleted, remaining };
}

/** Pull then push vault markdown (local role). Listing computed once per tick. */
export async function syncVaultWithPeer(
  options: { pageSize?: number; timeoutMs?: number } = {},
): Promise<{ pull: VaultPullResult | null; push: VaultPushResult | null }> {
  const vaultRoot = await resolveConfiguredVaultRoot();
  if (!vaultRoot) {
    return { pull: null, push: null };
  }

  ensureVaultChangeWatcher(vaultRoot);
  const previous = await readVaultManifest(vaultRoot);
  ticksSinceFullScan += 1;
  const forceFullScan = ticksSinceFullScan >= VAULT_FULL_SCAN_EVERY_TICKS;
  const listing = await resolveLocalMarkdownListing(vaultRoot, previous, {
    forceFullScan,
  });
  if (listing.scanned === "full") {
    ticksSinceFullScan = 0;
  }

  const tick: VaultTickContext = {
    vaultRoot,
    localFiles: listing.files,
    previous,
  };

  const pull = await pullVaultFromPeer({ ...options, tick });
  // Pull may have rewritten files + manifest; re-resolve so push sees disk.
  const previousAfterPull = await readVaultManifest(vaultRoot);
  const listingAfterPull = await resolveLocalMarkdownListing(
    vaultRoot,
    previousAfterPull,
  );
  const push = await pushVaultToPeer({
    ...options,
    tick: {
      vaultRoot,
      localFiles: listingAfterPull.files,
      previous: previousAfterPull,
    },
  });
  return { pull, push };
}

/** Used by routes when vault root must exist. */
export async function requireVaultRoot(): Promise<string> {
  return resolveVaultPath();
}
