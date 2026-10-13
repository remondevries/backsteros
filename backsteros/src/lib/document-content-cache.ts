import type { BacksterosApiClient } from "@backsteros/api-client";

import {
  DESKTOP_VAULT_MISSING_MESSAGE,
  peekPersistedDesktopVaultRoot,
  readDesktopVaultText,
} from "./desktop-vault";
import { createPersistedSessionLruCache } from "./session-lru-cache";

export type CachedDocumentContent = {
  content: string;
  contentVersion: number;
  /** Full sha256 from GET; used to detect vault-side drift vs a warm LRU. */
  checksum?: string | null;
};

/** Skip persisting a single body larger than this; RAM still keeps it. */
const MAX_PERSISTED_BODY_CHARS = 400_000;

/** SHA-256 hex of UTF-8 markdown body (same digest as core document checksums). */
export async function sha256HexUtf8(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * True when a warm LRU entry must not be trusted as Tier D truth — missing
 * checksum (pre-v2 cache), no server checksum to verify against, or etag drift.
 */
export function shouldMissDocumentContentCache(
  cached: CachedDocumentContent | null | undefined,
  knownChecksum?: string | null,
): boolean {
  if (!cached) return true;
  if (cached.checksum == null || cached.checksum === "") return true;
  // Without a server checksum we cannot verify the body — fetch REST.
  if (knownChecksum == null || knownChecksum === "") return true;
  return cached.checksum !== knownChecksum;
}

/**
 * True when the stored checksum does not match sha256(content). Catches
 * poisoned LRU entries that copied a server etag onto a different body.
 */
export async function isDocumentContentChecksumCorrupt(
  cached: CachedDocumentContent | null | undefined,
): Promise<boolean> {
  if (!cached) return true;
  const expected = cached.checksum?.trim();
  if (!expected) return true;
  const actual = await sha256HexUtf8(cached.content);
  return actual !== expected;
}

/** Bounded warm cache for document markdown (hover / j-k prefetch). */
const contentCache = createPersistedSessionLruCache<CachedDocumentContent>({
  limit: 32,
  storageKey: "backsteros:doc-content-v2",
  maxValueChars: MAX_PERSISTED_BODY_CHARS,
});

/** In-flight prefeches/fetches so hover + open share one request. */
const inflight = new Map<string, Promise<CachedDocumentContent | null>>();

export function peekDocumentContentCache(
  documentId: string,
): CachedDocumentContent | null {
  return contentCache.peek(documentId);
}

export function writeDocumentContentCache(
  documentId: string,
  entry: CachedDocumentContent,
): void {
  contentCache.set(documentId, entry);
}

/** Drop a body when leaving its detail screen (docs/07-performance.md). */
export function discardDocumentContentCache(documentId: string): void {
  contentCache.delete(documentId);
  inflight.delete(documentId);
}

function entryFromResponse(data: {
  content: string;
  contentVersion: number;
  checksum?: string | null;
}): CachedDocumentContent {
  return {
    content: data.content,
    contentVersion: data.contentVersion,
    checksum: data.checksum ?? null,
  };
}

export type FetchDocumentContentOptions = {
  force?: boolean;
  /** When set (e.g. PowerSync checksum), drop LRU if it drifted. */
  knownChecksum?: string | null;
  /** Vault-relative key from PowerSync / API metadata. */
  storageKey?: string | null;
  /** PowerSync content_version — used when painting from a vault file. */
  contentVersion?: number | null;
};

async function fetchDocumentContentViaRest(
  client: BacksterosApiClient,
  documentId: string,
): Promise<CachedDocumentContent | null> {
  try {
    const data = await client.requestJson<{
      content: string;
      contentVersion: number;
      checksum?: string | null;
    }>(`/api/v1/documents/${encodeURIComponent(documentId)}/content`);
    const entry = entryFromResponse(data);
    contentCache.set(documentId, entry);
    return entry;
  } catch (error) {
    console.warn(
      `[document-content] failed to fetch ${documentId}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Local-first document body load (Tasks-shaped):
 * 1. Warm session LRU when checksum is trusted and matches the body
 * 2. Desktop vault file via storageKey (same disk Obsidian uses)
 * 3. REST only as cold fallback / force refresh
 */
async function resolveDocumentContent(
  client: BacksterosApiClient,
  documentId: string,
  options?: FetchDocumentContentOptions,
): Promise<CachedDocumentContent | null> {
  // Live refresh (SSE / version bump): go to REST so we don't paint a
  // stale local vault file while cloud→desktop replication catches up.
  if (options?.force) {
    return fetchDocumentContentViaRest(client, documentId);
  }

  const cached = contentCache.peek(documentId);
  if (
    cached &&
    !shouldMissDocumentContentCache(cached, options?.knownChecksum)
  ) {
    if (!(await isDocumentContentChecksumCorrupt(cached))) {
      return cached;
    }
    // Poisoned entry: etag matched PowerSync but body did not. Drop and reload.
    contentCache.delete(documentId);
  }

  // Desktop vault file — only when we have a server checksum to verify against.
  // Never stamp syncedContentVersion onto an unverified vault body.
  const storageKey = options?.storageKey?.trim();
  const known = options?.knownChecksum?.trim() || null;
  if (storageKey && known) {
    const vaultBody = await readDesktopVaultText(client, storageKey);
    if (vaultBody != null) {
      const bodyChecksum = await sha256HexUtf8(vaultBody);
      // Never attach a server etag to a different vault body — that poisons the
      // LRU so later opens skip REST/vault forever.
      if (known !== bodyChecksum) {
        console.warn(
          `[document-content] vault body checksum mismatch for ${documentId}; falling back to REST`,
        );
      } else {
        const entry: CachedDocumentContent = {
          content: vaultBody,
          contentVersion:
            typeof options?.contentVersion === "number" &&
            Number.isFinite(options.contentVersion)
              ? options.contentVersion
              : 1,
          checksum: known,
        };
        contentCache.set(documentId, entry);
        return entry;
      }
    }
  }

  return fetchDocumentContentViaRest(client, documentId);
}

export function documentOpenUnavailableMessage(): string {
  return peekPersistedDesktopVaultRoot()
    ? "Could not open this file from the working copy or cloud storage."
    : DESKTOP_VAULT_MISSING_MESSAGE;
}

/**
 * Warm the session content cache. Safe to call from hover / j-k highlight.
 * Prefers vault/local cache; REST only on miss.
 */
export function prefetchDocumentContent(
  client: BacksterosApiClient,
  documentId: string | null | undefined,
  options?: Omit<FetchDocumentContentOptions, "force">,
): void {
  const id = documentId?.trim();
  if (!id) return;
  // Always go through resolve so body↔checksum poison is detected (a sync
  // shouldMiss hit alone is not enough).
  if (inflight.has(id)) return;

  const request = resolveDocumentContent(client, id, options).finally(() => {
    inflight.delete(id);
  });
  inflight.set(id, request);
}

/**
 * Shared with the hook so open + prefetch use the same in-flight map.
 * Local vault / warm LRU first; REST when forced or no local body.
 */
export function fetchDocumentContent(
  client: BacksterosApiClient,
  documentId: string,
  options?: FetchDocumentContentOptions,
): Promise<CachedDocumentContent | null> {
  if (options?.force) {
    contentCache.delete(documentId);
    inflight.delete(documentId);
  } else {
    const cached = contentCache.peek(documentId);
    if (shouldMissDocumentContentCache(cached, options?.knownChecksum)) {
      if (cached) contentCache.delete(documentId);
    }
    const existing = inflight.get(documentId);
    if (existing) return existing;
  }

  const request = resolveDocumentContent(client, documentId, options).finally(
    () => {
      inflight.delete(documentId);
    },
  );
  inflight.set(documentId, request);
  return request;
}
