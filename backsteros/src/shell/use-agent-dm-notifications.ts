import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ChatThreadListItem,
  ChatThreadMessage,
  ChatThreadsList,
} from "@backsteros/contracts";
import type { AgentMessageNotificationItem } from "@backsteros/ui/shell";

import {
  AGENT_DM_SEEN_CHANGED_EVENT,
  AGENT_DM_THREADS_INVALIDATE_EVENT,
  bootstrapAgentDmSeenIfNeeded,
  isAgentDmMessageUnseen,
  markAgentDmSeen,
} from "../lib/agent-dm-seen";
import {
  dispatchAgentShellChatStatus,
  startAgentShellChatEventsLoop,
  type AgentShellChatMessagePayload,
} from "../lib/agent-shell-chat-events";
import {
  cloudCoreRequestJson,
  isCloudCoreApiError,
} from "../lib/cloud-core-api";
import { openShellChatPeer } from "../lib/shell-chat-open-peer";
import { useShellAgentChat } from "./use-shell-agent-chat";

/** Slow catch-up; live updates come from cloud SSE. */
const POLL_MS = 60_000;

function formatShortRelative(iso: string, nowMs = Date.now()): string {
  const epoch = Date.parse(iso);
  if (Number.isNaN(epoch)) return "";
  const minutes = Math.floor(Math.max(0, nowMs - epoch) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

function previewFromBody(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (!flat) return "New message";
  return flat.length > 96 ? `${flat.slice(0, 95)}…` : flat;
}

function applyShellChatPush(
  threads: ChatThreadListItem[],
  payload: AgentShellChatMessagePayload,
): { threads: ChatThreadListItem[]; found: boolean } {
  const index = threads.findIndex((thread) => thread.id === payload.threadId);
  if (index < 0) return { threads, found: false };
  const existing = threads[index]!;
  const last: ChatThreadMessage = {
    id: payload.message.id,
    threadId: payload.threadId,
    role: "assistant",
    authorContactId: existing.agentContactId,
    authorName: existing.agentName,
    body: payload.message.body,
    status: "done",
    createdAt: payload.message.createdAt,
    updatedAt: payload.message.createdAt,
  };
  const next = threads.slice();
  next[index] = {
    ...existing,
    updatedAt: payload.message.createdAt,
    lastAssistantMessage: last,
  };
  return { threads: next, found: true };
}

export type UseAgentDmNotificationsResult = {
  items: AgentMessageNotificationItem[];
};

/**
 * Unseen assistant replies on cloud chat threads → sidebar DM cards.
 * Push via cloud SSE; 60s poll + reconnect refetch as fallback.
 */
export function useAgentDmNotifications(): UseAgentDmNotificationsResult {
  const { webhookReadyAgents } = useShellAgentChat();
  const [threads, setThreads] = useState<ChatThreadListItem[]>([]);
  const [seenTick, setSeenTick] = useState(0);

  const readyAgentIds = useMemo(
    () => new Set(webhookReadyAgents.map((agent) => agent.id)),
    [webhookReadyAgents],
  );

  const reload = useCallback(async () => {
    if (readyAgentIds.size === 0) {
      setThreads([]);
      return;
    }
    try {
      const body = await cloudCoreRequestJson<ChatThreadsList>(
        "/api/v1/chat/threads",
      );
      bootstrapAgentDmSeenIfNeeded(
        body.threads.flatMap((thread) => {
          const message = thread.lastAssistantMessage;
          if (!message) return [];
          return [{ threadId: thread.id, messageId: message.id }];
        }),
      );
      setThreads(body.threads);
    } catch (error) {
      if (isCloudCoreApiError(error) && error.status === 401) {
        setThreads([]);
        return;
      }
      /* keep previous */
    }
  }, [readyAgentIds.size]);

  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => {
      void reload();
    }, POLL_MS);
    const onFocus = () => {
      void reload();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [reload]);

  useEffect(() => {
    if (readyAgentIds.size === 0) return;
    const controller = new AbortController();
    startAgentShellChatEventsLoop({
      signal: controller.signal,
      onLive: () => {
        void reload();
      },
      onMessage: (payload) => {
        if (!readyAgentIds.has(payload.agentId)) return;
        // Reply implies idle for the open chat thinking indicator.
        dispatchAgentShellChatStatus({
          threadId: payload.threadId,
          agentId: payload.agentId,
          state: "idle",
          at: payload.message.createdAt,
          pendingReplyAt: null,
        });
        setThreads((prev) => {
          const { threads: next, found } = applyShellChatPush(prev, payload);
          if (!found) {
            void reload();
            return prev;
          }
          return next;
        });
      },
      onStatus: (payload) => {
        if (!readyAgentIds.has(payload.agentId)) return;
        dispatchAgentShellChatStatus(payload);
      },
    });
    return () => controller.abort();
  }, [readyAgentIds, reload]);

  useEffect(() => {
    const onSeen = () => setSeenTick((value) => value + 1);
    window.addEventListener(AGENT_DM_SEEN_CHANGED_EVENT, onSeen);
    return () => window.removeEventListener(AGENT_DM_SEEN_CHANGED_EVENT, onSeen);
  }, []);

  useEffect(() => {
    const onInvalidate = () => {
      void reload();
    };
    window.addEventListener(AGENT_DM_THREADS_INVALIDATE_EVENT, onInvalidate);
    return () =>
      window.removeEventListener(AGENT_DM_THREADS_INVALIDATE_EVENT, onInvalidate);
  }, [reload]);

  const items = useMemo((): AgentMessageNotificationItem[] => {
    void seenTick;
    const now = Date.now();
    const unread: AgentMessageNotificationItem[] = [];

    for (const thread of threads) {
      if (!readyAgentIds.has(thread.agentId)) continue;
      const message = thread.lastAssistantMessage;
      if (!message || message.status === "error") continue;
      if (!isAgentDmMessageUnseen(thread.id, message.id)) continue;

      const agentName = thread.agentName.trim() || "Agent";
      const contactId = thread.agentContactId?.trim() || null;
      const messageId = message.id;
      const threadId = thread.id;

      unread.push({
        id: `${threadId}:${messageId}`,
        agentName,
        avatarSrc: thread.agentAvatarUrl,
        preview: previewFromBody(message.body),
        timestamp: formatShortRelative(message.createdAt, now),
        unread: true,
        onOpen: () => {
          markAgentDmSeen(threadId, messageId);
          if (contactId) openShellChatPeer(contactId);
        },
        onDismiss: () => {
          markAgentDmSeen(threadId, messageId);
        },
      });
    }

    return unread;
  }, [readyAgentIds, seenTick, threads]);

  return { items };
}
