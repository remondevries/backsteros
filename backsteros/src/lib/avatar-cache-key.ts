export type AvatarCacheEntity = {
  id: string;
  avatarStorageKey?: string | null;
};

/**
 * Session blob-URL cache identity.
 * Keyed on storage key only — entity `updatedAt` must not bust the cache
 * (portal/settings patches were reloading avatars on every save).
 * Re-uploads mint a content-versioned storage key (`avatar-<checksum>`) so
 * the cache correctly misses after overwrite.
 */
export function avatarCacheKey(
  kind: string,
  entry: AvatarCacheEntity,
): string {
  return `${kind}:${entry.id}:${entry.avatarStorageKey ?? ""}`;
}
