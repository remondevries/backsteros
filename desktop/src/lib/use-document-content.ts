import { useCallback, useEffect, useState } from "react";

import { useDesktopApi } from "./api-context";
import {
  fetchDocumentContent,
  peekDocumentContentCache,
  writeDocumentContentCache,
} from "./document-content-cache";
import { usePowerSyncQuery } from "./powersync-context";

export {
  peekDocumentContentCache,
  prefetchDocumentContent,
} from "./document-content-cache";

function asContentVersion(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Load / save document markdown via `/api/v1/documents/:id/content`.
 *
 * - `loading` — no body for this id yet (cold open / day switch)
 * - `refreshing` — revalidate while showing cached body for the *same* id
 * - persisted LRU + shared inflight with `prefetchDocumentContent`
 * - keeps the body in the bounded LRU after leave (return visits / reload)
 * - when PowerSync `content_version` advances past the local body version,
 *   refetch Tier D content (live refresh across clients)
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
    /** When false, keep the last body and do not fetch (hidden keep-alive). */
    enabled?: boolean;
  },
) {
  const keepPreviousOnMiss = options?.keepPreviousOnMiss === true;
  const skeletonUntilFetched = options?.skeletonUntilFetched === true;
  const enabled = options?.enabled !== false;
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

  const syncedVersionRows = usePowerSyncQuery<Record<string, unknown>>(
    enabled && documentId
      ? "SELECT content_version FROM documents WHERE id = ?"
      : null,
    enabled && documentId ? [documentId] : [],
  );
  const syncedContentVersion = asContentVersion(
    syncedVersionRows.data?.[0]?.content_version ??
      syncedVersionRows.data?.[0]?.contentVersion,
  );

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
    if (!documentId || !enabled) {
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
        // Keep the bounded session LRU — discarding here made every
        // return visit wait on the network again (journal 1.6s + 510ms).
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
    };
  }, [client, documentId, enabled, keepPreviousOnMiss, skeletonUntilFetched]);

  // Remote save bumped content_version in PowerSync — refetch Tier D body.
  useEffect(() => {
    if (!documentId || !enabled) return;
    if (syncedContentVersion == null || contentVersion == null) return;
    if (syncedContentVersion <= contentVersion) return;

    let cancelled = false;
    const fetchId = documentId;
    setRefreshing(true);
    void fetchDocumentContent(client, fetchId, { force: true }).then((data) => {
      if (cancelled || !data) {
        if (!cancelled) setRefreshing(false);
        return;
      }
      setInitialBody(data.content);
      setContentVersion(data.contentVersion);
      setRefreshing(false);
    });

    return () => {
      cancelled = true;
    };
  }, [client, contentVersion, documentId, enabled, syncedContentVersion]);

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
