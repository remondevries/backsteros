import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatConversation,
  ChatConversationDetail,
  ChatConversationsList,
  ChatMessage,
} from "@backsteros/contracts";

import { useDesktopApi } from "../api-context";
import { showNativeWorkspaceNotification } from "../inbox/native-notifications";
import { startChatEventsLoop, type ChatUpdatedPayload } from "./chat-events";

/** Coalesce bursty twin/SSE updates into one list reload. */
const SSE_RELOAD_DEBOUNCE_MS = 250;
/** Catch-up while Chat is open (SSE is primary). Match email inbox cadence. */
const LIVE_CATCHUP_POLL_MS = 60_000;

export function useChatInbox(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { client } = useDesktopApi();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ChatConversationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const hydratedRef = useRef(false);
  const sseReloadTimerRef = useRef<number | null>(null);
  selectedIdRef.current = selectedId;

  const loadList = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!enabled) return;
      const silent = opts?.silent === true && hydratedRef.current;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      const attempt = async () => {
        const body = await client.requestJson<ChatConversationsList>(
          "/api/v1/chat/conversations?limit=50",
        );
        setConversations(body.conversations);
        hydratedRef.current = true;
      };
      try {
        await attempt();
      } catch (err) {
        // WebKit surfaces transient local-core blips as "Load failed".
        try {
          await new Promise((resolve) => setTimeout(resolve, 600));
          await attempt();
        } catch (retryErr) {
          if (silent) return;
          const message =
            retryErr instanceof Error
              ? retryErr.message
              : "Could not load chat conversations.";
          setError(
            message === "Load failed" || message === "Failed to fetch"
              ? "Could not reach local-core. Try Refresh in a moment."
              : message,
          );
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [client, enabled],
  );

  const loadDetail = useCallback(
    async (conversationId: string, opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!silent) {
        setDetailLoading(true);
        setError(null);
      }
      try {
        const body = await client.requestJson<ChatConversationDetail>(
          `/api/v1/chat/conversations/${encodeURIComponent(conversationId)}`,
        );
        setDetail(body);
        setConversations((prev) =>
          prev.map((row) =>
            row.id === conversationId ? { ...row, unread: false } : row,
          ),
        );
      } catch (err) {
        if (silent) return;
        setError(
          err instanceof Error ? err.message : "Could not load conversation.",
        );
      } finally {
        if (!silent) setDetailLoading(false);
      }
    },
    [client],
  );

  const selectConversation = useCallback(
    (conversationId: string) => {
      setSelectedId(conversationId);
      void loadDetail(conversationId);
    },
    [loadDetail],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!selectedId) return;
      setSending(true);
      setError(null);
      try {
        const message = await client.requestJson<ChatMessage>(
          `/api/v1/chat/conversations/${encodeURIComponent(selectedId)}/messages`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content }),
          },
        );
        setDetail((prev) =>
          prev && prev.id === selectedId
            ? { ...prev, messages: [...prev.messages, message] }
            : prev,
        );
        setConversations((prev) => {
          const next = prev.map((row) =>
            row.id === selectedId
              ? {
                  ...row,
                  lastMessagePreview: content.slice(0, 280),
                  lastActivityAt: message.createdAt,
                  unread: false,
                }
              : row,
          );
          return [...next].sort((a, b) =>
            (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""),
          );
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not send message.");
        throw err;
      } finally {
        setSending(false);
      }
    },
    [client, selectedId],
  );

  const setStatus = useCallback(
    async (status: "resolved" | "open") => {
      if (!selectedId) return;
      setSending(true);
      setError(null);
      try {
        const body = await client.requestJson<ChatConversation>(
          `/api/v1/chat/conversations/${encodeURIComponent(selectedId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status }),
          },
        );
        setDetail((prev) => (prev && prev.id === selectedId ? { ...prev, ...body } : prev));
        setConversations((prev) =>
          prev.map((row) => (row.id === selectedId ? { ...row, ...body } : row)),
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not update conversation.",
        );
        throw err;
      } finally {
        setSending(false);
      }
    },
    [client, selectedId],
  );

  useEffect(() => {
    if (!enabled) return;
    void loadList();
  }, [enabled, loadList]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const scheduleLiveReload = (payload: ChatUpdatedPayload) => {
      if (sseReloadTimerRef.current != null) {
        window.clearTimeout(sseReloadTimerRef.current);
      }
      sseReloadTimerRef.current = window.setTimeout(() => {
        sseReloadTimerRef.current = null;
        void (async () => {
          await loadList({ silent: true });
          if (selectedIdRef.current === payload.conversationId) {
            await loadDetail(payload.conversationId, { silent: true });
          } else if (payload.kind === "message") {
            void showNativeWorkspaceNotification({
              key: `chat:${payload.conversationId}:${payload.messageId ?? "m"}`,
              title: "New chat message",
              body: "A visitor sent a message in Communication → Chat.",
            });
          }
        })();
      }, SSE_RELOAD_DEBOUNCE_MS);
    };
    startChatEventsLoop({
      client,
      signal: controller.signal,
      onUpdated: scheduleLiveReload,
    });
    return () => {
      controller.abort();
      if (sseReloadTimerRef.current != null) {
        window.clearTimeout(sseReloadTimerRef.current);
        sseReloadTimerRef.current = null;
      }
    };
  }, [client, enabled, loadDetail, loadList]);

  // Safety net when twin SSE is delayed or the stream recycled.
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      void loadList({ silent: true });
    }, LIVE_CATCHUP_POLL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, loadList]);

  // Stable refs for chrome breadcrumb actions — a fresh () => loadList() each
  // render retriggers useDesktopSectionBreadcrumb and ANRs the Chat channel.
  const refresh = useCallback(() => {
    void loadList();
  }, [loadList]);
  const resolve = useCallback(() => setStatus("resolved"), [setStatus]);
  const reopen = useCallback(() => setStatus("open"), [setStatus]);

  return {
    conversations,
    selectedId,
    detail,
    loading,
    detailLoading,
    sending,
    error,
    refresh,
    selectConversation,
    sendMessage,
    resolve,
    reopen,
  };
}
