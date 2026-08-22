/**
 * Mobile AgentMail list hook — port of desktop `use-agentmail-mailboxes.ts`.
 * REST + SSE (no PowerSync tables for email). Cross-surface optimistic sync
 * uses a module-level emitter instead of window CustomEvents.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentMailMessage,
  AgentMailSettings,
} from "@backsteros/contracts";

import {
  agentMailMessageToListItem,
  collapseEmailListItemsByThread,
  type EmailListItem,
  type EmailMailbox,
} from "./email-list";
import { startEmailInboxEventsLoop } from "./use-email-inbox-events";
import { useMobileApiClient } from "./use-mobile-api-client";

/** Coalesce bursty webhook/SSE updates into one list reload. */
const SSE_RELOAD_DEBOUNCE_MS = 400;
/** Catch-up poll while SSE is subscribed (SSE is primary). */
const LIVE_CATCHUP_POLL_MS = 60_000;

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

type EmailListListener = {
  onPatch: (detail: EmailListPatchDetail) => void;
  onRemove: (detail: EmailListRemoveDetail) => void;
  onReload: () => void;
};

const listeners = new Set<EmailListListener>();

export function dispatchEmailListPatch(detail: EmailListPatchDetail): void {
  for (const listener of listeners) listener.onPatch(detail);
}

export function dispatchEmailListRemove(detail: EmailListRemoveDetail): void {
  for (const listener of listeners) listener.onRemove(detail);
}

export function dispatchEmailListReload(): void {
  for (const listener of listeners) listener.onReload();
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
      Boolean(threadId) && Boolean(item.threadId) && item.threadId === threadId;
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

export type AgentMailListState = {
  mailboxes: EmailMailbox[];
  messages: EmailListItem[];
  apiKeyConfigured: boolean;
  loading: boolean;
  reload: () => Promise<void>;
};

export function useAgentMailMailboxes(active: boolean): AgentMailListState {
  const client = useMobileApiClient();
  const [mailboxes, setMailboxes] = useState<EmailMailbox[]>([]);
  const [messages, setMessages] = useState<EmailListItem[]>([]);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [loading, setLoading] = useState(active);
  const reloadGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const hydratedRef = useRef(false);
  const sseReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    const generation = ++reloadGenerationRef.current;
    const silent = hydratedRef.current;
    if (!silent) setLoading(true);
    try {
      const body = await client.requestJson<AgentMailSettings>(
        "/api/v1/settings/agentmail",
      );
      if (generation !== reloadGenerationRef.current || !mountedRef.current) {
        return;
      }
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
      if (!body.apiKeyConfigured || (body.inboxes ?? []).length === 0) {
        setMessages([]);
        return;
      }
      try {
        const listed = await client.requestJson<{
          messages: AgentMailMessage[];
        }>("/api/v1/email/messages");
        if (generation !== reloadGenerationRef.current || !mountedRef.current) {
          return;
        }
        setMessages(
          collapseEmailListItemsByThread(
            (listed.messages ?? [])
              .map(agentMailMessageToListItem)
              .filter((item): item is EmailListItem => item != null),
          ),
        );
      } catch {
        if (generation !== reloadGenerationRef.current) return;
        if (!silent) setMessages([]);
      }
    } catch {
      if (generation !== reloadGenerationRef.current || !mountedRef.current) {
        return;
      }
      setApiKeyConfigured(false);
      if (!silent) {
        setMailboxes([]);
        setMessages([]);
      }
    } finally {
      if (generation === reloadGenerationRef.current && mountedRef.current) {
        hydratedRef.current = true;
        setLoading(false);
      }
    }
  }, [client]);

  const scheduleDebouncedReload = useCallback(() => {
    if (sseReloadTimerRef.current != null) {
      clearTimeout(sseReloadTimerRef.current);
    }
    sseReloadTimerRef.current = setTimeout(() => {
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
      if (sseReloadTimerRef.current != null) {
        clearTimeout(sseReloadTimerRef.current);
        sseReloadTimerRef.current = null;
      }
    };
  }, [active, reload]);

  // Optimistic cross-surface sync (inbox rows, thread detail, compose).
  useEffect(() => {
    if (!active) return;
    const listener: EmailListListener = {
      onPatch: (detail) => {
        if (!detail.inboxId || !detail.messageId) return;
        setMessages((current) => applyListPatch(current, detail));
      },
      onRemove: (detail) => {
        if (!detail.inboxId) return;
        setMessages((current) => applyListRemove(current, detail));
      },
      onReload: () => {
        void reload();
      },
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [active, reload]);

  // SSE live updates (primary) + catch-up poll (backstop).
  useEffect(() => {
    if (!active || !apiKeyConfigured) return;
    const controller = new AbortController();
    startEmailInboxEventsLoop({
      client,
      signal: controller.signal,
      onUpdated: () => scheduleDebouncedReload(),
    });
    const timer = setInterval(() => {
      void reload();
    }, LIVE_CATCHUP_POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [active, apiKeyConfigured, client, reload, scheduleDebouncedReload]);

  return useMemo(
    () => ({ mailboxes, messages, apiKeyConfigured, loading, reload }),
    [mailboxes, messages, apiKeyConfigured, loading, reload],
  );
}
