import { useCallback, useEffect, useState } from "react";

import { useDesktopApi } from "./api-context";
import {
  discardDocumentContentCache,
  fetchDocumentContent,
  peekDocumentContentCache,
  writeDocumentContentCache,
} from "./document-content-cache";

export {
  peekDocumentContentCache,
  prefetchDocumentContent,
} from "./document-content-cache";

/**
 * Load / save document markdown via `/api/v1/documents/:id/content`.
 *
 * - `loading` — no body for this id yet (cold open / day switch) → skeleton
 * - `refreshing` — revalidate while showing cached body for the *same* id
 * - session LRU + shared inflight with `prefetchDocumentContent`
 * - discards this document's Tier D body when leaving the detail screen
 *
 * By default, switching document ids never keeps the previous entry's body
 * (Knowledge). Pass `keepPreviousOnMiss` to keep prior body visible.
 * Pass `skeletonUntilFetched` (Journal) to always enter `loading` on id
 * change — including cache hits — until the fetch promise settles, so the
 * UI can paint skeleton → content.
 */
export function useDesktopDocumentContent(
  documentId: string | null,
  options?: {
    keepPreviousOnMiss?: boolean;
    skeletonUntilFetched?: boolean;
  },
) {
  const keepPreviousOnMiss = options?.keepPreviousOnMiss === true;
  const skeletonUntilFetched = options?.skeletonUntilFetched === true;
  const { client } = useDesktopApi();
  const cached = documentId ? peekDocumentContentCache(documentId) : null;
  const [initialBody, setInitialBody] = useState(
    skeletonUntilFetched ? "" : (cached?.content ?? ""),
  );
  const [contentVersion, setContentVersion] = useState<number | undefined>(
    skeletonUntilFetched ? undefined : cached?.contentVersion,
  );
  const [loading, setLoading] = useState(
    Boolean(documentId) && (skeletonUntilFetched || !cached),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [activeId, setActiveId] = useState(documentId);

  if (documentId !== activeId) {
    setActiveId(documentId);
    if (!documentId) {
      setInitialBody("");
      setContentVersion(undefined);
      setLoading(false);
      setRefreshing(false);
    } else if (skeletonUntilFetched) {
      // Always skeleton on switch; cache still makes the fetch settle quickly.
      setInitialBody("");
      setContentVersion(undefined);
      setLoading(true);
      setRefreshing(false);
    } else {
      const next = peekDocumentContentCache(documentId);
      if (next) {
        setInitialBody(next.content);
        setContentVersion(next.contentVersion);
        setLoading(false);
        setRefreshing(true);
      } else if (keepPreviousOnMiss) {
        setLoading(false);
        setRefreshing(true);
      } else {
        setInitialBody("");
        setContentVersion(undefined);
        setLoading(true);
        setRefreshing(false);
      }
    }
  }

  useEffect(() => {
    if (!documentId) {
      return;
    }

    let cancelled = false;
    const fetchId = documentId;
    if (skeletonUntilFetched) {
      setLoading(true);
    } else if (peekDocumentContentCache(fetchId)) {
      setRefreshing(true);
    } else if (keepPreviousOnMiss) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    void fetchDocumentContent(client, fetchId).then((data) => {
      if (cancelled) {
        // Late fetch must not keep a body after leave / id switch.
        discardDocumentContentCache(fetchId);
        return;
      }
      if (!data) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      setInitialBody(data.content);
      setContentVersion(data.contentVersion);
      setLoading(false);
      setRefreshing(false);
    });

    return () => {
      cancelled = true;
      // Leave detail screen / switch id → drop this Tier D body (07-performance.md).
      discardDocumentContentCache(fetchId);
    };
  }, [client, documentId, keepPreviousOnMiss, skeletonUntilFetched]);

  const onSave = useCallback(
    async (content: string) => {
      if (!documentId) return;
      const data = await client.requestJson<{
        content: string;
        contentVersion: number;
      }>(`/api/v1/documents/${encodeURIComponent(documentId)}/content`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content,
          ifMatchVersion: contentVersion,
        }),
      });
      writeDocumentContentCache(documentId, {
        content: data.content,
        contentVersion: data.contentVersion,
      });
      setInitialBody(data.content);
      setContentVersion(data.contentVersion);
    },
    [client, contentVersion, documentId],
  );

  return {
    initialBody,
    onSave,
    ready: !loading,
    loading,
    refreshing,
    contentVersion,
  };
}
