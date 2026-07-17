import type { MentionCatalog } from "./mention-menu-types";

const TTL_MS = 30_000;
const MAX_ENTRIES = 100;

type CacheEntry = {
  expiresAt: number;
  catalog: MentionCatalog;
};

const cache = new Map<string, CacheEntry>();

export async function getCachedMentionCatalog(
  cacheKey: string,
  loader: () => Promise<MentionCatalog>,
): Promise<MentionCatalog> {
  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > now) {
    return hit.catalog;
  }

  const catalog = await loader();
  cache.set(cacheKey, { expiresAt: now + TTL_MS, catalog });

  if (cache.size > MAX_ENTRIES) {
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now) {
        cache.delete(key);
      }
    }
  }

  return catalog;
}
