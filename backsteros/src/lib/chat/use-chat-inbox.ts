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
  selectedIdRef.current = selectedId;

  const loadList = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const body = await client.requestJson<ChatConversationsList>(
        "/api/v1/chat/conversations?limit=50",
      );
      setConversations(body.conversations);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load chat conversations.",
      );
    } finally {
      setLoading(false);
    }
  }, [client, enabled]);

  const loadDetail = useCallback(
    async (conversationId: string) => {
      setDetailLoading(true);
      setError(null);
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
        setError(
          err instanceof Error ? err.message : "Could not load conversation.",
        );
      } finally {
        setDetailLoading(false);
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
        setConversations((prev) =>
          prev.map((row) =>
            row.id === selectedId
              ? {
                  ...row,
                  lastMessagePreview: content.slice(0, 280),
                  lastActivityAt: message.createdAt,
                  unread: false,
                }
              : row,
          ),
        );
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
    startChatEventsLoop({
      client,
      signal: controller.signal,
      onUpdated: (payload: ChatUpdatedPayload) => {
        void (async () => {
          await loadList();
          if (selectedIdRef.current === payload.conversationId) {
            await loadDetail(payload.conversationId);
          } else if (payload.kind === "message") {
            const title = "New chat message";
            const body = "A visitor sent a message in Communication → Chat.";
            void showNativeWorkspaceNotification({
              key: `chat:${payload.conversationId}:${payload.messageId ?? "m"}`,
              title,
              body,
            });
          }
        })();
      },
    });
    return () => controller.abort();
  }, [client, enabled, loadDetail, loadList]);

  return {
    conversations,
    selectedId,
    detail,
    loading,
    detailLoading,
    sending,
    error,
    refresh: loadList,
    selectConversation,
    sendMessage,
    resolve: () => setStatus("resolved"),
    reopen: () => setStatus("open"),
  };
}
