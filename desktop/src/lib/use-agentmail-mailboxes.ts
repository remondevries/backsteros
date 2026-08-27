import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AgentMailMessage,
  AgentMailSettings,
} from "@backsteros/contracts";
import {
  collapseEmailListItemsByThread,
  type EmailListItem,
  type EmailMailbox,
  type TaskStatus,
} from "@backsteros/ui";

import { useDesktopApi } from "./api-context";
import { createRequestAbortSignal } from "./request-timeout";
import { startEmailInboxEventsLoop } from "./email-inbox-events";

export const EMAIL_LIST_PATCH_EVENT = "backsteros-email-list-patch";
export const EMAIL_LIST_REMOVE_EVENT = "backsteros-email-list-remove";
/** Fired when AgentMail inbox SSE (or a live subscriber) reports an update. */
export const EMAIL_INBOX_UPDATED_EVENT = "backsteros-email-inbox-updated";

/** Coalesce bursty webhook/SSE updates into one list reload. */
const SSE_RELOAD_DEBOUNCE_MS = 400;
/** Catch-up poll while SSE is subscribed (SSE is primary). */
const LIVE_CATCHUP_POLL_MS = 60_000;

export type EmailInboxUpdatedDetail = {
  inboxId: string;
  messageId: string | null;
};

export type EmailListPatchDetail = {
  inboxId: string;
  messageId: string;
  threadId?: string | null;
  status?: TaskStatus | string;
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
  /** Clear the concept-draft badge on list rows. */
  conceptDraftId?: string | null;
};

export type EmailListRemoveDetail = {
  inboxId: string;
  /** Remove this message id from the list. */
  messageId?: string | null;
  /** Remove every list row for this thread. */
  threadId?: string | null;
};

export function dispatchEmailListPatch(detail: EmailListPatchDetail): void {
  window.dispatchEvent(
    new CustomEvent(EMAIL_LIST_PATCH_EVENT, { detail }),
  );
}

export function dispatchEmailListRemove(detail: EmailListRemoveDetail): void {
  window.dispatchEvent(
    new CustomEvent(EMAIL_LIST_REMOVE_EVENT, { detail }),
  );
}

function toListItem(entry: AgentMailMessage): EmailListItem | null {
  if (entry.kind === "draft") return null;
  return {
    kind: "message",
    id: entry.messageId,
    inboxId: entry.inboxId,
    subject: entry.subject,
    from: entry.from,
    preview: entry.preview,
    receivedAt: Date.parse(entry.timestamp) || 0,
    threadId: entry.threadId ?? null,
    conceptDraftId: entry.conceptDraftId ?? null,
    inReplyToMessageId: entry.inReplyToMessageId ?? null,
    status: entry.status ?? "triage",
    priority: entry.priority ?? 0,
    dueDate: entry.dueDate ?? null,
    organizationId: entry.organizationId ?? null,
    organizationName: entry.organizationName ?? null,
    contactId: entry.contactId ?? null,
    contactName: entry.contactName ?? null,
    assigneeId: entry.assigneeId ?? null,
    assigneeName: entry.assigneeName ?? null,
    projectId: entry.projectId ?? null,
    projectName: entry.projectName ?? null,
    projectKey: entry.projectKey ?? null,
    emailThreadId: entry.emailThreadId ?? null,
    number: entry.number ?? null,
    displayId: entry.displayId ?? null,
  };
}

function applyListPatch(
  items: EmailListItem[],
  patch: EmailListPatchDetail,
): EmailListItem[] {
  const threadId = patch.threadId?.trim() || null;
  return items.map((item) => {
    if (item.inboxId !== patch.inboxId) return item;
    const sameMessage = item.id === patch.messageId;
    const sameThread =
      Boolean(threadId) &&
      Boolean(item.threadId) &&
      item.threadId === threadId;
    if (!sameMessage && !sameThread) return item;
    return {
      ...item,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
      ...(patch.organizationId !== undefined
        ? { organizationId: patch.organizationId }
        : {}),
      ...(patch.organizationName !== undefined
        ? { organizationName: patch.organizationName }
        : {}),
      ...(patch.contactId !== undefined ? { contactId: patch.contactId } : {}),
      ...(patch.contactName !== undefined
        ? { contactName: patch.contactName }
        : {}),
      ...(patch.assigneeId !== undefined
        ? { assigneeId: patch.assigneeId }
        : {}),
      ...(patch.assigneeName !== undefined
        ? { assigneeName: patch.assigneeName }
        : {}),
      ...(patch.projectId !== undefined ? { projectId: patch.projectId } : {}),
      ...(patch.projectName !== undefined
        ? { projectName: patch.projectName }
        : {}),
      ...(patch.projectKey !== undefined
        ? { projectKey: patch.projectKey }
        : {}),
      ...(patch.conceptDraftId !== undefined
        ? { conceptDraftId: patch.conceptDraftId }
        : {}),
    };
  });
}

function applyListRemove(
  items: EmailListItem[],
  detail: EmailListRemoveDetail,
): EmailListItem[] {
  const messageId = detail.messageId?.trim() || null;
  const threadId = detail.threadId?.trim() || null;
  if (!messageId && !threadId) return items;
  return items.filter((item) => {
    if (item.inboxId !== detail.inboxId) return true;
    if (messageId && item.id === messageId) return false;
    if (
      threadId &&
      (item.threadId === threadId ||
        (!item.threadId && item.id === threadId) ||
        item.id === threadId)
    ) {
      return false;
    }
    return true;
  });
}

export function useAgentMailMailboxes(
  active: boolean,
  options?: { liveUpdates?: boolean },
) {
  const liveUpdates = options?.liveUpdates !== false;
  const { client } = useDesktopApi();
  const [mailboxes, setMailboxes] = useState<EmailMailbox[]>([]);
  const [messages, setMessages] = useState<EmailListItem[]>([]);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [loading, setLoading] = useState(active);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const reloadAbortRef = useRef<AbortController | null>(null);
  const reloadGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const hydratedRef = useRef(false);
  const sseReloadTimerRef = useRef<number | null>(null);

  const reload = useCallback(async () => {
    const generation = ++reloadGenerationRef.current;
    const silent = hydratedRef.current;
    const controller = new AbortController();
    if (silent) {
      // Background refresh: do not abort an in-flight initial load.
    } else {
      reloadAbortRef.current?.abort();
      reloadAbortRef.current = controller;
    }
    const signal = createRequestAbortSignal(undefined, controller.signal);

    // Keep existing list visible while refreshing (letters-style; no loader flash).
    if (!silent) {
      setLoading(true);
      setMessagesLoading(true);
    }
    try {
      const body = await client.requestJson<AgentMailSettings>(
        "/api/v1/settings/agentmail",
        { signal },
      );
      if (signal.aborted || generation !== reloadGenerationRef.current) return;
      if (!mountedRef.current) return;
      startTransition(() => {
        setApiKeyConfigured(body.apiKeyConfigured);
        setMailboxes(
          (body.inboxes ?? []).map((inbox) => ({
            inboxId: inbox.inboxId,
            email: inbox.email,
            displayName: inbox.displayName,
            contactId: inbox.contactId ?? null,
            contactName: inbox.contactName ?? null,
          })),
        );
        if (!silent) setLoading(false);
      });
      if (!body.apiKeyConfigured || (body.inboxes ?? []).length === 0) {
        setMessages([]);
        setMessagesLoading(false);
        hydratedRef.current = true;
        return;
      }
      try {
        const listed = await client.requestJson<{ messages: AgentMailMessage[] }>(
          "/api/v1/email/messages",
          { signal },
        );
        if (signal.aborted || generation !== reloadGenerationRef.current) {
          return;
        }
        if (!mountedRef.current) return;
        startTransition(() => {
          setMessages(
            collapseEmailListItemsByThread(
              (listed.messages ?? [])
                .map(toListItem)
                .filter((item): item is EmailListItem => item != null),
            ),
          );
        });
      } catch {
        if (signal.aborted || generation !== reloadGenerationRef.current) {
          return;
        }
        if (!silent) setMessages([]);
      }
    } catch {
      if (signal.aborted || generation !== reloadGenerationRef.current) return;
      if (!mountedRef.current) return;
      setApiKeyConfigured(false);
      if (!silent) {
        setMailboxes([]);
        setMessages([]);
      }
    } finally {
      if (generation !== reloadGenerationRef.current || !mountedRef.current) {
        return;
      }
      hydratedRef.current = true;
      setLoading(false);
      setMessagesLoading(false);
      if (!silent && reloadAbortRef.current === controller) {
        reloadAbortRef.current = null;
      }
    }
  }, [client]);

  const scheduleDebouncedReload = useCallback(() => {
    if (sseReloadTimerRef.current != null) {
      window.clearTimeout(sseReloadTimerRef.current);
    }
    sseReloadTimerRef.current = window.setTimeout(() => {
      sseReloadTimerRef.current = null;
      void reload();
    }, SSE_RELOAD_DEBOUNCE_MS);
  }, [reload]);

  useEffect(() => {
    mountedRef.current = true;
    if (!active) return;
    void reload();
    return () => {
      mountedRef.current = false;
      reloadAbortRef.current?.abort();
      reloadAbortRef.current = null;
      if (sseReloadTimerRef.current != null) {
        window.clearTimeout(sseReloadTimerRef.current);
        sseReloadTimerRef.current = null;
      }
    };
  }, [active, reload]);

  useEffect(() => {
    if (!active) return;
    function handleReload() {
      void reload();
    }
    function handlePatch(event: Event) {
      const detail = (event as CustomEvent<EmailListPatchDetail>).detail;
      if (!detail?.inboxId || !detail.messageId) return;
      setMessages((current) => applyListPatch(current, detail));
    }
    function handleRemove(event: Event) {
      const detail = (event as CustomEvent<EmailListRemoveDetail>).detail;
      if (!detail?.inboxId) return;
      setMessages((current) => applyListRemove(current, detail));
    }
    window.addEventListener("backsteros-email-mailboxes-reload", handleReload);
    window.addEventListener(EMAIL_LIST_PATCH_EVENT, handlePatch);
    window.addEventListener(EMAIL_LIST_REMOVE_EVENT, handleRemove);
    return () => {
      window.removeEventListener(
        "backsteros-email-mailboxes-reload",
        handleReload,
      );
      window.removeEventListener(EMAIL_LIST_PATCH_EVENT, handlePatch);
      window.removeEventListener(EMAIL_LIST_REMOVE_EVENT, handleRemove);
    };
  }, [active, reload]);

  useEffect(() => {
    if (!active || !apiKeyConfigured || !liveUpdates) return;
    const controller = new AbortController();
    startEmailInboxEventsLoop({
      client,
      signal: controller.signal,
      onUpdated: (payload) => {
        window.dispatchEvent(
          new CustomEvent<EmailInboxUpdatedDetail>(EMAIL_INBOX_UPDATED_EVENT, {
            detail: {
              inboxId: payload.inboxId,
              messageId: payload.messageId,
            },
          }),
        );
        scheduleDebouncedReload();
      },
    });
    return () => {
      controller.abort();
      if (sseReloadTimerRef.current != null) {
        window.clearTimeout(sseReloadTimerRef.current);
        sseReloadTimerRef.current = null;
      }
    };
  }, [
    active,
    apiKeyConfigured,
    client,
    liveUpdates,
    scheduleDebouncedReload,
  ]);

  // Catch-up while live: SSE is primary; poll less often so we don't stack
  // full AgentMail list fetches on top of every webhook.
  useEffect(() => {
    if (!active || !apiKeyConfigured || !liveUpdates) return;
    const timer = window.setInterval(() => {
      void reload();
    }, LIVE_CATCHUP_POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, apiKeyConfigured, liveUpdates, reload]);

  return useMemo(
    () => ({
      mailboxes,
      messages,
      apiKeyConfigured,
      loading,
      messagesLoading,
      reload,
    }),
    [
      mailboxes,
      messages,
      apiKeyConfigured,
      loading,
      messagesLoading,
      reload,
    ],
  );
}
