import type { BacksterosApiClient } from "@backsteros/api-client";
import type { InboxEmailListItem } from "@backsteros/ui";

import {
  fetchEmailDraftDetail,
  fetchEmailMessageDetail,
  isEmailDraftDetailCacheStale,
  isEmailMessageDetailCacheStale,
} from "./email-message-detail-cache";

export type EmailDetailPrefetchTarget = {
  kind: "message" | "draft";
  inboxId: string;
  /** Message id or draft id. */
  id: string;
};

const DEFAULT_LIMIT = 16;
const DEFAULT_NEIGHBOR_RADIUS = 8;
const DEFAULT_CONCURRENCY = 2;

/**
 * Pick email/draft detail targets to warm from the on-screen Messages order.
 * Prefers a window around the focused row; otherwise the top of the list.
 * Skips entries that are already warm in the detail cache.
 */
export function resolveEmailDetailPrefetchTargets(input: {
  emails: readonly InboxEmailListItem[];
  orderedRowIds: readonly string[];
  focusRowId?: string | null;
  limit?: number;
  neighborRadius?: number;
}): EmailDetailPrefetchTarget[] {
  const limit = Math.max(1, input.limit ?? DEFAULT_LIMIT);
  const neighborRadius = Math.max(0, input.neighborRadius ?? DEFAULT_NEIGHBOR_RADIUS);
  const byId = new Map(input.emails.map((email) => [email.id, email]));
  const emailRowIds = input.orderedRowIds.filter((id) => byId.has(id));
  if (emailRowIds.length === 0) return [];

  const focus = input.focusRowId?.trim() || null;
  const focusIndex = focus ? emailRowIds.indexOf(focus) : -1;
  let windowIds: string[];
  if (focusIndex >= 0) {
    const start = Math.max(0, focusIndex - neighborRadius);
    const end = Math.min(emailRowIds.length, focusIndex + neighborRadius + 1);
    windowIds = emailRowIds.slice(start, end);
  } else {
    windowIds = emailRowIds.slice(0, limit);
  }

  const targets: EmailDetailPrefetchTarget[] = [];
  const seen = new Set<string>();
  for (const rowId of windowIds) {
    if (targets.length >= limit) break;
    const email = byId.get(rowId);
    if (!email) continue;
    const draftId = email.draftId?.trim();
    if (draftId) {
      const key = `draft:${email.inboxId}:${draftId}`;
      if (seen.has(key)) continue;
      if (!isEmailDraftDetailCacheStale(email.inboxId, draftId)) continue;
      seen.add(key);
      targets.push({ kind: "draft", inboxId: email.inboxId, id: draftId });
      continue;
    }
    const messageId = email.messageId?.trim();
    if (!messageId) continue;
    const key = `message:${email.inboxId}:${messageId}`;
    if (seen.has(key)) continue;
    if (!isEmailMessageDetailCacheStale(email.inboxId, messageId)) continue;
    seen.add(key);
    targets.push({
      kind: "message",
      inboxId: email.inboxId,
      id: messageId,
    });
  }
  return targets;
}

/**
 * Fire-and-forget detail fetches with bounded concurrency. Returns a cancel
 * function for when the visible list / focus moves again.
 */
export function scheduleEmailDetailListPrefetch(
  client: BacksterosApiClient,
  targets: readonly EmailDetailPrefetchTarget[],
  options?: { concurrency?: number },
): () => void {
  if (targets.length === 0) return () => {};

  const concurrency = Math.max(1, options?.concurrency ?? DEFAULT_CONCURRENCY);
  let cancelled = false;
  let nextIndex = 0;
  let active = 0;
  let idleHandle: number | null = null;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const pump = () => {
    if (cancelled) return;
    while (active < concurrency && nextIndex < targets.length) {
      const target = targets[nextIndex++];
      if (!target) break;
      active += 1;
      const request =
        target.kind === "draft"
          ? fetchEmailDraftDetail(client, target.inboxId, target.id)
          : fetchEmailMessageDetail(client, target.inboxId, target.id);
      void request.finally(() => {
        active -= 1;
        pump();
      });
    }
  };

  const start = () => {
    if (cancelled) return;
    pump();
  };

  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    idleHandle = window.requestIdleCallback(() => start(), { timeout: 1200 });
  } else {
    timeoutHandle = setTimeout(start, 32);
  }

  return () => {
    cancelled = true;
    if (idleHandle != null && typeof window !== "undefined") {
      window.cancelIdleCallback?.(idleHandle);
    }
    if (timeoutHandle != null) clearTimeout(timeoutHandle);
  };
}
