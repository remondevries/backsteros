import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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
  dispatchAgentShellChatMessage,
  dispatchAgentShellChatStatus,
  startAgentShellChatEventsLoop,
  type AgentShellChatMessagePayload,
} from "../lib/agent-shell-chat-events";
import { useDesktopAvatarSrcMap } from "../lib/avatar-src";
import {
  isCloudCoreApiError,
} from "../lib/cloud-core-api";
import { useDesktopApi } from "../lib/api-context";
import { openShellChatPeer } from "../lib/shell-chat-open-peer";
import {
  shellChatRequestJson,
  shellChatRequestStream,
} from "../lib/shell-chat-transport";
import { useDesktopWorkspacePeople } from "../lib/workspace-data";
import { useShellAgentChat } from "./use-shell-agent-chat";

/** Slow catch-up; live updates come from shell-chat SSE (local or cloud). */
const POLL_MS = 60_000;

type ThreadPushListener = (payload: AgentShellChatMessagePayload) => void;

/** One SSE loop for the whole shell. */
const shellChatLive = {
  readyAgentIds: new Set<string>(),
  abort: null as AbortController | null,
  subscribers: new Set<ThreadPushListener>(),
  onReload: null as null | (() => void),
  requestStream: null as
    | null
    | ((path: string, init?: RequestInit) => Promise<Response>),
};

function ensureShellChatLiveLoop(): void {
  if (shellChatLive.abort) return;
  const controller = new AbortController();
  shellChatLive.abort = controller;
  startAgentShellChatEventsLoop({
    signal: controller.signal,
    requestStream: shellChatLive.requestStream ?? undefined,
    onLive: () => {
      shellChatLive.onReload?.();
    },
    onMessage: (payload) => {
      if (import.meta.env.DEV) {
        console.info(
          "[shell-chat-sse] message",
          payload.threadId,
          payload.message.id,
        );
      }
      dispatchAgentShellChatMessage(payload);
      dispatchAgentShellChatStatus({
        threadId: payload.threadId,
        agentId: payload.agentId,
        state: "idle",
        at: payload.message.createdAt,
        pendingReplyAt: null,
        label: null,
      });
      for (const listener of shellChatLive.subscribers) {
        listener(payload);
      }
    },
    onStatus: (payload) => {
      if (import.meta.env.DEV) {
        console.info(
          "[shell-chat-sse] status",
          payload.threadId,
          payload.state,
        );
      }
      dispatchAgentShellChatStatus(payload);
    },
  });
}

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

const AgentDmNotificationsContext =
  createContext<UseAgentDmNotificationsResult | null>(null);

/**
 * Single owner of DM thread list + shell-chat SSE (poll / focus / push).
 * Mount once at shell chrome so banner + chat column share one subscription.
 */
function useAgentDmNotificationsState(): UseAgentDmNotificationsResult {
  const { client, apiUrl } = useDesktopApi();
  const { webhookReadyAgents } = useShellAgentChat();
  const { contacts } = useDesktopWorkspacePeople();
  const [threads, setThreads] = useState<ChatThreadListItem[]>([]);
  const [seenTick, setSeenTick] = useState(0);

  useEffect(() => {
    const next = shellChatRequestStream(apiUrl, client);
    const prev = shellChatLive.requestStream;
    shellChatLive.requestStream = next;
    // Restart SSE when transport flips (cloud door ↔ local-core).
    if (prev !== next && shellChatLive.abort) {
      shellChatLive.abort.abort();
      shellChatLive.abort = null;
      ensureShellChatLiveLoop();
    }
  }, [apiUrl, client]);

  const readyAgentIds = useMemo(
    () => new Set(webhookReadyAgents.map((agent) => agent.id)),
    [webhookReadyAgents],
  );

  // Same contact avatar resolution as the shell chat peers — agents.avatarUrl
  // is usually empty; the photo lives on the linked contact's storage key.
  const agentContacts = useMemo(() => {
    const byId = new Map(contacts.map((contact) => [contact.id, contact]));
    const ordered: typeof contacts = [];
    const seen = new Set<string>();
    for (const agent of webhookReadyAgents) {
      const contactId = agent.contactId?.trim();
      if (!contactId || seen.has(contactId)) continue;
      const contact = byId.get(contactId);
      if (!contact) continue;
      seen.add(contactId);
      ordered.push(contact);
    }
    for (const thread of threads) {
      const contactId = thread.agentContactId?.trim();
      if (!contactId || seen.has(contactId)) continue;
      const contact = byId.get(contactId);
      if (!contact) continue;
      seen.add(contactId);
      ordered.push(contact);
    }
    return ordered;
  }, [contacts, threads, webhookReadyAgents]);

  const avatarSrcByContactId = useDesktopAvatarSrcMap("contact", agentContacts);

  const reload = useCallback(async () => {
    if (readyAgentIds.size === 0) {
      setThreads([]);
      return;
    }
    try {
      const body = await shellChatRequestJson<ChatThreadsList>(
        apiUrl,
        client,
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
  }, [apiUrl, client, readyAgentIds.size]);

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
    shellChatLive.readyAgentIds = readyAgentIds;
    shellChatLive.onReload = () => {
      void reload();
    };
    ensureShellChatLiveLoop();
    const onPush: ThreadPushListener = (payload) => {
      if (!shellChatLive.readyAgentIds.has(payload.agentId)) return;
      setThreads((prev) => {
        const { threads: next, found } = applyShellChatPush(prev, payload);
        if (!found) {
          void reload();
          return prev;
        }
        return next;
      });
    };
    shellChatLive.subscribers.add(onPush);
    return () => {
      shellChatLive.subscribers.delete(onPush);
    };
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
    const contactById = new Map(
      agentContacts.map((contact) => [contact.id, contact]),
    );

    for (const thread of threads) {
      if (!readyAgentIds.has(thread.agentId)) continue;
      const message = thread.lastAssistantMessage;
      if (!message || message.status === "error") continue;
      if (!isAgentDmMessageUnseen(thread.id, message.id)) continue;

      const agentName = thread.agentName.trim() || "Agent";
      const contactId = thread.agentContactId?.trim() || null;
      const contact = contactId ? contactById.get(contactId) : undefined;
      const messageId = message.id;
      const threadId = thread.id;

      unread.push({
        id: `${threadId}:${messageId}`,
        agentName,
        avatarSrc:
          (contactId ? avatarSrcByContactId[contactId] : null) ??
          contact?.avatarSrc ??
          thread.agentAvatarUrl ??
          null,
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
  }, [
    agentContacts,
    avatarSrcByContactId,
    readyAgentIds,
    seenTick,
    threads,
  ]);

  return { items };
}

export function AgentDmNotificationsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const value = useAgentDmNotificationsState();
  // createElement — keep this module `.ts` so Vite HMR does not stick on a
  // renamed `.tsx` URL after the JSX transform failure.
  return createElement(
    AgentDmNotificationsContext.Provider,
    { value },
    children,
  );
}

/**
 * Unseen assistant replies on cloud chat threads → sidebar DM cards.
 * Must be under {@link AgentDmNotificationsProvider}.
 */
export function useAgentDmNotifications(): UseAgentDmNotificationsResult {
  const value = useContext(AgentDmNotificationsContext);
  if (!value) {
    throw new Error(
      "useAgentDmNotifications requires AgentDmNotificationsProvider",
    );
  }
  return value;
}
