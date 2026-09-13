import type { BacksterosApiClient } from "@backsteros/api-client";

import { readDesktopVaultText } from "./desktop-vault";
import { createPersistedSessionLruCache } from "./session-lru-cache";

export type CachedDocumentContent = {
  content: string;
  contentVersion: number;
  /** Full sha256 from GET; used to detect vault-side drift vs a warm LRU. */
  checksum?: string | null;
};

/** Skip persisting a single body larger than this; RAM still keeps it. */
const MAX_PERSISTED_BODY_CHARS = 400_000;

/**
 * True when a warm LRU entry must not be trusted as Tier D truth — missing
 * checksum (pre-v2 cache) or checksum drifted from the last known server etag.
 */
export function shouldMissDocumentContentCache(
  cached: CachedDocumentContent | null | undefined,
  knownChecksum?: string | null,
): boolean {
  if (!cached) return true;
  if (cached.checksum == null || cached.checksum === "") return true;
  if (knownChecksum == null || knownChecksum === "") return false;
  return cached.checksum !== knownChecksum;
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
 * 1. Warm session LRU when checksum is trusted
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
    return cached;
  }

  // Desktop vault file — same local-first idea as task descriptions in SQLite.
  const storageKey = options?.storageKey?.trim();
  if (storageKey) {
    const vaultBody = await readDesktopVaultText(client, storageKey);
    if (vaultBody != null) {
      const entry: CachedDocumentContent = {
        content: vaultBody,
        contentVersion:
          typeof options?.contentVersion === "number" &&
          Number.isFinite(options.contentVersion)
            ? options.contentVersion
            : 1,
        checksum: options?.knownChecksum ?? null,
      };
      contentCache.set(documentId, entry);
      return entry;
    }
  }

  return fetchDocumentContentViaRest(client, documentId);
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
  const cached = contentCache.peek(id);
  if (cached && !shouldMissDocumentContentCache(cached, options?.knownChecksum)) {
    return;
  }
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
