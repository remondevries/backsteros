"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type {
  AnswerChatThreadMessageChoicesResult,
  ChatThreadMessageChoices,
  ChatThreadMessageChoicesAnswer,
  ChatThreadWithMessages,
  ChatUiFilePart,
  ChatUiMessage,
  CreateChatThreadMessageResult,
} from "@backsteros/contracts";

import { buildChatUiDemoMessages } from "../../chat/chat-ui-demo-fixture.js";
import {
  pruneRecentChatProjectIds,
  readRecentChatProjectIds,
  rememberRecentChatProjectId,
  resolveRecentChatProjectsForStrip,
  type ChatProjectOption,
} from "../../chat/chat-project-option.js";
import { chatThinkingRemainingMs } from "../../chat/chat-thinking-state.js";
import {
  createCoalescedRunner,
  createLiveAgentThreadState,
  liveAgentThreadReducer,
  liveAgentThreadView,
} from "../../chat/live-agent-thread-state.js";
import type { ChatCardNavigate } from "./chat-card-navigate.js";
import { ChatThread } from "./chat-thread.js";
import type { ChatThreadPeer } from "./chat-thread-header.js";

/** Dispatched by desktop shell when cloud SSE pushes agent.chat.status. */
export const AGENT_SHELL_CHAT_STATUS_WINDOW_EVENT =
  "backsteros:agent-shell-chat-status";

/** Dispatched by desktop shell when cloud SSE pushes agent.chat.message. */
export const AGENT_SHELL_CHAT_MESSAGE_WINDOW_EVENT =
  "backsteros:agent-shell-chat-message";

export type LiveAgentChatHandlers = {
  /** contactId → agent id for peers that have an agents record. */
  agentIdByContactId: ReadonlyMap<string, string>;
  openThread: (agentId: string) => Promise<ChatThreadWithMessages>;
  sendMessage: (
    threadId: string,
    body: string,
  ) => Promise<CreateChatThreadMessageResult>;
  getThread: (threadId: string) => Promise<ChatThreadWithMessages>;
  deleteMessages?: (
    threadId: string,
    messageIds: readonly string[],
  ) => Promise<{ deletedIds: string[] }>;
  answerChoices?: (
    threadId: string,
    messageId: string,
    values: readonly string[],
  ) => Promise<AnswerChatThreadMessageChoicesResult>;
};

/** Safety-net refetch while the agent is thinking, in case SSE drops. */
const LIVE_THREAD_THINKING_POLL_MS = 5_000;

const FALLBACK_JUDITH: ChatThreadPeer = {
  id: "judith-fallback",
  kind: "contact",
  name: "Judith",
};

const FALLBACK_NIELS: ChatThreadPeer = {
  id: "niels-fallback",
  kind: "contact",
  name: "Niels",
};

function peerMatchesName(peer: ChatThreadPeer, name: string): boolean {
  const target = name.trim().toLowerCase();
  const full = peer.name.trim().toLowerCase();
  const first = peer.name.split(/\s+/)[0]?.trim().toLowerCase() ?? "";
  return full === target || first === target || full.startsWith(`${target} `);
}

function findPeerByName(
  peers: readonly ChatThreadPeer[],
  name: string,
): ChatThreadPeer | null {
  return peers.find((peer) => peerMatchesName(peer, name)) ?? null;
}

/** Demo thread key: general agent chat or project room + active agent. */
export function chatDemoThreadKey(
  peerId: string,
  projectId: string | null,
): string {
  return projectId ? `project:${projectId}:${peerId}` : `agent:${peerId}`;
}

function buildAgentStarterMessages(peer: ChatThreadPeer): ChatUiMessage[] {
  const now = new Date().toISOString();
  return [
    {
      id: `sys-${peer.id}`,
      role: "system",
      status: "done",
      createdAt: now,
      parts: [{ type: "status-line", text: `Chat with ${peer.name}` }],
    },
    {
      id: `agent-hi-${peer.id}`,
      role: "assistant",
      author: { name: peer.name },
      status: "done",
      createdAt: now,
      parts: [
        {
          type: "text",
          text: `Hi — I'm ${peer.name}. Switch peers in the header to keep separate threads open.`,
        },
      ],
    },
  ];
}

function buildProjectRoomMessages(
  project: ChatProjectOption,
  peer: ChatThreadPeer,
): ChatUiMessage[] {
  const now = new Date().toISOString();
  return [
    {
      id: `sys-project-${project.id}`,
      role: "system",
      status: "done",
      createdAt: now,
      parts: [
        {
          type: "status-line",
          text: `Joined ${project.name} · chatting with ${peer.name}`,
        },
      ],
    },
    {
      id: `agent-project-${project.id}-${peer.id}`,
      role: "assistant",
      author: { name: peer.name },
      status: "done",
      createdAt: now,
      parts: [
        {
          type: "text",
          text: `You're in **${project.name}**. I'm ${peer.name}, the default agent for this project. Switch peers anytime — recent projects stay in the strip.`,
        },
      ],
    },
  ];
}

function ensureThreadMessages(
  threads: Record<string, ChatUiMessage[]>,
  key: string,
  factory: () => ChatUiMessage[],
): Record<string, ChatUiMessage[]> {
  if (threads[key]) return threads;
  return { ...threads, [key]: factory() };
}

export type ChatUiDevPreviewProps = {
  /**
   * Peers for the header (Judith + Niels + agent contacts). Desktop resolves
   * these from workspace contacts and Settings → API → Agent keys.
   */
  peers?: readonly ChatThreadPeer[] | null;
  /** Workspace projects for the `/` Projects group. */
  projects?: readonly ChatProjectOption[] | null;
  /** Same navigate callback as the shell chat column (navigateToHref). */
  onNavigate?: ChatCardNavigate | null;
  /**
   * When set, peers that map to an agents record use the real chat loop
   * (OS-150) instead of the in-memory demo thread. Project rooms stay demo.
   */
  liveAgentChat?: LiveAgentChatHandlers | null;
  /**
   * OS-155: when true and `peers` is empty, do not inject Judith fallback —
   * show the webhook setup empty state instead.
   */
  allowEmptyPeers?: boolean;
  /** Settings href for the webhook setup empty state (default Agent tab). */
  webhookSetupHref?: string;
  /** Optional body copy when the webhook setup empty state is shown. */
  webhookSetupMessage?: string | null;
};

/**
 * Dev-only preview for the ChatThread foundation. Used by `/dev/chat-ui` and
 * the shell right chat column. Existing Messages UI is unchanged.
 */
export function ChatUiDevPreview({
  peers = null,
  projects = null,
  onNavigate = null,
  liveAgentChat = null,
  allowEmptyPeers = false,
  webhookSetupHref = "/settings/api?type=agent",
  webhookSetupMessage = null,
}: ChatUiDevPreviewProps) {
  const resolvedPeers = useMemo(() => {
    if (peers && peers.length > 0) return [...peers];
    if (allowEmptyPeers) return [];
    return [FALLBACK_JUDITH];
  }, [allowEmptyPeers, peers]);

  const resolvedProjects = useMemo(
    () => (projects && projects.length > 0 ? projects : []),
    [projects],
  );

  const defaultPeer =
    findPeerByName(resolvedPeers, "Judith") ??
    resolvedPeers[0] ??
    (allowEmptyPeers ? null : FALLBACK_JUDITH);
  /** Default project-room agent — only shown in the strip while in a project. */
  const projectPeer =
    findPeerByName(resolvedPeers, "Niels") ?? FALLBACK_NIELS;

  const [activePeerId, setActivePeerId] = useState(
    defaultPeer?.id ?? FALLBACK_JUDITH.id,
  );
  const [projectId, setProjectId] = useState<string | null>(null);
  const [recentProjectIds, setRecentProjectIds] = useState<string[]>(() =>
    readRecentChatProjectIds(),
  );
  const [threads, setThreads] = useState<Record<string, ChatUiMessage[]>>(
    () => {
      if (!defaultPeer) return {};
      const key = chatDemoThreadKey(defaultPeer.id, null);
      return {
        [key]: buildChatUiDemoMessages(),
      };
    },
  );

  // Sidebar DM card / external “open this agent” requests.
  useEffect(() => {
    const onOpenPeer = (event: Event) => {
      const detail = (event as CustomEvent<{ contactId?: string }>).detail;
      const contactId = detail?.contactId?.trim();
      if (!contactId) return;
      if (!resolvedPeers.some((peer) => peer.id === contactId)) return;
      setProjectId(null);
      setActivePeerId(contactId);
    };
    window.addEventListener("backsteros:shell-chat-open-peer", onOpenPeer);
    return () => {
      window.removeEventListener("backsteros:shell-chat-open-peer", onOpenPeer);
    };
  }, [resolvedPeers]);

  // When desktop finishes loading agent contacts, merge peers without wiping
  // threads the user already typed into.
  useEffect(() => {
    setActivePeerId((current) =>
      resolvedPeers.some((peer) => peer.id === current)
        ? current
        : (findPeerByName(resolvedPeers, "Judith")?.id ??
          resolvedPeers[0]?.id ??
          (allowEmptyPeers ? current : FALLBACK_JUDITH.id)),
    );
    setThreads((prev) => {
      if (resolvedPeers.length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      for (const [index, peer] of resolvedPeers.entries()) {
        const key = chatDemoThreadKey(peer.id, null);
        if (next[key]) continue;
        next[key] =
          index === 0 && Object.keys(prev).length === 0
            ? buildChatUiDemoMessages()
            : buildAgentStarterMessages(peer);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [allowEmptyPeers, resolvedPeers]);

  const activeProject =
    projectId == null
      ? null
      : (resolvedProjects.find((project) => project.id === projectId) ?? null);

  // Drop deleted projects from the MRU strip + leave a room whose project vanished.
  useEffect(() => {
    const existingIds = resolvedProjects.map((project) => project.id);
    setRecentProjectIds(pruneRecentChatProjectIds(existingIds));
    if (projectId && !existingIds.includes(projectId)) {
      setProjectId(null);
      if (defaultPeer) setActivePeerId(defaultPeer.id);
    }
  }, [defaultPeer, projectId, resolvedProjects]);

  /**
   * Header strip: last ≤5 visited project rooms (newest immediately left of
   * Judith), then agents. Niels stays out of the strip — he's the default
   * project-room counterpart under the hood, not a header peer.
   */
  const agentPeers = useMemo(
    () =>
      resolvedPeers.filter((peer) => !peerMatchesName(peer, "Niels")),
    [resolvedPeers],
  );

  const stripProjectPeers = useMemo((): readonly ChatThreadPeer[] => {
    return resolveRecentChatProjectsForStrip(
      resolvedProjects,
      recentProjectIds,
      projectId,
    ).map((project) => ({
      id: project.id,
      kind: "project" as const,
      name: project.name,
      icon: project.icon,
      type: project.type,
    }));
  }, [projectId, recentProjectIds, resolvedProjects]);

  const visiblePeers = useMemo(
    (): readonly ChatThreadPeer[] => [...stripProjectPeers, ...agentPeers],
    [agentPeers, stripProjectPeers],
  );

  /** Agent used for messages — Niels inside a project room, else the focused agent. */
  const threadAgent =
    (projectId
      ? projectPeer
      : agentPeers.find((peer) => peer.id === activePeerId)) ??
    defaultPeer ??
    projectPeer;

  const headerActivePeerId = projectId ?? threadAgent.id;

  const needsWebhookSetup =
    allowEmptyPeers && !projectId && agentPeers.length === 0;

  const threadKey = chatDemoThreadKey(threadAgent.id, projectId);
  const liveAgentId =
    !projectId && liveAgentChat
      ? (liveAgentChat.agentIdByContactId.get(threadAgent.id) ?? null)
      : null;
  const [live, dispatchLive] = useReducer(
    liveAgentThreadReducer,
    null,
    () => createLiveAgentThreadState(liveAgentId, threadAgent.name),
  );
  const liveRef = useRef(live);
  const liveAgentChatRef = useRef(liveAgentChat);
  const threadAgentNameRef = useRef(threadAgent.name);
  liveRef.current = live;
  liveAgentChatRef.current = liveAgentChat;
  threadAgentNameRef.current = threadAgent.name;
  const liveThreadId = live.agentId === liveAgentId ? live.threadId : null;

  // Every refetch (push reconcile, idle, poll, focus) shares one in-flight GET.
  // Results are merged by id in the reducer, so a late response is harmless.
  const refreshOpenLiveThread = useMemo(
    () =>
      createCoalescedRunner(async () => {
        const threadId = liveRef.current.threadId;
        const chat = liveAgentChatRef.current;
        if (!threadId || !chat) return;
        try {
          const thread = await chat.getThread(threadId);
          dispatchLive({ type: "snapshot", thread, nowMs: Date.now() });
        } catch {
          /* keep current messages */
        }
      }),
    [],
  );

  useEffect(() => {
    if (!projectId || !activeProject) return;
    setThreads((prev) =>
      ensureThreadMessages(prev, threadKey, () =>
        buildProjectRoomMessages(activeProject, threadAgent),
      ),
    );
  }, [activeProject, projectId, threadAgent, threadKey]);

  // Open / refresh the live agent thread when Sander (etc.) is selected.
  // Depend on liveAgentId only — liveAgentChat identity used to thrash this
  // effect and let a stale openThread overwrite a newer SSE refresh.
  // The reducer ignores opens for an agent that is no longer selected, so no
  // generation counter is needed here.
  useEffect(() => {
    dispatchLive({
      type: "reset",
      agentId: liveAgentId,
      agentName: threadAgent.name,
    });
  }, [liveAgentId, threadAgent.name]);

  useEffect(() => {
    const chat = liveAgentChatRef.current;
    if (!liveAgentId || !chat) return;
    const agentName = threadAgentNameRef.current;
    void (async () => {
      try {
        const thread = await chat.openThread(liveAgentId);
        dispatchLive({
          type: "opened",
          agentId: liveAgentId,
          thread,
          nowMs: Date.now(),
        });
      } catch {
        dispatchLive({
          type: "openFailed",
          agentId: liveAgentId,
          error: `Could not open chat with ${agentName}.`,
        });
      }
    })();
  }, [liveAgentId]);

  // Expire provisional / working timers without dropping real messages.
  useEffect(() => {
    const remaining = chatThinkingRemainingMs(live.thinking, Date.now());
    if (remaining == null) return;
    const handle = window.setTimeout(() => {
      dispatchLive({ type: "thinkingExpired", nowMs: Date.now() });
    }, remaining + 25);
    return () => window.clearTimeout(handle);
  }, [live.thinking]);

  // Agent reply + status from cloud SSE (via desktop shell window events).
  useEffect(() => {
    const onMessage = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          threadId?: string;
          message?: {
            id?: string;
            body?: string;
            fullBody?: string | null;
            createdAt?: string;
            choices?: ChatThreadMessageChoices;
            choicesAnswer?: ChatThreadMessageChoicesAnswer | null;
          };
        }>
      ).detail;
      const threadId = detail?.threadId?.trim() || "";
      if (!threadId || threadId !== liveRef.current.threadId) return;
      const messageId = detail?.message?.id?.trim() || "";
      const createdAt = detail?.message?.createdAt?.trim() || "";
      const fullBody = detail?.message?.fullBody || null;
      if (messageId && createdAt) {
        dispatchLive({
          type: "pushMessage",
          threadId,
          message: {
            id: messageId,
            body: fullBody ?? detail?.message?.body ?? "",
            createdAt,
            ...(detail.message?.choices
              ? {
                  choices: detail.message.choices,
                  choicesAnswer: detail.message.choicesAnswer ?? null,
                }
              : {}),
          },
        });
      }
      // Older cloud-cores only send a truncated preview — fetch the full body.
      if (!fullBody || !messageId || !createdAt) void refreshOpenLiveThread();
    };
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<{
        threadId?: string;
        state?: "working" | "idle";
        label?: string | null;
        at?: string | null;
      }>).detail;
      const state = detail?.state;
      if (state !== "working" && state !== "idle") return;
      const threadId = detail?.threadId?.trim() || "";
      if (!threadId || threadId !== liveRef.current.threadId) return;
      dispatchLive({
        type: "pushStatus",
        threadId,
        state,
        label: detail?.label ?? null,
        at: detail?.at ?? null,
        nowMs: Date.now(),
      });
    };
    window.addEventListener(AGENT_SHELL_CHAT_MESSAGE_WINDOW_EVENT, onMessage);
    window.addEventListener(AGENT_SHELL_CHAT_STATUS_WINDOW_EVENT, onStatus);
    return () => {
      window.removeEventListener(
        AGENT_SHELL_CHAT_MESSAGE_WINDOW_EVENT,
        onMessage,
      );
      window.removeEventListener(AGENT_SHELL_CHAT_STATUS_WINDOW_EVENT, onStatus);
    };
  }, [refreshOpenLiveThread]);

  // Poll while thinking (provisional or working) so replies land without SSE.
  const thinkingActive = live.thinking.mode !== "off";
  useEffect(() => {
    if (!thinkingActive || !liveThreadId) return;
    const handle = window.setInterval(() => {
      void refreshOpenLiveThread();
    }, LIVE_THREAD_THINKING_POLL_MS);
    return () => window.clearInterval(handle);
  }, [liveThreadId, refreshOpenLiveThread, thinkingActive]);

  // SSE can drop while the window is hidden / laptop asleep — catch up on focus.
  useEffect(() => {
    if (!liveThreadId) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshOpenLiveThread();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [liveThreadId, refreshOpenLiveThread]);

  const onSelectProject = useCallback(
    (nextProjectId: string) => {
      const project = resolvedProjects.find(
        (entry) => entry.id === nextProjectId,
      );
      if (!project) return;
      setRecentProjectIds(rememberRecentChatProjectId(project.id));
      setProjectId(project.id);
      setActivePeerId(projectPeer.id);
    },
    [projectPeer.id, resolvedProjects],
  );

  const onPeerChange = useCallback(
    (peerId: string) => {
      const asProject = resolvedProjects.find((entry) => entry.id === peerId);
      if (asProject) {
        onSelectProject(asProject.id);
        return;
      }
      setProjectId(null);
      setActivePeerId(peerId);
    },
    [onSelectProject, resolvedProjects],
  );

  const onSend = useCallback(
    async (text: string, attachments: readonly ChatUiFilePart[] = []) => {
      const key = chatDemoThreadKey(threadAgent.id, projectId);
      const now = new Date().toISOString();
      const pendingId = `local-${crypto.randomUUID()}`;
      const parts: ChatUiMessage["parts"] = [
        ...(text.trim() ? [{ type: "text" as const, text }] : []),
        ...attachments,
      ];
      if (parts.length === 0) return;

      if (liveAgentId && liveAgentChat && liveThreadId && text.trim()) {
        const optimistic: ChatUiMessage = {
          id: pendingId,
          role: "user",
          author: { name: "You" },
          status: "pending",
          createdAt: now,
          parts: [{ type: "text", text }],
        };
        dispatchLive({ type: "sendStarted", message: optimistic });
        try {
          // The POST returns the stored message, so no follow-up GET is needed.
          const result = await liveAgentChat.sendMessage(
            liveThreadId,
            text.trim(),
          );
          dispatchLive({
            type: "sendSucceeded",
            pendingId,
            message: result.message,
            thinking: result.thinking,
            webhookError: result.webhookError ?? null,
            nowMs: Date.now(),
          });
        } catch (error) {
          dispatchLive({
            type: "sendFailed",
            pendingId,
            error:
              error instanceof Error
                ? error.message
                : `Could not send to ${threadAgent.name}.`,
          });
        }
        return;
      }

      setThreads((prev) => ({
        ...prev,
        [key]: [
          ...(prev[key] ?? []),
          {
            id: pendingId,
            role: "user",
            author: { name: "You" },
            status: "pending",
            createdAt: now,
            parts,
          },
        ],
      }));
      await new Promise((resolve) => setTimeout(resolve, 350));
      setThreads((prev) => ({
        ...prev,
        [key]: (prev[key] ?? []).map((message) =>
          message.id === pendingId
            ? { ...message, status: "done" as const }
            : message,
        ),
      }));
    },
    [
      liveAgentChat,
      liveAgentId,
      liveThreadId,
      projectId,
      threadAgent.id,
      threadAgent.name,
    ],
  );

  const onDeleteMessages = useCallback(
    async (messageIds: readonly string[]) => {
      if (messageIds.length === 0) return;

      if (liveAgentId && liveAgentChat?.deleteMessages && liveThreadId) {
        const ids = new Set(messageIds);
        const restore = liveRef.current.messages.filter((message) =>
          ids.has(message.id),
        );
        dispatchLive({ type: "deleteStarted", ids: messageIds });
        try {
          await liveAgentChat.deleteMessages(liveThreadId, messageIds);
        } catch (error) {
          console.warn("[chat] delete messages failed; restoring", error);
          dispatchLive({ type: "deleteFailed", restore });
          throw error;
        }
        return;
      }

      const key = chatDemoThreadKey(threadAgent.id, projectId);
      const ids = new Set(messageIds);
      setThreads((prev) => ({
        ...prev,
        [key]: (prev[key] ?? []).filter((message) => !ids.has(message.id)),
      }));
    },
    [liveAgentChat, liveAgentId, liveThreadId, projectId, threadAgent.id],
  );

  const onAnswerChoices = useCallback(
    async (messageId: string, values: readonly string[]) => {
      if (!liveAgentId || !liveAgentChat?.answerChoices || !liveThreadId) {
        return;
      }
      const pendingId = `pending-choice-${Date.now()}`;
      const now = new Date().toISOString();
      const body = [...values].join(", ");
      dispatchLive({
        type: "sendStarted",
        message: {
          id: pendingId,
          role: "user",
          author: { name: "You" },
          status: "pending",
          createdAt: now,
          parts: [{ type: "text", text: body }],
        },
      });
      try {
        const result = await liveAgentChat.answerChoices(
          liveThreadId,
          messageId,
          values,
        );
        dispatchLive({
          type: "pushMessage",
          threadId: liveThreadId,
          message: {
            id: result.message.id,
            body: result.message.body,
            createdAt: result.message.createdAt,
            ...(result.message.choices
              ? {
                  choices: result.message.choices,
                  choicesAnswer: result.message.choicesAnswer ?? null,
                }
              : {}),
          },
        });
        dispatchLive({
          type: "sendSucceeded",
          pendingId,
          message: result.reply.message,
          thinking: result.reply.thinking,
          webhookError: result.reply.webhookError,
          nowMs: Date.now(),
        });
      } catch (error) {
        dispatchLive({
          type: "sendFailed",
          pendingId,
          error:
            error instanceof Error
              ? error.message
              : "Could not submit choice.",
        });
        throw error;
      }
    },
    [liveAgentChat, liveAgentId, liveThreadId],
  );

  const liveView = useMemo(() => liveAgentThreadView(live), [live]);
  // While a live agent thread loads, show nothing rather than demo messages.
  const messages: readonly ChatUiMessage[] = liveAgentId
    ? live.agentId === liveAgentId
      ? liveView
      : []
    : (threads[threadKey] ?? []);

  if (needsWebhookSetup) {
    return (
      <div className="chat-ui-dev-page" data-content-detail>
        <div className="chat-ui-dev-page__thread chat-ui-webhook-setup">
          <div className="chat-ui-webhook-setup__card" role="status">
            <h2 className="chat-ui-webhook-setup__title">
              Webhook connection needed
            </h2>
            <p className="chat-ui-webhook-setup__body">
              {webhookSetupMessage?.trim() ||
                "No agents have a webhook URL yet, so there is nothing to chat with. Add a webhook under Settings → API (Agent key → expand), then come back here. Chat reads agents from cloud (agent.backsteros.com), not only the local core."}
            </p>
            {onNavigate ? (
              <button
                type="button"
                className="button button--primary"
                onClick={() => onNavigate(webhookSetupHref)}
              >
                Open agent settings
              </button>
            ) : (
              <a className="button button--primary" href={webhookSetupHref}>
                Open agent settings
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-ui-dev-page" data-content-detail>
      <div className="chat-ui-dev-page__thread">
        <ChatThread
          messages={messages}
          onSend={onSend}
          onNavigate={onNavigate}
          peers={visiblePeers}
          activePeerId={headerActivePeerId}
          onPeerChange={onPeerChange}
          projects={resolvedProjects}
          recentProjectIds={recentProjectIds}
          onSelectProject={onSelectProject}
          onDeleteMessages={onDeleteMessages}
          onAnswerChoices={
            liveAgentId && liveAgentChat?.answerChoices
              ? onAnswerChoices
              : null
          }
          emptyState={null}
          placeholder="Message…"
        />
      </div>
    </div>
  );
}
