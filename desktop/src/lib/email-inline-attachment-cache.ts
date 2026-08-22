import type { BacksterosApiClient } from "@backsteros/api-client";

import { emailMessageAttachmentPath } from "./email-message-attachments.js";

const blobCache = new Map<string, Blob>();
const inflight = new Map<string, Promise<Blob>>();

export function inlineAttachmentCacheKey(
  inboxId: string,
  messageId: string,
  attachmentId: string,
): string {
  return `${inboxId.trim()}:${messageId.trim()}:${attachmentId.trim()}`;
}

export function peekInlineAttachmentBlob(
  inboxId: string,
  messageId: string,
  attachmentId: string,
): Blob | null {
  const key = inlineAttachmentCacheKey(inboxId, messageId, attachmentId);
  return blobCache.get(key) ?? null;
}

export async function fetchInlineAttachmentBlob(
  client: BacksterosApiClient,
  inboxId: string,
  messageId: string,
  attachmentId: string,
): Promise<Blob> {
  const key = inlineAttachmentCacheKey(inboxId, messageId, attachmentId);
  const cached = blobCache.get(key);
  if (cached) return cached;

  const existing = inflight.get(key);
  if (existing) return existing;

  const request = client
    .requestBinary(
      emailMessageAttachmentPath(inboxId, messageId, attachmentId),
    )
    .then((blob) => {
      blobCache.set(key, blob);
      inflight.delete(key);
      return blob;
    })
    .catch((error) => {
      inflight.delete(key);
      throw error;
    });

  inflight.set(key, request);
  return request;
}

export function prefetchInlineAttachmentBlob(
  client: BacksterosApiClient,
  inboxId: string,
  messageId: string,
  attachmentId: string,
): void {
  void fetchInlineAttachmentBlob(
    client,
    inboxId,
    messageId,
    attachmentId,
  ).catch(() => {
    // Best-effort warm cache for rendered inline images.
  });
}
