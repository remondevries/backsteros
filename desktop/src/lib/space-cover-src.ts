import { startTransition, useEffect, useMemo, useState } from "react";

import { useDesktopApi } from "./api-context";

type CoverEntity = {
  id: string;
  coverStorageKey?: string | null;
  updatedAt?: number | null;
};

const coverObjectUrlCache = new Map<string, string>();
/** Instant previews from a just-picked file (before metadata/sync catches up). */
const coverPreviewById = new Map<string, string>();
const coverPreviewListeners = new Set<() => void>();

function coverCacheKey(entry: CoverEntity): string {
  return `${entry.id}:${entry.coverStorageKey}:${entry.updatedAt ?? 0}`;
}

function urlsEqual(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}

function cachedCoverUrls(
  targets: CoverEntity[],
): Record<string, string> | null {
  const next: Record<string, string> = {};
  for (const entry of targets) {
    const url = coverObjectUrlCache.get(coverCacheKey(entry));
    if (!url) return null;
    next[entry.id] = url;
  }
  return next;
}

function notifyCoverPreviewListeners() {
  for (const listener of coverPreviewListeners) listener();
}

function revokeIfUnused(url: string) {
  for (const cached of coverObjectUrlCache.values()) {
    if (cached === url) return;
  }
  for (const preview of coverPreviewById.values()) {
    if (preview === url) return;
  }
  URL.revokeObjectURL(url);
}

/**
 * Show a picked cover image immediately (card + settings panel).
 * Call before/while the upload runs.
 */
export function rememberDesktopSpaceCoverPreview(
  spaceId: string,
  blob: Blob,
): string {
  const previous = coverPreviewById.get(spaceId);
  const objectUrl = URL.createObjectURL(blob);
  coverPreviewById.set(spaceId, objectUrl);
  if (previous && previous !== objectUrl) {
    revokeIfUnused(previous);
  }
  notifyCoverPreviewListeners();
  return objectUrl;
}

/** Drop an optimistic preview (e.g. after remove or failed upload). */
export function clearDesktopSpaceCoverPreview(spaceId: string) {
  const previous = coverPreviewById.get(spaceId);
  if (!previous) return;
  coverPreviewById.delete(spaceId);
  revokeIfUnused(previous);
  notifyCoverPreviewListeners();
}

/**
 * Seed the durable cache from an uploaded blob so the next metadata tick
 * does not flash while re-downloading the same image. Keeps the optimistic
 * preview until documents list metadata catches up.
 */
export function rememberDesktopSpaceCover(
  entry: CoverEntity,
  blob: Blob,
): string {
  const objectUrl = URL.createObjectURL(blob);
  if (entry.coverStorageKey) {
    const key = coverCacheKey(entry);
    const previous = coverObjectUrlCache.get(key);
    coverObjectUrlCache.set(key, objectUrl);
    if (previous && previous !== objectUrl) {
      revokeIfUnused(previous);
    }
  }
  const previousPreview = coverPreviewById.get(entry.id);
  coverPreviewById.set(entry.id, objectUrl);
  if (previousPreview && previousPreview !== objectUrl) {
    revokeIfUnused(previousPreview);
  }
  notifyCoverPreviewListeners();
  return objectUrl;
}

function mergeCoverPreviewUrls(
  base: Record<string, string>,
): Record<string, string> {
  if (coverPreviewById.size === 0) return base;
  const next = { ...base };
  for (const [id, url] of coverPreviewById) {
    if (!next[id]) next[id] = url;
  }
  return next;
}

/**
 * Resolve space cover blob URLs for folders that have `coverStorageKey`.
 * Optimistic file-pick previews overlay until metadata catches up.
 */
export function useDesktopSpaceCoverSrcMap(
  entities: CoverEntity[],
): Record<string, string> {
  const { client } = useDesktopApi();
  const [previewTick, setPreviewTick] = useState(0);
  const fingerprint = useMemo(
    () =>
      entities
        .filter((entry) => entry.coverStorageKey)
        .map(
          (entry) =>
            `${entry.id}:${entry.coverStorageKey}:${entry.updatedAt ?? 0}`,
        )
        .sort()
        .join("|"),
    [entities],
  );
  const cached = useMemo(() => {
    const currentTargets = entities.filter((entry) => entry.coverStorageKey);
    return currentTargets.length === 0
      ? {}
      : cachedCoverUrls(currentTargets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);
  const [urls, setUrls] = useState<Record<string, string>>(() => cached ?? {});

  useEffect(() => {
    const bump = () => setPreviewTick((tick) => tick + 1);
    coverPreviewListeners.add(bump);
    return () => {
      coverPreviewListeners.delete(bump);
    };
  }, []);

  useEffect(() => {
    const targets = entities.filter((entry) => entry.coverStorageKey);
    if (targets.length === 0) {
      setUrls((current) => (Object.keys(current).length === 0 ? current : {}));
      return;
    }
    const fromCache = cachedCoverUrls(targets);
    if (fromCache) {
      setUrls((current) => (urlsEqual(current, fromCache) ? current : fromCache));
      for (const entry of targets) {
        if (fromCache[entry.id] && coverPreviewById.has(entry.id)) {
          clearDesktopSpaceCoverPreview(entry.id);
        }
      }
      return;
    }

    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        targets.map(async (entry) => {
          try {
            const blob = await client.downloadSpaceCover(entry.id);
            const objectUrl = URL.createObjectURL(blob);
            const key = coverCacheKey(entry);
            const previous = coverObjectUrlCache.get(key);
            if (previous && previous !== objectUrl) {
              revokeIfUnused(previous);
            }
            coverObjectUrlCache.set(key, objectUrl);
            next[entry.id] = objectUrl;
          } catch {
            // Missing/unauthorized cover — skip.
          }
        }),
      );
      if (cancelled) return;
      startTransition(() => {
        setUrls((current) => (urlsEqual(current, next) ? current : next));
      });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, fingerprint]);

  return useMemo(
    () => mergeCoverPreviewUrls(urls),
    [urls, previewTick],
  );
}
