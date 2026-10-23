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
  AgentMailMessageDetail,
  AgentMailSettings,
} from "@backsteros/contracts";
import {
  collapseEmailListItemsByThread,
  isAgentMailMessageUnread,
  resolveEmailMessageDirection,
  type EmailListItem,
  type EmailComposeReplyTemplates,
  type EmailMailbox,
  resolveComposeReplyTemplates,
  type TaskStatus,
} from "@backsteros/ui";

import { useDesktopApi } from "./api-context";
import { createRequestAbortSignal } from "./request-timeout";
import {
  peekAgentMailListCache,
  writeAgentMailListCache,
} from "./agentmail-list-cache";
import { setEmailStreamStatus } from "./cloud-client-notices";
import { startEmailInboxEventsLoop } from "./email-inbox-events";
import { writeEmailMessageDetailCache } from "./email-message-detail-cache";
import { WORKSPACE_EMAIL_UPDATED_EVENT } from "./workspace-events";

export const EMAIL_LIST_PATCH_EVENT = "backsteros-email-list-patch";
export const EMAIL_LIST_REMOVE_EVENT = "backsteros-email-list-remove";
/** Fired when AgentMail inbox SSE (or a live subscriber) reports an update. */
export const EMAIL_INBOX_UPDATED_EVENT = "backsteros-email-inbox-updated";

/** Coalesce bursty webhook/SSE updates into one list reload. */
const SSE_RELOAD_DEBOUNCE_MS = 400;
/** Catch-up poll while SSE is subscribed (SSE is primary). */
const LIVE_CATCHUP_POLL_MS = 60_000;
/** Skip mount REST when the session list cache is still fresh. */
const AGENTMAIL_CACHE_FRESH_MS = 45_000;

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
  /** Clear or set the Updated inbox flag. */
  inboxUpdatedAt?: number | Date | string | null;
  /** AgentMail unread label. */
  unread?: boolean;
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

function toListItem(
  entry: AgentMailMessage,
  mailboxEmails: ReadonlySet<string>,
): EmailListItem | null {
  if (entry.kind === "draft") {
    const draftId = entry.draftId ?? entry.messageId;
    return {
      kind: "draft",
      id: draftId,
      inboxId: entry.inboxId,
      subject: entry.subject,
      from: entry.from,
      to: entry.to ?? null,
      preview: entry.preview,
      receivedAt: Date.parse(entry.timestamp) || 0,
      threadId: entry.threadId ?? null,
      draftId,
      inReplyToMessageId: entry.inReplyToMessageId ?? null,
      status: entry.status ?? "concept",
      priority: entry.priority ?? 0,
      dueDate: entry.dueDate ?? null,
      organizationId: entry.organizationId ?? null,
      organizationName: entry.organizationName ?? null,
      contactId: entry.contactId ?? null,
      contactName: entry.contactName ?? null,
      partyContactIds: entry.partyContactIds ?? null,
      assigneeId: entry.assigneeId ?? null,
      assigneeName: entry.assigneeName ?? null,
      projectId: entry.projectId ?? null,
      projectName: entry.projectName ?? null,
      projectKey: entry.projectKey ?? null,
      emailThreadId: entry.emailThreadId ?? null,
      number: entry.number ?? null,
      displayId: entry.displayId ?? null,
      inboxUpdatedAt: entry.inboxUpdatedAt ?? null,
      direction: resolveEmailMessageDirection(entry.from, mailboxEmails),
    };
  }
  return {
    kind: "message",
    id: entry.messageId,
    inboxId: entry.inboxId,
    subject: entry.subject,
    from: entry.from,
    to: entry.to ?? null,
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
    partyContactIds: entry.partyContactIds ?? null,
    assigneeId: entry.assigneeId ?? null,
    assigneeName: entry.assigneeName ?? null,
    projectId: entry.projectId ?? null,
    projectName: entry.projectName ?? null,
    projectKey: entry.projectKey ?? null,
    emailThreadId: entry.emailThreadId ?? null,
    number: entry.number ?? null,
    displayId: entry.displayId ?? null,
    inboxUpdatedAt: entry.inboxUpdatedAt ?? null,
    direction: resolveEmailMessageDirection(entry.from, mailboxEmails),
    unread: isAgentMailMessageUnread(entry.labels),
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
      ...(patch.inboxUpdatedAt !== undefined
        ? { inboxUpdatedAt: patch.inboxUpdatedAt }
        : {}),
      ...(patch.unread !== undefined ? { unread: patch.unread } : {}),
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

/** Upsert a list row for a new/updated message; collapses same thread. */
function upsertListItem(
  items: EmailListItem[],
  next: EmailListItem,
): EmailListItem[] {
  const threadId = next.threadId?.trim() || null;
  const without = items.filter((item) => {
    if (item.inboxId !== next.inboxId) return true;
    if (item.id === next.id) return false;
    if (threadId && item.threadId === threadId) return false;
    return true;
  });
  return [next, ...without];
}

function detailToListItem(
  detail: AgentMailMessageDetail,
  mailboxEmails: ReadonlySet<string>,
): EmailListItem {
  const meta = detail.threadMetadata;
  return {
    kind: "message",
    id: detail.messageId,
    inboxId: detail.inboxId,
    subject: detail.subject,
    from: detail.from,
    to: detail.to ?? null,
    preview: detail.preview,
    receivedAt: Date.parse(detail.timestamp) || Date.now(),
    threadId: detail.threadId ?? null,
    conceptDraftId: detail.conceptDraftId ?? null,
    inReplyToMessageId: detail.inReplyToMessageId ?? null,
    status: meta?.status ?? detail.status ?? "triage",
    priority: meta?.priority ?? detail.priority ?? 0,
    dueDate: meta?.dueDate ?? detail.dueDate ?? null,
    organizationId: meta?.organizationId ?? detail.organizationId ?? null,
    organizationName:
      meta?.organizationName ?? detail.organizationName ?? null,
    contactId: meta?.contactId ?? detail.contactId ?? null,
    contactName: meta?.contactName ?? detail.contactName ?? null,
    partyContactIds: detail.partyContactIds ?? null,
    assigneeId: meta?.assigneeId ?? detail.assigneeId ?? null,
    assigneeName: meta?.assigneeName ?? detail.assigneeName ?? null,
    projectId: meta?.projectId ?? detail.projectId ?? null,
    projectName: meta?.projectName ?? detail.projectName ?? null,
    projectKey: meta?.projectKey ?? detail.projectKey ?? null,
    emailThreadId: meta?.id ?? detail.emailThreadId ?? null,
    number: meta?.number ?? detail.number ?? null,
    displayId: meta?.displayId ?? detail.displayId ?? null,
    inboxUpdatedAt: detail.inboxUpdatedAt ?? null,
    direction: resolveEmailMessageDirection(detail.from, mailboxEmails),
    unread: isAgentMailMessageUnread(detail.labels),
  };
}

export function useAgentMailMailboxes(
  active: boolean,
  options?: { liveUpdates?: boolean },
) {
  const liveUpdates = options?.liveUpdates !== false;
  const { client } = useDesktopApi();
  const cachedSnapshot = peekAgentMailListCache();
  const [mailboxes, setMailboxes] = useState<EmailMailbox[]>(
    () => cachedSnapshot?.mailboxes ?? [],
  );
  const [messages, setMessages] = useState<EmailListItem[]>(
    () => cachedSnapshot?.messages ?? [],
  );
  const [apiKeyConfigured, setApiKeyConfigured] = useState(
    () => cachedSnapshot?.apiKeyConfigured ?? false,
  );
  const [replyTemplates, setReplyTemplates] =
    useState<EmailComposeReplyTemplates | null>(
      () => cachedSnapshot?.replyTemplates ?? null,
    );
  const [loading, setLoading] = useState(active && !cachedSnapshot);
  const [messagesLoading, setMessagesLoading] = useState(
    active && !cachedSnapshot,
  );
  const reloadAbortRef = useRef<AbortController | null>(null);
  const reloadGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const hydratedRef = useRef(Boolean(cachedSnapshot));
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
      const nextTemplates = resolveComposeReplyTemplates({
        greetingTemplateEn: body.replyGreetingTemplateEn,
        greetingTemplateNl: body.replyGreetingTemplateNl,
        signOffTemplateEn: body.replySignOffTemplateEn,
        signOffTemplateNl: body.replySignOffTemplateNl,
      });
      const nextMailboxes = (body.inboxes ?? []).map((inbox) => ({
        inboxId: inbox.inboxId,
        email: inbox.email,
        displayName: inbox.displayName,
        contactId: inbox.contactId ?? null,
        contactName: inbox.contactName ?? null,
      }));
      startTransition(() => {
        setApiKeyConfigured(body.apiKeyConfigured);
        setReplyTemplates(nextTemplates);
        setMailboxes(nextMailboxes);
        if (!silent) setLoading(false);
      });
      if (!body.apiKeyConfigured || (body.inboxes ?? []).length === 0) {
        setMessages([]);
        setMessagesLoading(false);
        hydratedRef.current = true;
        writeAgentMailListCache({
          mailboxes: nextMailboxes,
          messages: [],
          apiKeyConfigured: body.apiKeyConfigured,
          replyTemplates: nextTemplates,
        });
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
          const mailboxEmails = new Set(
            (body.inboxes ?? [])
              .map((inbox) => inbox.email?.trim().toLowerCase())
              .filter((email): email is string => Boolean(email)),
          );
          const nextMessages = collapseEmailListItemsByThread(
            (listed.messages ?? [])
              .map((entry) => toListItem(entry, mailboxEmails))
              .filter((item): item is EmailListItem => item != null),
          );
          setMessages(nextMessages);
          writeAgentMailListCache({
            mailboxes: nextMailboxes,
            messages: nextMessages,
            apiKeyConfigured: body.apiKeyConfigured,
            replyTemplates: nextTemplates,
          });
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
        setReplyTemplates(null);
      }
    } finally {
      if (generation === reloadGenerationRef.current && mountedRef.current) {
        hydratedRef.current = true;
        setLoading(false);
        setMessagesLoading(false);
        if (!silent && reloadAbortRef.current === controller) {
          reloadAbortRef.current = null;
        }
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

  const upsertMessageFromServer = useCallback(
    async (inboxId: string, messageId: string) => {
      const inbox = inboxId.trim();
      const message = messageId.trim();
      if (!inbox || !message) return false;
      try {
        const detail = await client.requestJson<AgentMailMessageDetail>(
          `/api/v1/email/inboxes/${encodeURIComponent(inbox)}/messages/${encodeURIComponent(message)}`,
        );
        if (!mountedRef.current) return false;
        writeEmailMessageDetailCache(inbox, message, detail);
        const mailboxEmails = new Set(
          mailboxes
            .map((mailbox) => mailbox.email.trim().toLowerCase())
            .filter(Boolean),
        );
        const listItem = detailToListItem(detail, mailboxEmails);
        setMessages((current) => {
          const next = upsertListItem(current, listItem);
          writeAgentMailListCache({
            mailboxes,
            messages: next,
            apiKeyConfigured,
            replyTemplates,
          });
          return next;
        });
        return true;
      } catch {
        return false;
      }
    },
    [apiKeyConfigured, client, mailboxes, replyTemplates],
  );

  useEffect(() => {
    mountedRef.current = true;
    if (!active) return;
    const cached = peekAgentMailListCache();
    const cacheFresh =
      cached != null &&
      typeof cached.cachedAt === "number" &&
      Date.now() - cached.cachedAt < AGENTMAIL_CACHE_FRESH_MS;
    if (cacheFresh) {
      // Paint cached rows immediately, but always refresh — an empty/stale
      // cache within the fresh window previously skipped REST entirely, so
      // Communication could show “No email yet” while a thread detail loaded.
      hydratedRef.current = true;
      setLoading(false);
      setMessagesLoading(false);
    } else if (!cached?.messages.length) {
      setMessagesLoading(true);
    }
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
    function handleWorkspaceEmailUpdated() {
      scheduleDebouncedReload();
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
    window.addEventListener(
      WORKSPACE_EMAIL_UPDATED_EVENT,
      handleWorkspaceEmailUpdated,
    );
    window.addEventListener(EMAIL_LIST_PATCH_EVENT, handlePatch);
    window.addEventListener(EMAIL_LIST_REMOVE_EVENT, handleRemove);
    return () => {
      window.removeEventListener(
        "backsteros-email-mailboxes-reload",
        handleReload,
      );
      window.removeEventListener(
        WORKSPACE_EMAIL_UPDATED_EVENT,
        handleWorkspaceEmailUpdated,
      );
      window.removeEventListener(EMAIL_LIST_PATCH_EVENT, handlePatch);
      window.removeEventListener(EMAIL_LIST_REMOVE_EVENT, handleRemove);
    };
  }, [active, reload, scheduleDebouncedReload]);

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
        const messageId = payload.messageId?.trim() || null;
        if (messageId) {
          // Incremental: one message hydrate instead of full inbox list reload.
          void upsertMessageFromServer(payload.inboxId, messageId).then(
            (ok) => {
              if (!ok) scheduleDebouncedReload();
            },
          );
          return;
        }
        scheduleDebouncedReload();
      },
      onConnection: setEmailStreamStatus,
    });
    return () => {
      controller.abort();
      setEmailStreamStatus("off");
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
    upsertMessageFromServer,
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
      replyTemplates,
      loading,
      messagesLoading,
      reload,
    }),
    [
      mailboxes,
      messages,
      apiKeyConfigured,
      replyTemplates,
      loading,
      messagesLoading,
      reload,
    ],
  );
}
