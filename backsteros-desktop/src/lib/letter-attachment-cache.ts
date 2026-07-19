import type { BacksterosApiClient } from "@backsteros/api-client";
import type { LetterAttachment } from "@backsteros/contracts";

import { createSessionLruCache } from "./session-lru-cache";

/** Attachment *metadata* lists (Tier B), not PDF bytes. */
const attachmentListCache = createSessionLruCache<LetterAttachment[]>(24);
const inflight = new Map<string, Promise<LetterAttachment[]>>();

export function peekLetterAttachmentCache(
  letterId: string,
): LetterAttachment[] | null {
  return attachmentListCache.peek(letterId);
}

export function writeLetterAttachmentCache(
  letterId: string,
  attachments: LetterAttachment[],
): void {
  attachmentListCache.set(letterId, attachments);
}

export function discardLetterAttachmentCache(letterId: string): void {
  attachmentListCache.delete(letterId);
  inflight.delete(letterId);
}

export function prefetchLetterAttachments(
  client: BacksterosApiClient,
  letterId: string | null | undefined,
): void {
  const id = letterId?.trim();
  if (!id) return;
  if (attachmentListCache.peek(id)) return;
  if (inflight.has(id)) return;

  const request = client
    .listLetterAttachments(id)
    .then((result) => {
      attachmentListCache.set(id, result.attachments);
      return result.attachments;
    })
    .catch(() => [] as LetterAttachment[])
    .finally(() => {
      inflight.delete(id);
    });

  inflight.set(id, request);
}

export async function fetchLetterAttachments(
  client: BacksterosApiClient,
  letterId: string,
): Promise<LetterAttachment[]> {
  const cached = attachmentListCache.peek(letterId);
  if (cached) return cached;

  const existing = inflight.get(letterId);
  if (existing) return existing;

  const request = client
    .listLetterAttachments(letterId)
    .then((result) => {
      attachmentListCache.set(letterId, result.attachments);
      return result.attachments;
    })
    .catch(() => [] as LetterAttachment[])
    .finally(() => {
      inflight.delete(letterId);
    });

  inflight.set(letterId, request);
  return request;
}
