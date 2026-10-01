/**
 * In-memory Idempotency-Key cache for POST create routes (OS-64).
 * Keyed by API key id + client key; entries expire after 24h.
 * Concurrent retries with the same key await the in-flight request.
 */

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_KEY_LENGTH = 256;

export type IdempotentResponse = {
  status: number;
  body: unknown;
};

type CacheEntry = IdempotentResponse & { expiresAt: number };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<IdempotentResponse>>();

function cacheKey(scope: string, key: string): string {
  return `${scope}\0${key}`;
}

function purgeExpired(now = Date.now()): void {
  for (const [k, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(k);
  }
}

/** Normalize the Idempotency-Key header; null when absent/invalid. */
export function readIdempotencyKey(
  header: string | undefined | null,
): string | null {
  if (typeof header !== "string") return null;
  const trimmed = header.trim();
  if (!trimmed || trimmed.length > MAX_KEY_LENGTH) return null;
  return trimmed;
}

export function getIdempotentResponse(
  scope: string,
  key: string,
): IdempotentResponse | null {
  purgeExpired();
  const entry = cache.get(cacheKey(scope, key));
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(cacheKey(scope, key));
    return null;
  }
  return { status: entry.status, body: entry.body };
}

export function setIdempotentResponse(
  scope: string,
  key: string,
  response: IdempotentResponse,
): void {
  purgeExpired();
  cache.set(cacheKey(scope, key), {
    ...response,
    expiresAt: Date.now() + TTL_MS,
  });
}

/**
 * Run `fn` once per (scope, key). Retries while the first call is in flight
 * receive the same result; completed results are cached for 24h.
 */
export async function withIdempotency(
  scope: string,
  key: string,
  fn: () => Promise<IdempotentResponse>,
): Promise<IdempotentResponse> {
  const cached = getIdempotentResponse(scope, key);
  if (cached) return cached;

  const existing = inflight.get(cacheKey(scope, key));
  if (existing) return existing;

  const promise = (async () => {
    try {
      const result = await fn();
      setIdempotentResponse(scope, key, result);
      return result;
    } finally {
      inflight.delete(cacheKey(scope, key));
    }
  })();

  inflight.set(cacheKey(scope, key), promise);
  return promise;
}

/** Test helper — clear cache between cases. */
export function clearIdempotencyCacheForTests(): void {
  cache.clear();
  inflight.clear();
}
