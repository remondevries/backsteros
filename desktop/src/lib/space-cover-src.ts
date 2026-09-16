import { startTransition, useEffect, useMemo, useState } from "react";

import { useDesktopApi } from "./api-context";

type CoverEntity = {
  id: string;
  coverStorageKey?: string | null;
  updatedAt?: number | null;
};

/** Exact versioned key — used after a successful download for this metadata. */
const coverObjectUrlCache = new Map<string, string>();
/**
 * Latest blob URL per space+storage key (ignores document updatedAt).
 * Lets the UI paint immediately when only unrelated metadata changed.
 */
const coverObjectUrlByIdentity = new Map<string, string>();
/** Instant previews from a just-picked file (before metadata/sync catches up). */
const coverPreviewById = new Map<string, string>();
const coverPreviewListeners = new Set<() => void>();

function coverIdentityKey(entry: CoverEntity): string {
  return `${entry.id}:${entry.coverStorageKey ?? ""}`;
}

function coverCacheKey(entry: CoverEntity): string {
  return `${coverIdentityKey(entry)}:${entry.updatedAt ?? 0}`;
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

function lookupCachedCoverUrl(entry: CoverEntity): string | undefined {
  const exact = coverObjectUrlCache.get(coverCacheKey(entry));
  if (exact) return exact;
  return coverObjectUrlByIdentity.get(coverIdentityKey(entry));
}

/** Partial map of whatever is already in the session RAM cache. */
function partialCachedCoverUrls(
  targets: CoverEntity[],
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const entry of targets) {
    const url = lookupCachedCoverUrl(entry);
    if (url) next[entry.id] = url;
  }
  return next;
}

function storeCoverObjectUrl(entry: CoverEntity, objectUrl: string) {
  const versioned = coverCacheKey(entry);
  const identity = coverIdentityKey(entry);
  const previousVersioned = coverObjectUrlCache.get(versioned);
  const previousIdentity = coverObjectUrlByIdentity.get(identity);
  coverObjectUrlCache.set(versioned, objectUrl);
  coverObjectUrlByIdentity.set(identity, objectUrl);
  if (previousVersioned && previousVersioned !== objectUrl) {
    revokeIfUnused(previousVersioned);
  }
  if (
    previousIdentity &&
    previousIdentity !== objectUrl &&
    previousIdentity !== previousVersioned
  ) {
    revokeIfUnused(previousIdentity);
  }
}

function notifyCoverPreviewListeners() {
  for (const listener of coverPreviewListeners) listener();
}

function revokeIfUnused(url: string) {
  for (const cached of coverObjectUrlCache.values()) {
    if (cached === url) return;
  }
  for (const cached of coverObjectUrlByIdentity.values()) {
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
    storeCoverObjectUrl(entry, objectUrl);
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
 * Session RAM cache paints immediately (incl. stale-while-revalidate when only
 * document `updatedAt` changed); missing covers download one-by-one.
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
  const cachedPartial = useMemo(() => {
    const currentTargets = entities.filter((entry) => entry.coverStorageKey);
    return partialCachedCoverUrls(currentTargets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);
  const [urls, setUrls] = useState<Record<string, string>>(
    () => cachedPartial,
  );

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

    const partial = partialCachedCoverUrls(targets);
    setUrls((current) => (urlsEqual(current, partial) ? current : partial));

    for (const entry of targets) {
      if (
        coverObjectUrlCache.has(coverCacheKey(entry)) &&
        coverPreviewById.has(entry.id)
      ) {
        clearDesktopSpaceCoverPreview(entry.id);
      }
    }

    const missing = targets.filter(
      (entry) => !coverObjectUrlCache.has(coverCacheKey(entry)),
    );
    if (missing.length === 0) return;

    let cancelled = false;
    void (async () => {
      await Promise.all(
        missing.map(async (entry) => {
          try {
            const blob = await client.downloadSpaceCover(entry.id);
            if (cancelled) return;
            const objectUrl = URL.createObjectURL(blob);
            storeCoverObjectUrl(entry, objectUrl);
            startTransition(() => {
              setUrls((current) => {
                if (current[entry.id] === objectUrl) return current;
                return { ...current, [entry.id]: objectUrl };
              });
            });
            if (coverPreviewById.has(entry.id)) {
              clearDesktopSpaceCoverPreview(entry.id);
            }
          } catch {
            // Missing/unauthorized cover — keep stale cache if any.
          }
        }),
      );
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
