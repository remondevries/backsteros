/**
 * Cross-surface optimistic email-list sync (no React / RN imports).
 * `use-agentmail-mailboxes` subscribes; metadata patch helpers dispatch.
 */

export type EmailListPatchDetail = {
  inboxId: string;
  messageId: string;
  threadId?: string | null;
  status?: string;
  priority?: number;
  dueDate?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  projectKey?: string | null;
  conceptDraftId?: string | null;
};

export type EmailListRemoveDetail = {
  inboxId: string;
  messageId?: string | null;
  threadId?: string | null;
};

export type EmailListListener = {
  onPatch: (detail: EmailListPatchDetail) => void;
  onRemove: (detail: EmailListRemoveDetail) => void;
  onReload: () => void;
};

const listeners = new Set<EmailListListener>();

export function subscribeEmailListEvents(listener: EmailListListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function dispatchEmailListPatch(detail: EmailListPatchDetail): void {
  for (const listener of listeners) listener.onPatch(detail);
}

export function dispatchEmailListRemove(detail: EmailListRemoveDetail): void {
  for (const listener of listeners) listener.onRemove(detail);
}

export function dispatchEmailListReload(): void {
  for (const listener of listeners) listener.onReload();
}
