import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatThreadListItem, ChatThreadsList } from "@backsteros/contracts";
import type { AgentMessageNotificationItem } from "@backsteros/ui/shell";

import {
  AGENT_DM_SEEN_CHANGED_EVENT,
  bootstrapAgentDmSeenIfNeeded,
  isAgentDmMessageUnseen,
  markAgentDmSeen,
} from "../lib/agent-dm-seen";
import {
  cloudCoreRequestJson,
  isCloudCoreApiError,
} from "../lib/cloud-core-api";
import { openShellChatPeer } from "../lib/shell-chat-open-peer";
import { useShellAgentChat } from "./use-shell-agent-chat";

const POLL_MS = 12_000;

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

export type UseAgentDmNotificationsResult = {
  items: AgentMessageNotificationItem[];
};

/**
 * Unseen assistant replies on cloud chat threads → sidebar DM cards.
 * Seen state is local (open or dismiss).
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
    const onSeen = () => setSeenTick((value) => value + 1);
    window.addEventListener(AGENT_DM_SEEN_CHANGED_EVENT, onSeen);
    return () => window.removeEventListener(AGENT_DM_SEEN_CHANGED_EVENT, onSeen);
  }, []);

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
