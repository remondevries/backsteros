/**
 * After deleting an inbox email/chat row, the detail pane may blank before
 * TanStack navigation lands. Queue the neighbor so the Inbox side panel can
 * finish opening it (highlight + navigate) even if the outlet raced.
 */

export type InboxOpenAfterRemoval = {
  href: string;
  itemId: string | null;
};

let pending: InboxOpenAfterRemoval | null = null;

export function queueInboxOpenAfterRemoval(
  input: InboxOpenAfterRemoval | null,
): void {
  if (!input?.href.trim()) {
    pending = null;
    return;
  }
  pending = {
    href: input.href.trim(),
    itemId: input.itemId?.trim() || null,
  };
}

export function consumeInboxOpenAfterRemoval(): InboxOpenAfterRemoval | null {
  const next = pending;
  pending = null;
  return next;
}

/** Test helper. */
export function peekInboxOpenAfterRemovalForTests(): InboxOpenAfterRemoval | null {
  return pending;
}

/** Test helper. */
export function clearInboxOpenAfterRemovalForTests(): void {
  pending = null;
}
