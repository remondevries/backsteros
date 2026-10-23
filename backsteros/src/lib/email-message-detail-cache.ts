import type { BacksterosApiClient } from "@backsteros/api-client";
import type {
  AgentMailDraftDetail,
  AgentMailMessageDetail,
} from "@backsteros/contracts";

import { createPersistedSessionLruCache } from "./session-lru-cache";

function messageCacheKey(inboxId: string, messageId: string): string {
  return `${inboxId.trim()}:${messageId.trim()}`;
}

function draftCacheKey(inboxId: string, draftId: string): string {
  return `${inboxId.trim()}:draft:${draftId.trim()}`;
}

type CachedMessageDetail = {
  detail: AgentMailMessageDetail;
  cachedAt: number;
};

type CachedDraftDetail = {
  detail: AgentMailDraftDetail;
  cachedAt: number;
};

/** Soft TTL — paint cache, background-revalidate when older than this. */
export const EMAIL_DETAIL_CACHE_STALE_MS = 5 * 60_000;
/**
 * Skip persisting oversized thread HTML (RAM still holds them). ~400KB JSON
 * keeps localStorage under quota for a few dozen warm threads.
 */
const EMAIL_DETAIL_MAX_PERSIST_CHARS = 400_000;

/** Bounded warm cache for open email threads (tab switch / reload revisit). */
const messageCache = createPersistedSessionLruCache<CachedMessageDetail>({
  limit: 48,
  storageKey: "backsteros:email-message-detail-v1",
  maxValueChars: EMAIL_DETAIL_MAX_PERSIST_CHARS,
});
const draftCache = createPersistedSessionLruCache<CachedDraftDetail>({
  limit: 24,
  storageKey: "backsteros:email-draft-detail-v1",
  maxValueChars: EMAIL_DETAIL_MAX_PERSIST_CHARS,
});

const messageInflight = new Map<string, Promise<AgentMailMessageDetail | null>>();
const draftInflight = new Map<string, Promise<AgentMailDraftDetail | null>>();

function isStale(cachedAt: number, maxAgeMs: number): boolean {
  return Date.now() - cachedAt > maxAgeMs;
}

export function peekEmailMessageDetailCache(
  inboxId: string,
  messageId: string,
): AgentMailMessageDetail | null {
  const inbox = inboxId.trim();
  const message = messageId.trim();
  if (!inbox || !message) return null;
  return messageCache.peek(messageCacheKey(inbox, message))?.detail ?? null;
}

export function peekEmailMessageDetailCacheMeta(
  inboxId: string,
  messageId: string,
): CachedMessageDetail | null {
  const inbox = inboxId.trim();
  const message = messageId.trim();
  if (!inbox || !message) return null;
  return messageCache.peek(messageCacheKey(inbox, message));
}

export function writeEmailMessageDetailCache(
  inboxId: string,
  messageId: string,
  detail: AgentMailMessageDetail,
): void {
  const inbox = inboxId.trim();
  const message = messageId.trim();
  if (!inbox || !message) return;
  messageCache.set(messageCacheKey(inbox, message), {
    detail,
    cachedAt: Date.now(),
  });
}

export function discardEmailMessageDetailCache(
  inboxId: string,
  messageId: string,
): void {
  const key = messageCacheKey(inboxId, messageId);
  messageCache.delete(key);
  messageInflight.delete(key);
}

export function peekEmailDraftDetailCache(
  inboxId: string,
  draftId: string,
): AgentMailDraftDetail | null {
  const inbox = inboxId.trim();
  const draft = draftId.trim();
  if (!inbox || !draft) return null;
  return draftCache.peek(draftCacheKey(inbox, draft))?.detail ?? null;
}

export function peekEmailDraftDetailCacheMeta(
  inboxId: string,
  draftId: string,
): CachedDraftDetail | null {
  const inbox = inboxId.trim();
  const draft = draftId.trim();
  if (!inbox || !draft) return null;
  return draftCache.peek(draftCacheKey(inbox, draft));
}

export function writeEmailDraftDetailCache(
  inboxId: string,
  draftId: string,
  detail: AgentMailDraftDetail,
): void {
  const inbox = inboxId.trim();
  const draft = draftId.trim();
  if (!inbox || !draft) return;
  draftCache.set(draftCacheKey(inbox, draft), {
    detail,
    cachedAt: Date.now(),
  });
}

export function discardEmailDraftDetailCache(
  inboxId: string,
  draftId: string,
): void {
  const key = draftCacheKey(inboxId, draftId);
  draftCache.delete(key);
  draftInflight.delete(key);
}

export function prefetchEmailMessageDetail(
  client: BacksterosApiClient,
  inboxId: string | null | undefined,
  messageId: string | null | undefined,
): void {
  const inbox = inboxId?.trim();
  const message = messageId?.trim();
  if (!inbox || !message) return;
  void fetchEmailMessageDetail(client, inbox, message);
}

export function prefetchEmailDraftDetail(
  client: BacksterosApiClient,
  inboxId: string | null | undefined,
  draftId: string | null | undefined,
): void {
  const inbox = inboxId?.trim();
  const draft = draftId?.trim();
  if (!inbox || !draft) return;
  void fetchEmailDraftDetail(client, inbox, draft);
}

export type FetchEmailDetailOptions = {
  force?: boolean;
  /**
   * When true (default), return a warm cache entry immediately and only hit
   * the network when missing, forced, or older than `maxAgeMs`.
   */
  allowStale?: boolean;
  /** Soft TTL for allowStale path. Defaults to EMAIL_DETAIL_CACHE_STALE_MS. */
  maxAgeMs?: number;
};

function networkFetchMessage(
  client: BacksterosApiClient,
  inbox: string,
  message: string,
  key: string,
): Promise<AgentMailMessageDetail | null> {
  const existing = messageInflight.get(key);
  if (existing) return existing;

  const request = client
    .requestJson<AgentMailMessageDetail>(
      `/api/v1/email/inboxes/${encodeURIComponent(inbox)}/messages/${encodeURIComponent(message)}`,
    )
    .then((detail) => {
      messageCache.set(key, { detail, cachedAt: Date.now() });
      return detail;
    })
    .catch(() => null)
    .finally(() => {
      messageInflight.delete(key);
    });

  messageInflight.set(key, request);
  return request;
}

function networkFetchDraft(
  client: BacksterosApiClient,
  inbox: string,
  draft: string,
  key: string,
): Promise<AgentMailDraftDetail | null> {
  const existing = draftInflight.get(key);
  if (existing) return existing;

  const request = client
    .requestJson<AgentMailDraftDetail>(
      `/api/v1/email/inboxes/${encodeURIComponent(inbox)}/drafts/${encodeURIComponent(draft)}`,
    )
    .then((detail) => {
      draftCache.set(key, { detail, cachedAt: Date.now() });
      return detail;
    })
    .catch(() => null)
    .finally(() => {
      draftInflight.delete(key);
    });

  draftInflight.set(key, request);
  return request;
}

export function fetchEmailMessageDetail(
  client: BacksterosApiClient,
  inboxId: string,
  messageId: string,
  options?: FetchEmailDetailOptions,
): Promise<AgentMailMessageDetail | null> {
  const inbox = inboxId.trim();
  const message = messageId.trim();
  const key = messageCacheKey(inbox, message);
  if (!inbox || !message) return Promise.resolve(null);

  const allowStale = options?.allowStale !== false;
  const maxAgeMs = options?.maxAgeMs ?? EMAIL_DETAIL_CACHE_STALE_MS;

  if (options?.force) {
    messageCache.delete(key);
    messageInflight.delete(key);
    return networkFetchMessage(client, inbox, message, key);
  }

  const cached = messageCache.peek(key);
  if (cached) {
    if (allowStale || !isStale(cached.cachedAt, maxAgeMs)) {
      return Promise.resolve(cached.detail);
    }
  }

  return networkFetchMessage(client, inbox, message, key);
}

export function fetchEmailDraftDetail(
  client: BacksterosApiClient,
  inboxId: string,
  draftId: string,
  options?: FetchEmailDetailOptions,
): Promise<AgentMailDraftDetail | null> {
  const inbox = inboxId.trim();
  const draft = draftId.trim();
  const key = draftCacheKey(inbox, draft);
  if (!inbox || !draft) return Promise.resolve(null);

  const allowStale = options?.allowStale !== false;
  const maxAgeMs = options?.maxAgeMs ?? EMAIL_DETAIL_CACHE_STALE_MS;

  if (options?.force) {
    draftCache.delete(key);
    draftInflight.delete(key);
    return networkFetchDraft(client, inbox, draft, key);
  }

  const cached = draftCache.peek(key);
  if (cached) {
    if (allowStale || !isStale(cached.cachedAt, maxAgeMs)) {
      return Promise.resolve(cached.detail);
    }
  }

  return networkFetchDraft(client, inbox, draft, key);
}

export function isEmailMessageDetailCacheStale(
  inboxId: string,
  messageId: string,
  maxAgeMs: number = EMAIL_DETAIL_CACHE_STALE_MS,
): boolean {
  const meta = peekEmailMessageDetailCacheMeta(inboxId, messageId);
  if (!meta) return true;
  return isStale(meta.cachedAt, maxAgeMs);
}

export function isEmailDraftDetailCacheStale(
  inboxId: string,
  draftId: string,
  maxAgeMs: number = EMAIL_DETAIL_CACHE_STALE_MS,
): boolean {
  const meta = peekEmailDraftDetailCacheMeta(inboxId, draftId);
  if (!meta) return true;
  return isStale(meta.cachedAt, maxAgeMs);
}
