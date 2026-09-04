import { useCallback, useEffect, useRef, useState } from "react";

import { useDesktopApi } from "./api-context";
import {
  discardDocumentContentCache,
  fetchDocumentContent,
  peekDocumentContentCache,
  writeDocumentContentCache,
} from "./document-content-cache";
import { usePowerSyncQuery } from "./powersync-context";
import { DOCUMENT_VERSION_ROW_COMPARATOR } from "./powersync-row-comparators";
import {
  WORKSPACE_DOCUMENT_UPDATED_EVENT,
  type WorkspaceDocumentUpdatedDetail,
} from "./workspace-events";

export {
  peekDocumentContentCache,
  prefetchDocumentContent,
} from "./document-content-cache";

/** Coalesce bursty agent patches into one Tier D refetch. */
const SSE_REFETCH_DEBOUNCE_MS = 150;

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
 * - **primary live path:** workspace SSE (agent writes) → force GET (no
 *   PowerSync wait). Dirty edit drafts are preserved by the markdown editor.
 * - **fallback:** PowerSync `content_version` advance → force GET
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
  const contentVersionRef = useRef(contentVersion);
  contentVersionRef.current = contentVersion;

  const syncedVersionRows = usePowerSyncQuery<Record<string, unknown>>(
    enabled && documentId
      ? "SELECT content_version FROM documents WHERE id = ?"
      : null,
    enabled && documentId ? [documentId] : [],
    { rowComparator: DOCUMENT_VERSION_ROW_COMPARATOR },
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

  // Primary live path: agent/vault SSE → force Tier D refetch (no PowerSync wait).
  useEffect(() => {
    if (!documentId || !enabled) return;

    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const onDocumentUpdated = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceDocumentUpdatedDetail>)
        .detail;
      if (!detail || detail.documentId !== documentId) return;
      // Metadata-only events (move/rename) have no contentVersion — skip body GET.
      if (detail.contentVersion == null) return;
      // Skip if we already have this version (or newer) locally.
      if (
        contentVersionRef.current != null &&
        detail.contentVersion <= contentVersionRef.current
      ) {
        return;
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (cancelled) return;
        const fetchId = documentId;
        discardDocumentContentCache(fetchId);
        setRefreshing(true);
        void fetchDocumentContent(client, fetchId, { force: true }).then(
          (data) => {
            if (cancelled || !data) {
              if (!cancelled) setRefreshing(false);
              return;
            }
            setInitialBody(data.content);
            setContentVersion(data.contentVersion);
            setRefreshing(false);
          },
        );
      }, SSE_REFETCH_DEBOUNCE_MS);
    };

    window.addEventListener(WORKSPACE_DOCUMENT_UPDATED_EVENT, onDocumentUpdated);
    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener(
        WORKSPACE_DOCUMENT_UPDATED_EVENT,
        onDocumentUpdated,
      );
    };
  }, [client, documentId, enabled]);

  // Fallback: PowerSync content_version advanced (SSE missed / offline catch-up).
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
        checksum?: string | null;
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
        checksum: data.checksum ?? null,
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
