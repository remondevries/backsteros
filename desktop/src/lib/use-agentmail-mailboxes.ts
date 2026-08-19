import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentMailMessage,
  AgentMailSettings,
} from "@backsteros/contracts";
import type { EmailListItem, EmailMailbox } from "@backsteros/ui";

import { useDesktopApi } from "./api-context";
import { createRequestAbortSignal } from "./request-timeout";

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
  };
}

export function useAgentMailMailboxes(active: boolean) {
  const { client } = useDesktopApi();
  const [mailboxes, setMailboxes] = useState<EmailMailbox[]>([]);
  const [messages, setMessages] = useState<EmailListItem[]>([]);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [loading, setLoading] = useState(active);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const reloadAbortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    reloadAbortRef.current?.abort();
    const controller = new AbortController();
    reloadAbortRef.current = controller;
    const signal = createRequestAbortSignal(undefined, controller.signal);

    setLoading(true);
    setMessagesLoading(true);
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
      setLoading(false);
      if (!body.apiKeyConfigured || (body.inboxes ?? []).length === 0) {
        setMessages([]);
        setMessagesLoading(false);
        return;
      }
      try {
        const listed = await client.requestJson<{ messages: AgentMailMessage[] }>(
          "/api/v1/email/messages",
          { signal },
        );
        if (signal.aborted) return;
        setMessages(
          (listed.messages ?? [])
            .map(toListItem)
            .filter((item): item is EmailListItem => item != null),
        );
      } catch {
        if (signal.aborted) return;
        setMessages([]);
      }
    } catch {
      if (signal.aborted) return;
      setApiKeyConfigured(false);
      setMailboxes([]);
      setMessages([]);
    } finally {
      if (reloadAbortRef.current === controller) {
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
    window.addEventListener("backsteros-email-mailboxes-reload", handleReload);
    return () => {
      window.removeEventListener(
        "backsteros-email-mailboxes-reload",
        handleReload,
      );
    };
  }, [active, reload]);

  return {
    mailboxes,
    messages,
    apiKeyConfigured,
    loading,
    messagesLoading,
    reload,
  };
}
