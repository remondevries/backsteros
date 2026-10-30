import { useEffect, useMemo, useState } from "react";
import { resolveOrganizationAvatarSrc } from "@backsteros/ui";

import { useDesktopApi } from "./api-context";
import { getBrandfetchClientId } from "./brandfetch";

type AvatarEntity = {
  id: string;
  avatarStorageKey?: string | null;
  avatarUpdatedAt?: number | null;
};

type AvatarKind = "contact" | "avatar_portal" | "organization" | "bank_account";

type AvatarClient = {
  downloadAvatar: (kind: string, id: string) => Promise<Blob>;
};

const avatarObjectUrlCache = new Map<string, string>();
/** In-flight downloads so parallel hooks share one request per avatar. */
const avatarInflight = new Map<string, Promise<string | null>>();

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

/** Sync read of whatever is already in the session cache (partial OK). */
function peekCachedAvatarUrls(
  kind: AvatarKind,
  targets: AvatarEntity[],
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const entry of targets) {
    const url = avatarObjectUrlCache.get(avatarCacheKey(kind, entry));
    if (url) next[entry.id] = url;
  }
  return next;
}

async function resolveAvatarObjectUrl(
  client: AvatarClient,
  kind: AvatarKind,
  entry: AvatarEntity,
): Promise<string | null> {
  const key = avatarCacheKey(kind, entry);
  const cached = avatarObjectUrlCache.get(key);
  if (cached) return cached;

  let pending = avatarInflight.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const blob = await client.downloadAvatar(kind, entry.id);
        const url = URL.createObjectURL(blob);
        avatarObjectUrlCache.set(key, url);
        return url;
      } catch {
        return null;
      } finally {
        avatarInflight.delete(key);
      }
    })();
    avatarInflight.set(key, pending);
  }
  return pending;
}

/**
 * Resolve avatar blob URLs for contacts/orgs that have `avatarStorageKey`.
 * Object URLs are cached for the session so task switches do not re-download.
 *
 * Cached hits are returned synchronously. Missing avatars resolve one-by-one
 * (no wait-for-all, no startTransition) so notification cards can paint the
 * photo as soon as its blob lands.
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
  const targets = useMemo(() => {
    return entities.filter((entry) => entry.avatarStorageKey);
    // fingerprint covers entity identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  const peeked = useMemo(
    () => peekCachedAvatarUrls(kind, targets),
    [kind, targets],
  );
  const [urls, setUrls] = useState<Record<string, string>>(() => peeked);

  useEffect(() => {
    if (targets.length === 0) {
      setUrls((current) => (Object.keys(current).length === 0 ? current : {}));
      return;
    }

    const seeded = peekCachedAvatarUrls(kind, targets);
    setUrls((current) => (urlsEqual(current, seeded) ? current : seeded));

    const missing = targets.filter(
      (entry) => !avatarObjectUrlCache.has(avatarCacheKey(kind, entry)),
    );
    if (missing.length === 0) return;

    let cancelled = false;
    for (const entry of missing) {
      void resolveAvatarObjectUrl(client, kind, entry).then((url) => {
        if (cancelled || !url) return;
        // Apply each avatar as it arrives — do not wait for the rest.
        setUrls((current) => {
          if (current[entry.id] === url) return current;
          return { ...current, [entry.id]: url };
        });
      });
    }

    return () => {
      cancelled = true;
    };
  }, [client, fingerprint, kind, targets]);

  // Prefer live cache peek over state so a sibling hook that finished first
  // is visible on the next render without waiting for our effect.
  return useMemo(() => {
    if (Object.keys(peeked).length === 0) return urls;
    return { ...urls, ...peeked };
  }, [peeked, urls]);
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
