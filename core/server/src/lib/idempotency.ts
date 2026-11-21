/**
 * Idempotency-Key cache for POST create routes (OS-64).
 * Keyed by API key id + client key; entries expire after 24h.
 * Concurrent retries with the same key await the in-flight request.
 * Durable store: Postgres `idempotency_keys` (+ in-memory L1 for same process).
 */

import { and, eq, lt } from "drizzle-orm";

import { db } from "../db/index.js";
import { idempotencyKeys } from "../db/schema.js";

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

function purgeExpiredMemory(now = Date.now()): void {
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

function isMissingRelationError(error: unknown): boolean {
  let current: unknown = error;
  for (let i = 0; i < 4 && current; i++) {
    if (
      current &&
      typeof current === "object" &&
      "code" in current &&
      (current as { code?: string }).code === "42P01"
    ) {
      return true;
    }
    current =
      current && typeof current === "object" && "cause" in current
        ? (current as { cause?: unknown }).cause
        : undefined;
  }
  return false;
}

async function pruneExpiredRows(): Promise<void> {
  // Opportunistic ~10% of writes — keep the table small without a cron.
  if (Math.random() > 0.1) return;
  try {
    await db
      .delete(idempotencyKeys)
      .where(lt(idempotencyKeys.expiresAt, new Date()));
  } catch (error) {
    if (!isMissingRelationError(error)) throw error;
  }
}

export async function getIdempotentResponse(
  scope: string,
  key: string,
): Promise<IdempotentResponse | null> {
  purgeExpiredMemory();
  const mem = cache.get(cacheKey(scope, key));
  if (mem) {
    if (mem.expiresAt <= Date.now()) {
      cache.delete(cacheKey(scope, key));
    } else {
      return { status: mem.status, body: mem.body };
    }
  }

  try {
    const [row] = await db
      .select({
        status: idempotencyKeys.status,
        body: idempotencyKeys.body,
        expiresAt: idempotencyKeys.expiresAt,
      })
      .from(idempotencyKeys)
      .where(
        and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)),
      )
      .limit(1);

    if (!row) return null;
    if (row.expiresAt.getTime() <= Date.now()) {
      await db
        .delete(idempotencyKeys)
        .where(
          and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)),
        );
      return null;
    }

    const response = { status: row.status, body: row.body };
    cache.set(cacheKey(scope, key), {
      ...response,
      expiresAt: row.expiresAt.getTime(),
    });
    return response;
  } catch (error) {
    // Pre-migration: keep process-local cache only.
    if (isMissingRelationError(error)) return null;
    throw error;
  }
}

export async function setIdempotentResponse(
  scope: string,
  key: string,
  response: IdempotentResponse,
): Promise<void> {
  const expiresAt = new Date(Date.now() + TTL_MS);
  purgeExpiredMemory();
  cache.set(cacheKey(scope, key), {
    ...response,
    expiresAt: expiresAt.getTime(),
  });

  try {
    await db
      .insert(idempotencyKeys)
      .values({
        scope,
        key,
        status: response.status,
        body: response.body as object,
        expiresAt,
      })
      .onConflictDoNothing({
        target: [idempotencyKeys.scope, idempotencyKeys.key],
      });
    await pruneExpiredRows();
  } catch (error) {
    if (!isMissingRelationError(error)) throw error;
  }
}

/**
 * Run `fn` once per (scope, key). Retries while the first call is in flight
 * receive the same result; completed results are cached for 24h (Postgres + mem).
 */
export async function withIdempotency(
  scope: string,
  key: string,
  fn: () => Promise<IdempotentResponse>,
): Promise<IdempotentResponse> {
  const cached = await getIdempotentResponse(scope, key);
  if (cached) return cached;

  const existing = inflight.get(cacheKey(scope, key));
  if (existing) return existing;

  const promise = (async () => {
    try {
      // Re-check DB in case another process won the race.
      const again = await getIdempotentResponse(scope, key);
      if (again) return again;

      const result = await fn();
      await setIdempotentResponse(scope, key, result);
      return result;
    } finally {
      inflight.delete(cacheKey(scope, key));
    }
  })();

  inflight.set(cacheKey(scope, key), promise);
  return promise;
}

/** Test helper — clear memory cache between cases (does not truncate Postgres). */
export function clearIdempotencyCacheForTests(): void {
  cache.clear();
  inflight.clear();
}

/** Test helper — delete a scope/key row from Postgres. */
export async function deleteIdempotencyRowForTests(
  scope: string,
  key: string,
): Promise<void> {
  await db
    .delete(idempotencyKeys)
    .where(
      and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)),
    );
}

/** Exported for tests that assert TTL semantics. */
export const IDEMPOTENCY_TTL_MS = TTL_MS;
