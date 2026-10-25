import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChatConversation,
  ChatConversationDetail,
  ChatConversationsList,
  ChatMessage,
} from "@backsteros/contracts";

import { useDesktopApi } from "../api-context";
import { showNativeWorkspaceNotification } from "../inbox/native-notifications";
import {
  startChatEventsLoop,
  type ChatTypingPayload,
  type ChatUpdatedPayload,
} from "./chat-events";

/** Drop stale typing badges if Chatwoot never sends typing_off. */
const TYPING_EXPIRE_MS = 6_000;
import {
  createOptimisticOutgoingMessage,
  mergeChatMessageLists,
  removeChatMessageById,
  replaceOptimisticChatMessage,
} from "./chat-message-merge";
import { setChatUnreadCount } from "./chat-unread-store";

/** Coalesce bursty twin/SSE updates into one list reload. */
const SSE_RELOAD_DEBOUNCE_MS = 250;
/** Catch-up while live (SSE is primary). Match email inbox cadence. */
const LIVE_CATCHUP_POLL_MS = 60_000;

export type UseChatInboxOptions = {
  /**
   * When true, keep list + SSE + notifications alive (Communication keep-alive
   * pane). Independent of whether Chat is the focused channel.
   */
  enabled?: boolean;
  /**
   * True while Communication → Chat is the visible channel. Suppresses native
   * notifications for the open thread; still receives SSE updates.
   */
  channelFocused?: boolean;
};

function conversationNotifyTitle(row: ChatConversation | undefined): string {
  if (!row) return "New chat message";
  return (
    row.contactName?.trim() ||
    row.contactEmail?.trim() ||
    row.contactPhone?.trim() ||
    "New chat message"
  );
}

export function useChatInbox(options?: UseChatInboxOptions) {
  const enabled = options?.enabled !== false;
  const channelFocused = options?.channelFocused === true;
  const { client } = useDesktopApi();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ChatConversationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typingIds, setTypingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const selectedIdRef = useRef<string | null>(null);
  const channelFocusedRef = useRef(channelFocused);
  const conversationsRef = useRef<ChatConversation[]>([]);
  const hydratedRef = useRef(false);
  const sseReloadTimerRef = useRef<number | null>(null);
  const listAbortRef = useRef<AbortController | null>(null);
  const listGenerationRef = useRef(0);
  const typingExpireTimersRef = useRef<Map<string, number>>(new Map());
  selectedIdRef.current = selectedId;
  channelFocusedRef.current = channelFocused;
  conversationsRef.current = conversations;

  const unreadCount = useMemo(
    () => conversations.reduce((count, row) => count + (row.unread ? 1 : 0), 0),
    [conversations],
  );

  useEffect(() => {
    setChatUnreadCount(enabled ? unreadCount : 0);
  }, [enabled, unreadCount]);

  useEffect(() => {
    return () => {
      listGenerationRef.current += 1;
      listAbortRef.current?.abort();
      listAbortRef.current = null;
      setChatUnreadCount(0);
    };
  }, []);

  const loadList = useCallback(
    async (opts?: { silent?: boolean }): Promise<ChatConversation[] | null> => {
      if (!enabled) return null;
      const silent = opts?.silent === true && hydratedRef.current;
      // Skip catch-up polls while an explicit refresh is in flight.
      if (silent && listAbortRef.current) return null;
      if (!silent) {
        listAbortRef.current?.abort();
        setLoading(true);
        setError(null);
      }
      const generation = ++listGenerationRef.current;
      const controller = new AbortController();
      if (!silent) listAbortRef.current = controller;
      const isCurrent = () =>
        generation === listGenerationRef.current && !controller.signal.aborted;
      const attempt = async () => {
        const body = await client.requestJson<ChatConversationsList>(
          "/api/v1/chat/conversations?limit=50",
          { signal: controller.signal },
        );
        if (!isCurrent()) return null;
        setConversations(body.conversations);
        conversationsRef.current = body.conversations;
        hydratedRef.current = true;
        return body.conversations;
      };
      try {
        return await attempt();
      } catch (_err) {
        if (!isCurrent()) return null;
        // WebKit surfaces transient local-core blips as "Load failed".
        try {
          await new Promise((resolve) => setTimeout(resolve, 600));
          if (!isCurrent()) return null;
          return await attempt();
        } catch (retryErr) {
          if (!isCurrent() || silent) return null;
          const message =
            retryErr instanceof Error
              ? retryErr.message
              : "Could not load chat conversations.";
          setError(
            message === "Load failed" || message === "Failed to fetch"
              ? "Could not reach local-core. Try Refresh in a moment."
              : message,
          );
          return null;
        }
      } finally {
        if (!silent && listAbortRef.current === controller) {
          listAbortRef.current = null;
        }
        if (!silent && generation === listGenerationRef.current) {
          setLoading(false);
        }
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
        // Selection may have moved while this request was in flight.
        if (selectedIdRef.current !== conversationId) return;
        setDetail((prev) => {
          if (
            silent &&
            prev &&
            prev.id === conversationId &&
            prev.messages.length > 0
          ) {
            return {
              ...body,
              messages: mergeChatMessageLists(prev.messages, body.messages),
            };
          }
          return body;
        });
        setConversations((prev) =>
          prev.map((row) =>
            row.id === conversationId ? { ...row, unread: false } : row,
          ),
        );
      } catch (err) {
        if (silent) return;
        if (selectedIdRef.current !== conversationId) return;
        const message =
          err instanceof Error ? err.message : "Could not load conversation.";
        // Stale / misclassified deep links (support slug before list hydrate)
        // used to leave this banner stuck after the real item loaded.
        if (/conversation not found/i.test(message)) {
          setError(null);
          setDetail(null);
          setSelectedId(null);
          return;
        }
        setError(message);
      } finally {
        if (!silent) setDetailLoading(false);
      }
    },
    [client],
  );

  const selectConversation = useCallback(
    (conversationId: string | null) => {
      setSelectedId(conversationId);
      if (!conversationId) {
        setDetail(null);
        setError(null);
        setDetailLoading(false);
        return;
      }
      void loadDetail(conversationId);
    },
    [loadDetail],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!selectedId) return;
      const trimmed = content.trim();
      if (!trimmed) return;

      const optimistic = createOptimisticOutgoingMessage({
        conversationId: selectedId,
        content: trimmed,
      });
      const conversationId = selectedId;
      const nowIso = optimistic.createdAt;

      // Optimistic path — don't gate the composer on `sending` (Resolve/Reopen
      // still use that flag). Failures roll the local bubble back.
      setError(null);
      setDetail((prev) =>
        prev && prev.id === conversationId
          ? { ...prev, messages: [...prev.messages, optimistic] }
          : prev,
      );
      setConversations((prev) => {
        const next = prev.map((row) =>
          row.id === conversationId
            ? {
                ...row,
                lastMessagePreview: trimmed.slice(0, 280),
                lastActivityAt: nowIso,
                unread: false,
              }
            : row,
        );
        return [...next].sort((a, b) =>
          (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""),
        );
      });

      try {
        // Stop agent typing before/with the send so the widget clears promptly.
        void client
          .requestJson<{ ok: boolean }>(
            `/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/typing`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ typing: false }),
            },
          )
          .catch(() => {});
        const message = await client.requestJson<ChatMessage>(
          `/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content: trimmed }),
          },
        );
        setDetail((prev) =>
          prev && prev.id === conversationId
            ? {
                ...prev,
                messages: replaceOptimisticChatMessage(
                  prev.messages,
                  optimistic.id,
                  message,
                ),
              }
            : prev,
        );
        setConversations((prev) => {
          const next = prev.map((row) =>
            row.id === conversationId
              ? {
                  ...row,
                  lastMessagePreview: trimmed.slice(0, 280),
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
        setDetail((prev) =>
          prev && prev.id === conversationId
            ? {
                ...prev,
                messages: removeChatMessageById(prev.messages, optimistic.id),
              }
            : prev,
        );
        setError(err instanceof Error ? err.message : "Could not send message.");
        throw err;
      }
    },
    [client, selectedId],
  );

  const applyConversationPatch = useCallback(
    (conversationId: string, body: ChatConversation) => {
      setDetail((prev) =>
        prev && prev.id === conversationId ? { ...prev, ...body } : prev,
      );
      setConversations((prev) =>
        prev.map((row) =>
          row.id === conversationId ? { ...row, ...body } : row,
        ),
      );
    },
    [],
  );

  const patchConversation = useCallback(
    async (
      patch: {
        status?: ChatConversation["status"];
        assigneeId?: string | null;
        priority?: number;
        dueDate?: string | null;
      },
      conversationId: string | null = selectedIdRef.current,
    ) => {
      if (!conversationId) return;
      setSending(true);
      setError(null);
      try {
        const body = await client.requestJson<ChatConversation>(
          `/api/v1/chat/conversations/${encodeURIComponent(conversationId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(patch),
          },
        );
        applyConversationPatch(conversationId, body);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not update conversation.",
        );
        throw err;
      } finally {
        setSending(false);
      }
    },
    [applyConversationPatch, client],
  );

  const setStatus = useCallback(
    async (
      status: ChatConversation["status"],
      conversationId: string | null = selectedIdRef.current,
    ) => {
      await patchConversation({ status }, conversationId);
    },
    [patchConversation],
  );

  useEffect(() => {
    if (!enabled) return;
    void loadList();
  }, [enabled, loadList]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const clearTypingExpire = (conversationId: string) => {
      const existing = typingExpireTimersRef.current.get(conversationId);
      if (existing != null) {
        window.clearTimeout(existing);
        typingExpireTimersRef.current.delete(conversationId);
      }
    };
    const applyTyping = (payload: ChatTypingPayload) => {
      const id = payload.conversationId.trim();
      if (!id) return;
      clearTypingExpire(id);
      setTypingIds((prev) => {
        const next = new Set(prev);
        if (payload.typing) next.add(id);
        else next.delete(id);
        return next;
      });
      if (!payload.typing) return;
      // Safety net — Chatwoot sometimes omits typing_off.
      const timer = window.setTimeout(() => {
        typingExpireTimersRef.current.delete(id);
        setTypingIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, TYPING_EXPIRE_MS);
      typingExpireTimersRef.current.set(id, timer);
    };
    const scheduleLiveReload = (payload: ChatUpdatedPayload) => {
      // A new message ends the typing indicator for that thread.
      if (payload.kind === "message") {
        applyTyping({ conversationId: payload.conversationId, typing: false });
      }
      if (sseReloadTimerRef.current != null) {
        window.clearTimeout(sseReloadTimerRef.current);
      }
      sseReloadTimerRef.current = window.setTimeout(() => {
        sseReloadTimerRef.current = null;
        void (async () => {
          const rows = await loadList({ silent: true });
          const focused = channelFocusedRef.current;
          const selected = selectedIdRef.current;
          if (focused && selected === payload.conversationId) {
            await loadDetail(payload.conversationId, { silent: true });
            return;
          }
          if (payload.kind !== "message") return;
          const row = (rows ?? conversationsRef.current).find(
            (entry) => entry.id === payload.conversationId,
          );
          const preview = row?.lastMessagePreview?.trim();
          void showNativeWorkspaceNotification({
            key: `chat:${payload.conversationId}:${payload.messageId ?? "m"}`,
            title: conversationNotifyTitle(row),
            body:
              preview && preview.length > 0
                ? preview.slice(0, 160)
                : "New message in Communication → Chat.",
          });
        })();
      }, SSE_RELOAD_DEBOUNCE_MS);
    };
    const typingExpireTimers = typingExpireTimersRef.current;
    startChatEventsLoop({
      client,
      signal: controller.signal,
      onUpdated: scheduleLiveReload,
      onTyping: applyTyping,
    });
    return () => {
      controller.abort();
      if (sseReloadTimerRef.current != null) {
        window.clearTimeout(sseReloadTimerRef.current);
        sseReloadTimerRef.current = null;
      }
      for (const timer of typingExpireTimers.values()) {
        window.clearTimeout(timer);
      }
      typingExpireTimers.clear();
      setTypingIds(new Set());
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

  const setTyping = useCallback(
    (typing: boolean, conversationId: string | null = selectedIdRef.current) => {
      if (!conversationId) return;
      void client
        .requestJson<{ ok: boolean }>(
          `/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/typing`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ typing }),
          },
        )
        .catch(() => {
          // Typing is best-effort — don't surface as a chat error.
        });
    },
    [client],
  );

  const deleteConversation = useCallback(
    async (
      conversationId: string | null = selectedIdRef.current,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const id = conversationId?.trim() || null;
      if (!id) {
        return { ok: false, error: "Conversation is required." };
      }
      setConversations((prev) => prev.filter((row) => row.id !== id));
      if (selectedIdRef.current === id) {
        setSelectedId(null);
        setDetail(null);
      }
      try {
        await client.requestJson<{ ok: true }>(
          `/api/v1/chat/conversations/${encodeURIComponent(id)}`,
          { method: "DELETE" },
        );
        return { ok: true };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not delete conversation.";
        setError(message);
        void loadList({ silent: true });
        return { ok: false, error: message };
      }
    },
    [client, loadList],
  );

  return {
    conversations,
    selectedId,
    detail,
    loading,
    detailLoading,
    sending,
    error,
    unreadCount,
    typingIds,
    refresh,
    selectConversation,
    sendMessage,
    setTyping,
    setStatus,
    patchConversation,
    deleteConversation,
    resolve,
    reopen,
  };
}
