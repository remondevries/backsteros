import type { BacksterosApiClient } from "@backsteros/api-client";
import type {
  AgentMailDraftDetail,
  AgentMailMessageDetail,
} from "@backsteros/contracts";

import { createSessionLruCache } from "./session-lru-cache";

function messageCacheKey(inboxId: string, messageId: string): string {
  return `${inboxId.trim()}:${messageId.trim()}`;
}

function draftCacheKey(inboxId: string, draftId: string): string {
  return `${inboxId.trim()}:draft:${draftId.trim()}`;
}

/** Bounded warm cache for open email threads (tab switch / side-panel revisit). */
const messageCache = createSessionLruCache<AgentMailMessageDetail>(24);
const draftCache = createSessionLruCache<AgentMailDraftDetail>(16);

const messageInflight = new Map<string, Promise<AgentMailMessageDetail | null>>();
const draftInflight = new Map<string, Promise<AgentMailDraftDetail | null>>();

export function peekEmailMessageDetailCache(
  inboxId: string,
  messageId: string,
): AgentMailMessageDetail | null {
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
  messageCache.set(messageCacheKey(inbox, message), detail);
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
  draftCache.set(draftCacheKey(inbox, draft), detail);
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

export function fetchEmailMessageDetail(
  client: BacksterosApiClient,
  inboxId: string,
  messageId: string,
  options?: { force?: boolean },
): Promise<AgentMailMessageDetail | null> {
  const inbox = inboxId.trim();
  const message = messageId.trim();
  const key = messageCacheKey(inbox, message);
  if (!inbox || !message) return Promise.resolve(null);

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

export function fetchEmailDraftDetail(
  client: BacksterosApiClient,
  inboxId: string,
  draftId: string,
  options?: { force?: boolean },
): Promise<AgentMailDraftDetail | null> {
  const inbox = inboxId.trim();
  const draft = draftId.trim();
  const key = draftCacheKey(inbox, draft);
  if (!inbox || !draft) return Promise.resolve(null);

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
