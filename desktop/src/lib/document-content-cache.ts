import type { BacksterosApiClient } from "@backsteros/api-client";

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

/** Bounded warm cache for Tier D markdown (hover / j-k prefetch). Not PowerSync. */
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

/**
 * Warm the session content cache. Safe to call from hover / j-k highlight.
 * No-ops when already cached with a checksum; dedupes concurrent requests.
 */
export function prefetchDocumentContent(
  client: BacksterosApiClient,
  documentId: string | null | undefined,
): void {
  const id = documentId?.trim();
  if (!id) return;
  const cached = contentCache.peek(id);
  if (cached && !shouldMissDocumentContentCache(cached)) return;
  if (inflight.has(id)) return;

  const request = client
    .requestJson<{
      content: string;
      contentVersion: number;
      checksum?: string | null;
    }>(`/api/v1/documents/${encodeURIComponent(id)}/content`)
    .then((data) => {
      const entry = entryFromResponse(data);
      contentCache.set(id, entry);
      return entry;
    })
    .catch((error) => {
      console.warn(
        `[document-content] failed to fetch ${id}:`,
        error instanceof Error ? error.message : error,
      );
      return null;
    })
    .finally(() => {
      inflight.delete(id);
    });

  inflight.set(id, request);
}

/**
 * Shared with the hook so open + prefetch use the same in-flight map.
 *
 * Always revalidates over the network (GET heals vault disk vs content_version).
 * Peek still first-paints from the LRU; do not short-circuit fetch on a hit —
 * a stale body + matching ifMatchVersion must not overwrite a newer .md.
 */
export function fetchDocumentContent(
  client: BacksterosApiClient,
  documentId: string,
  options?: {
    force?: boolean;
    /** When set (e.g. PowerSync checksum), drop LRU if it drifted. */
    knownChecksum?: string | null;
  },
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

  const request = client
    .requestJson<{
      content: string;
      contentVersion: number;
      checksum?: string | null;
    }>(`/api/v1/documents/${encodeURIComponent(documentId)}/content`)
    .then((data) => {
      const entry = entryFromResponse(data);
      contentCache.set(documentId, entry);
      return entry;
    })
    .catch((error) => {
      console.warn(
        `[document-content] failed to fetch ${documentId}:`,
        error instanceof Error ? error.message : error,
      );
      return null;
    })
    .finally(() => {
      inflight.delete(documentId);
    });

  inflight.set(documentId, request);
  return request;
}
