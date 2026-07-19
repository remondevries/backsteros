import type { BacksterosApiClient } from "@backsteros/api-client";

import { createSessionLruCache } from "./session-lru-cache";

export type CachedDocumentContent = {
  content: string;
  contentVersion: number;
};

/** Bounded warm cache for Tier D markdown (hover / j-k prefetch). Not PowerSync. */
const contentCache = createSessionLruCache<CachedDocumentContent>(32);

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

/**
 * Warm the session content cache. Safe to call from hover / j-k highlight.
 * No-ops when already cached; dedupes concurrent requests for the same id.
 */
export function prefetchDocumentContent(
  client: BacksterosApiClient,
  documentId: string | null | undefined,
): void {
  const id = documentId?.trim();
  if (!id) return;
  if (contentCache.peek(id)) return;
  if (inflight.has(id)) return;

  const request = client
    .requestJson<{ content: string; contentVersion: number }>(
      `/api/v1/documents/${encodeURIComponent(id)}/content`,
    )
    .then((data) => {
      const entry = {
        content: data.content,
        contentVersion: data.contentVersion,
      };
      contentCache.set(id, entry);
      return entry;
    })
    .catch(() => null)
    .finally(() => {
      inflight.delete(id);
    });

  inflight.set(id, request);
}

/** Shared with the hook so open + prefetch use the same in-flight map. */
export function fetchDocumentContent(
  client: BacksterosApiClient,
  documentId: string,
): Promise<CachedDocumentContent | null> {
  const cached = contentCache.peek(documentId);
  if (cached) return Promise.resolve(cached);

  const existing = inflight.get(documentId);
  if (existing) return existing;

  const request = client
    .requestJson<{ content: string; contentVersion: number }>(
      `/api/v1/documents/${encodeURIComponent(documentId)}/content`,
    )
    .then((data) => {
      const entry = {
        content: data.content,
        contentVersion: data.contentVersion,
      };
      contentCache.set(documentId, entry);
      return entry;
    })
    .catch(() => null)
    .finally(() => {
      inflight.delete(documentId);
    });

  inflight.set(documentId, request);
  return request;
}
