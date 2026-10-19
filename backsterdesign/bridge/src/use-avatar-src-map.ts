import { startTransition, useEffect, useMemo, useState } from "react";

import {
  fetchAvatar,
  type ApiContact,
  type ApiOrganization,
  type CoreConfig,
} from "./core-api.js";

type AvatarEntity = {
  id: string;
  avatarStorageKey?: string | null;
  avatarUpdatedAt?: number | string | null;
};

type AvatarKind = "contact" | "organization";

const avatarObjectUrlCache = new Map<string, string>();

function avatarCacheKey(kind: AvatarKind, entry: AvatarEntity): string {
  return `${kind}:${entry.id}:${entry.avatarStorageKey ?? ""}:${entry.avatarUpdatedAt ?? 0}`;
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
 * Resolve avatar object URLs for contacts/orgs that have `avatarStorageKey`.
 * Same blob + session-cache approach as BacksterOS desktop / BacksterDev.
 */
export function useAvatarSrcMap(
  config: CoreConfig | null,
  kind: AvatarKind,
  entities: readonly AvatarEntity[],
): Record<string, string> {
  const fingerprint = useMemo(
    () =>
      entities
        .filter((entry) => entry.avatarStorageKey)
        .map(
          (entry) =>
            `${entry.id}:${entry.avatarStorageKey}:${entry.avatarUpdatedAt ?? 0}`,
        )
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
    if (!config) {
      setUrls((current) => (Object.keys(current).length === 0 ? current : {}));
      return;
    }

    const targets = entities.filter((entry) => entry.avatarStorageKey);
    if (targets.length === 0) {
      setUrls((current) => (Object.keys(current).length === 0 ? current : {}));
      return;
    }

    const fromCache = cachedAvatarUrls(kind, targets);
    if (fromCache) {
      setUrls((current) =>
        urlsEqual(current, fromCache) ? current : fromCache,
      );
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
            const blob = await fetchAvatar(config, kind, entry.id);
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
  }, [config, fingerprint, kind]);

  return cached ?? urls;
}

export function withAvatarSrc<T extends { id: string }>(
  entities: readonly T[],
  srcById: Record<string, string>,
): Array<T & { avatarSrc?: string | null }> {
  return entities.map((entry) => ({
    ...entry,
    avatarSrc: srcById[entry.id] ?? null,
  }));
}

export type { ApiContact, ApiOrganization };
