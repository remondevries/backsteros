/**
 * Short TTL cache for AgentMail message/thread detail proxies.
 * Invalidated on inbound webhook and send/reply mutations.
 */

const DETAIL_TTL_MS = 3 * 60_000;
const DETAIL_MAX_ENTRIES = 64;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const detailCache = new Map<string, CacheEntry<unknown>>();

function cacheKey(
  workspaceId: string,
  inboxId: string,
  messageId: string,
): string {
  return `${workspaceId.trim()}\0${inboxId.trim()}\0${messageId.trim()}`;
}

function evictExpired(now = Date.now()): void {
  for (const [key, entry] of detailCache) {
    if (entry.expiresAt <= now) detailCache.delete(key);
  }
  while (detailCache.size > DETAIL_MAX_ENTRIES) {
    const oldest = detailCache.keys().next().value;
    if (oldest == null) break;
    detailCache.delete(oldest);
  }
}

export function peekAgentMailMessageDetailCache<T>(
  workspaceId: string,
  inboxId: string,
  messageId: string,
): T | null {
  const key = cacheKey(workspaceId, inboxId, messageId);
  const entry = detailCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    detailCache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function writeAgentMailMessageDetailCache<T>(
  workspaceId: string,
  inboxId: string,
  messageId: string,
  value: T,
): void {
  const key = cacheKey(workspaceId, inboxId, messageId);
  detailCache.set(key, {
    value,
    expiresAt: Date.now() + DETAIL_TTL_MS,
  });
  evictExpired();
}

export function invalidateAgentMailMessageDetailCache(
  workspaceId: string,
  inboxId: string,
  messageId?: string | null,
): void {
  const workspace = workspaceId.trim();
  const inbox = inboxId.trim();
  if (!workspace || !inbox) return;
  const message = messageId?.trim() || null;
  if (message) {
    detailCache.delete(cacheKey(workspace, inbox, message));
    return;
  }
  const prefix = `${workspace}\0${inbox}\0`;
  for (const key of detailCache.keys()) {
    if (key.startsWith(prefix)) detailCache.delete(key);
  }
}

/** Test helper. */
export function clearAgentMailMessageDetailCache(): void {
  detailCache.clear();
}
