/**
 * Optimistic email list removals that must survive a concurrent AgentMail
 * reload / SSE upsert until the server list catches up (or the TTL expires).
 *
 * Without this, delete → in-flight reload → deleted row reappears, then a
 * later navigate makes rows appear to “switch places”.
 */

export type EmailListPendingRemoval = {
  inboxId: string;
  messageId: string | null;
  threadId: string | null;
  expiresAt: number;
};

const PENDING_REMOVAL_TTL_MS = 120_000;

let pendingRemovals: EmailListPendingRemoval[] = [];

function pruneExpired(now = Date.now()): void {
  pendingRemovals = pendingRemovals.filter((entry) => entry.expiresAt > now);
}

export function rememberEmailListRemoval(detail: {
  inboxId: string;
  messageId?: string | null;
  threadId?: string | null;
}): void {
  const inboxId = detail.inboxId.trim();
  const messageId = detail.messageId?.trim() || null;
  const threadId = detail.threadId?.trim() || null;
  if (!inboxId || (!messageId && !threadId)) return;
  pruneExpired();
  pendingRemovals = pendingRemovals.filter((entry) => {
    if (entry.inboxId !== inboxId) return true;
    if (messageId && entry.messageId === messageId) return false;
    if (threadId && entry.threadId === threadId) return false;
    return true;
  });
  pendingRemovals.push({
    inboxId,
    messageId,
    threadId,
    expiresAt: Date.now() + PENDING_REMOVAL_TTL_MS,
  });
}

/** Undo a tombstone when delete fails and the row should come back. */
export function forgetEmailListRemoval(detail: {
  inboxId: string;
  messageId?: string | null;
  threadId?: string | null;
}): void {
  const inboxId = detail.inboxId.trim();
  const messageId = detail.messageId?.trim() || null;
  const threadId = detail.threadId?.trim() || null;
  if (!inboxId) return;
  pendingRemovals = pendingRemovals.filter((entry) => {
    if (entry.inboxId !== inboxId) return true;
    if (messageId && entry.messageId === messageId) return false;
    if (threadId && entry.threadId === threadId) return false;
    if (!messageId && !threadId) return false;
    return true;
  });
}

export function isEmailListItemPendingRemoval(item: {
  inboxId: string;
  id: string;
  threadId?: string | null;
}): boolean {
  pruneExpired();
  const inboxId = item.inboxId.trim();
  const messageId = item.id.trim();
  const threadId = item.threadId?.trim() || null;
  return pendingRemovals.some((entry) => {
    if (entry.inboxId !== inboxId) return false;
    if (entry.messageId && entry.messageId === messageId) return true;
    if (
      entry.threadId &&
      (threadId === entry.threadId ||
        messageId === entry.threadId ||
        (!threadId && messageId === entry.threadId))
    ) {
      return true;
    }
    return false;
  });
}

export function filterOutPendingEmailListRemovals<
  T extends { inboxId: string; id: string; threadId?: string | null },
>(items: readonly T[]): T[] {
  pruneExpired();
  if (pendingRemovals.length === 0) return items as T[];
  return items.filter((item) => !isEmailListItemPendingRemoval(item));
}

/** Test helper — clears all pending removals. */
export function clearEmailListPendingRemovalsForTests(): void {
  pendingRemovals = [];
}

/** Test helper — current tombstones (after prune). */
export function peekEmailListPendingRemovalsForTests(): readonly EmailListPendingRemoval[] {
  pruneExpired();
  return pendingRemovals;
}
