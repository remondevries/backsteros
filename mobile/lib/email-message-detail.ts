/**
 * Email message/draft detail fetch with a small in-memory LRU and in-flight
 * dedupe — mobile port of desktop `email-message-detail-cache.ts`.
 */

import type { BacksterosApiClient } from "@backsteros/api-client";
import type {
  AgentMailDraftDetail,
  AgentMailMessageDetail,
} from "@backsteros/contracts";

const MESSAGE_CACHE_LIMIT = 16;
const DRAFT_CACHE_LIMIT = 8;

function createLruCache<T>(limit: number) {
  const map = new Map<string, T>();
  return {
    peek(key: string): T | null {
      const value = map.get(key);
      if (value === undefined) return null;
      map.delete(key);
      map.set(key, value);
      return value;
    },
    set(key: string, value: T): void {
      map.delete(key);
      map.set(key, value);
      while (map.size > limit) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
    },
    delete(key: string): void {
      map.delete(key);
    },
  };
}

const messageCache = createLruCache<AgentMailMessageDetail>(
  MESSAGE_CACHE_LIMIT,
);
const draftCache = createLruCache<AgentMailDraftDetail>(DRAFT_CACHE_LIMIT);
const messageInflight = new Map<
  string,
  Promise<AgentMailMessageDetail | null>
>();
const draftInflight = new Map<string, Promise<AgentMailDraftDetail | null>>();

function messageKey(inboxId: string, messageId: string): string {
  return `${inboxId.trim()}:${messageId.trim()}`;
}

function draftKey(inboxId: string, draftId: string): string {
  return `${inboxId.trim()}:draft:${draftId.trim()}`;
}

export function discardEmailMessageDetailCache(
  inboxId: string,
  messageId: string,
): void {
  const key = messageKey(inboxId, messageId);
  messageCache.delete(key);
  messageInflight.delete(key);
}

export function fetchEmailMessageDetail(
  client: BacksterosApiClient,
  inboxId: string,
  messageId: string,
  options?: { force?: boolean },
): Promise<AgentMailMessageDetail | null> {
  const inbox = inboxId.trim();
  const message = messageId.trim();
  if (!inbox || !message) return Promise.resolve(null);
  const key = messageKey(inbox, message);

  if (options?.force) {
    messageCache.delete(key);
    messageInflight.delete(key);
  } else {
    const cached = messageCache.peek(key);
    if (cached) return Promise.resolve(cached);
    const existing = messageInflight.get(key);
    if (existing) return existing;
  }

  const request = client
    .requestJson<AgentMailMessageDetail>(
      `/api/v1/email/inboxes/${encodeURIComponent(inbox)}/messages/${encodeURIComponent(message)}`,
    )
    .then((detail) => {
      messageCache.set(key, detail);
      return detail;
    })
    .catch(() => null)
    .finally(() => {
      messageInflight.delete(key);
    });

  messageInflight.set(key, request);
  return request;
}

export function discardEmailDraftDetailCache(
  inboxId: string,
  draftId: string,
): void {
  const key = draftKey(inboxId, draftId);
  draftCache.delete(key);
  draftInflight.delete(key);
}

export function fetchEmailDraftDetail(
  client: BacksterosApiClient,
  inboxId: string,
  draftId: string,
  options?: { force?: boolean },
): Promise<AgentMailDraftDetail | null> {
  const inbox = inboxId.trim();
  const draft = draftId.trim();
  if (!inbox || !draft) return Promise.resolve(null);
  const key = draftKey(inbox, draft);

  if (options?.force) {
    draftCache.delete(key);
    draftInflight.delete(key);
  } else {
    const cached = draftCache.peek(key);
    if (cached) return Promise.resolve(cached);
    const existing = draftInflight.get(key);
    if (existing) return existing;
  }

  const request = client
    .requestJson<AgentMailDraftDetail>(
      `/api/v1/email/inboxes/${encodeURIComponent(inbox)}/drafts/${encodeURIComponent(draft)}`,
    )
    .then((detail) => {
      draftCache.set(key, detail);
      return detail;
    })
    .catch(() => null)
    .finally(() => {
      draftInflight.delete(key);
    });

  draftInflight.set(key, request);
  return request;
}
