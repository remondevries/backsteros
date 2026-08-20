import { useCallback, useEffect, useRef, useState } from "react";
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
};

export function dispatchEmailListPatch(detail: EmailListPatchDetail): void {
  window.dispatchEvent(
    new CustomEvent(EMAIL_LIST_PATCH_EVENT, { detail }),
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
    };
  });
}

export function useAgentMailMailboxes(active: boolean) {
  const { client } = useDesktopApi();
  const [mailboxes, setMailboxes] = useState<EmailMailbox[]>([]);
  const [messages, setMessages] = useState<EmailListItem[]>([]);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [loading, setLoading] = useState(active);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const reloadAbortRef = useRef<AbortController | null>(null);
  const hydratedRef = useRef(false);

  const reload = useCallback(async () => {
    reloadAbortRef.current?.abort();
    const controller = new AbortController();
    reloadAbortRef.current = controller;
    const signal = createRequestAbortSignal(undefined, controller.signal);

    // Keep existing list visible while refreshing (letters-style; no loader flash).
    const silent = hydratedRef.current;
    if (!silent) {
      setLoading(true);
      setMessagesLoading(true);
    }
    try {
      const body = await client.requestJson<AgentMailSettings>(
        "/api/v1/settings/agentmail",
        { signal },
      );
      if (signal.aborted) return;
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
        if (signal.aborted) return;
        setMessages(
          collapseEmailListItemsByThread(
            (listed.messages ?? [])
              .map(toListItem)
              .filter((item): item is EmailListItem => item != null),
          ),
        );
      } catch {
        if (signal.aborted) return;
        if (!silent) setMessages([]);
      }
    } catch {
      if (signal.aborted) return;
      setApiKeyConfigured(false);
      if (!silent) {
        setMailboxes([]);
        setMessages([]);
      }
    } finally {
      if (reloadAbortRef.current === controller) {
        hydratedRef.current = true;
        setLoading(false);
        setMessagesLoading(false);
      }
    }
  }, [client]);

  useEffect(() => {
    if (!active) return;
    void reload();
    return () => {
      reloadAbortRef.current?.abort();
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
    window.addEventListener("backsteros-email-mailboxes-reload", handleReload);
    window.addEventListener(EMAIL_LIST_PATCH_EVENT, handlePatch);
    return () => {
      window.removeEventListener(
        "backsteros-email-mailboxes-reload",
        handleReload,
      );
      window.removeEventListener(EMAIL_LIST_PATCH_EVENT, handlePatch);
    };
  }, [active, reload]);

  useEffect(() => {
    if (!active || !apiKeyConfigured) return;
    const controller = new AbortController();
    startEmailInboxEventsLoop({
      client,
      signal: controller.signal,
      onUpdated: () => {
        void reload();
      },
    });
    return () => controller.abort();
  }, [active, apiKeyConfigured, client, reload]);

  return {
    mailboxes,
    messages,
    apiKeyConfigured,
    loading,
    messagesLoading,
    reload,
  };
}
