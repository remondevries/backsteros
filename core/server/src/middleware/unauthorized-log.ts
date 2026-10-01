/** Min gap between identical 401 audit lines (UA + key label + route). */
export const UNAUTHORIZED_LOG_INTERVAL_MS = 60_000;

/**
 * Rate-limit helper for 401 audit logs. Pure so unit tests can drive the clock.
 * Mutates `lastAt` when a line should be emitted.
 */
export function shouldEmitUnauthorizedLog(
  lastAt: Map<string, number>,
  bucket: string,
  nowMs: number,
  intervalMs: number = UNAUTHORIZED_LOG_INTERVAL_MS,
): boolean {
  const prev = lastAt.get(bucket);
  if (prev != null && nowMs - prev < intervalMs) {
    return false;
  }
  lastAt.set(bucket, nowMs);
  // Bound memory: drop stale buckets when the map grows.
  if (lastAt.size > 512) {
    for (const [key, at] of lastAt) {
      if (nowMs - at >= intervalMs * 2) {
        lastAt.delete(key);
      }
    }
  }
  return true;
}
