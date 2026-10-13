import { startTransition, useEffect, useMemo, useState } from "react";

import { fetchBacksterosAvatar } from "./client";

type AvatarEntity = {
  readonly id: string;
  readonly avatarStorageKey?: string | null;
};

type AvatarKind = "contact" | "organization";

const avatarObjectUrlCache = new Map<string, string>();

function avatarCacheKey(kind: AvatarKind, entry: AvatarEntity): string {
  return `${kind}:${entry.id}:${entry.avatarStorageKey ?? ""}`;
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

function cachedAvatarUrls(
  kind: AvatarKind,
  targets: readonly AvatarEntity[],
): Record<string, string> | null {
  const next: Record<string, string> = {};
  for (const entry of targets) {
    const url = avatarObjectUrlCache.get(avatarCacheKey(kind, entry));
    if (!url) return null;
    next[entry.id] = url;
  }
  return next;
}

/**
 * Resolve avatar object URLs for entities that have `avatarStorageKey`.
 * Mirrors BacksterOS desktop `useDesktopAvatarSrcMap` (blob + session cache).
 */
export function useBacksterosAvatarSrcMap(
  kind: AvatarKind,
  entities: readonly AvatarEntity[],
): Record<string, string> {
  const fingerprint = useMemo(
    () =>
      entities
        .filter((entry) => entry.avatarStorageKey)
        .map((entry) => `${entry.id}:${entry.avatarStorageKey}`)
        .sort()
        .join("|"),
    [entities],
  );

  const cached = useMemo(() => {
    const targets = entities.filter((entry) => entry.avatarStorageKey);
    return targets.length === 0 ? {} : cachedAvatarUrls(kind, targets);
    // fingerprint covers identity; entities used for cache lookup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, kind]);

  const [urls, setUrls] = useState<Record<string, string>>(() => cached ?? {});

  useEffect(() => {
    const targets = entities.filter((entry) => entry.avatarStorageKey);
    if (targets.length === 0) {
      setUrls((current) => (Object.keys(current).length === 0 ? current : {}));
      return;
    }

    const fromCache = cachedAvatarUrls(kind, targets);
    if (fromCache) {
      setUrls((current) => (urlsEqual(current, fromCache) ? current : fromCache));
      return;
    }

    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        targets.map(async (entry) => {
          const key = avatarCacheKey(kind, entry);
          const existing = avatarObjectUrlCache.get(key);
          if (existing) {
            next[entry.id] = existing;
            return;
          }
          try {
            const blob = await fetchBacksterosAvatar(kind, entry.id);
            if (cancelled) return;
            const url = URL.createObjectURL(blob);
            avatarObjectUrlCache.set(key, url);
            next[entry.id] = url;
          } catch {
            // Missing/unauthorized avatar — keep glyph fallback.
          }
        }),
      );
      if (!cancelled) {
        startTransition(() => {
          setUrls((current) => (urlsEqual(current, next) ? current : next));
        });
      }
    })();

    return () => {
      cancelled = true;
    };
    // fingerprint encodes the entity set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, kind]);

  return urls;
}

/** Contact-only alias used by assignee UI. */
export function useBacksterosContactAvatarSrcMap(
  entities: readonly AvatarEntity[],
): Record<string, string> {
  return useBacksterosAvatarSrcMap("contact", entities);
}
