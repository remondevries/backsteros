import { startTransition, useEffect, useMemo, useState } from "react";
import { resolveOrganizationAvatarSrc } from "@backsteros/ui";

import { useDesktopApi } from "./api-context";
import { getBrandfetchClientId } from "./brandfetch";

type AvatarEntity = {
  id: string;
  avatarStorageKey?: string | null;
  avatarUpdatedAt?: number | null;
};

type AvatarKind = "contact" | "avatar_portal" | "organization" | "bank_account";

const avatarObjectUrlCache = new Map<string, string>();

function avatarCacheKey(kind: AvatarKind, entry: AvatarEntity): string {
  return `${kind}:${entry.id}:${entry.avatarStorageKey}:${entry.avatarUpdatedAt ?? 0}`;
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
  targets: AvatarEntity[],
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
 * Resolve avatar blob URLs for contacts/orgs that have `avatarStorageKey`.
 * Object URLs are cached for the session so task switches do not re-download.
 */
export function useDesktopAvatarSrcMap(
  kind: AvatarKind,
  entities: AvatarEntity[],
): Record<string, string> {
  const { client } = useDesktopApi();
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
    const currentTargets = entities.filter((entry) => entry.avatarStorageKey);
    return currentTargets.length === 0
      ? {}
      : cachedAvatarUrls(kind, currentTargets);
    // fingerprint covers entity identity; entities is read for cache lookup.
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
            const blob = await client.downloadAvatar(kind, entry.id);
            if (cancelled) return;
            const url = URL.createObjectURL(blob);
            avatarObjectUrlCache.set(key, url);
            next[entry.id] = url;
          } catch {
            // Missing/unauthorized avatar — keep fallback icon.
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
    // fingerprint encodes the entity set we care about
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, fingerprint, kind]);

  return cached ?? urls;
}

export function withAvatarSrc<T extends { id: string; avatarSrc?: string | null }>(
  entities: T[],
  srcById: Record<string, string>,
): Array<T & { avatarSrc?: string | null }> {
  return entities.map((entry) => ({
    ...entry,
    // Prefer the live blob map; keep any already-resolved src while loading.
    avatarSrc: srcById[entry.id] ?? entry.avatarSrc ?? null,
  }));
}

type OrganizationAvatarEntity = {
  id: string;
  website?: string | null;
  avatarStorageKey?: string | null;
};

/**
 * Prefer a stored/manual upload; otherwise Brandfetch from `website`.
 */
export function withOrganizationAvatarSrc<T extends OrganizationAvatarEntity>(
  entities: T[],
  uploadedById: Record<string, string>,
): Array<T & { avatarSrc?: string | null }> {
  const clientId = getBrandfetchClientId();
  return entities.map((entry) => ({
    ...entry,
    avatarSrc: resolveOrganizationAvatarSrc({
      uploadedSrc: uploadedById[entry.id] ?? null,
      avatarStorageKey: entry.avatarStorageKey,
      website: entry.website,
      brandfetchClientId: clientId,
    }),
  }));
}
