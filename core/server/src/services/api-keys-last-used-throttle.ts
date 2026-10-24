/** Min gap between last-used writes for the same key (per process). */
export const LAST_USED_TOUCH_INTERVAL_MS = 60_000;
/** Cap in-memory throttle entries so long-lived processes cannot grow unboundedly. */
export const LAST_USED_TOUCH_MAX_ENTRIES = 2_048;

/**
 * Insertion-ordered Map used as a crude LRU: re-set moves a key to the end;
 * eviction drops from the front (least recently remembered).
 */
const lastUsedTouchAt = new Map<string, number>();

export function shouldSkipApiKeyLastUsedTouch(
  apiKeyId: string,
  nowMs: number = Date.now(),
): boolean {
  const previous = lastUsedTouchAt.get(apiKeyId) ?? 0;
  return nowMs - previous < LAST_USED_TOUCH_INTERVAL_MS;
}

export function rememberApiKeyLastUsedTouch(
  apiKeyId: string,
  nowMs: number = Date.now(),
): void {
  // Delete-before-set so a re-touch moves the entry to the Map's end (LRU).
  if (lastUsedTouchAt.has(apiKeyId)) {
    lastUsedTouchAt.delete(apiKeyId);
  }
  lastUsedTouchAt.set(apiKeyId, nowMs);
  while (lastUsedTouchAt.size > LAST_USED_TOUCH_MAX_ENTRIES) {
    const oldest = lastUsedTouchAt.keys().next().value;
    if (oldest == null) break;
    lastUsedTouchAt.delete(oldest);
  }
}

export function clearApiKeyLastUsedTouch(apiKeyId: string): void {
  lastUsedTouchAt.delete(apiKeyId);
}

export function resetApiKeyLastUsedThrottleForTests(): void {
  lastUsedTouchAt.clear();
}

/** Test helper — current throttle map size after remember/evict. */
export function apiKeyLastUsedThrottleSizeForTests(): number {
  return lastUsedTouchAt.size;
}

/** Test helper — whether a key is still present in the throttle map. */
export function apiKeyLastUsedThrottleHasForTests(apiKeyId: string): boolean {
  return lastUsedTouchAt.has(apiKeyId);
}

/** Test helper — fill the throttle map without hitting the database. */
export function fillApiKeyLastUsedThrottleForTests(count: number): void {
  const now = Date.now();
  for (let i = 0; i < count; i += 1) {
    rememberApiKeyLastUsedTouch(`throttle-fill-${i}`, now);
  }
}
