"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChatThreadWithMessages,
  ChatUiFilePart,
  ChatUiMessage,
  CreateChatThreadMessageResult,
} from "@backsteros/contracts";

import {
  chatThreadMessageToUi,
  thinkingStatusMessage,
  webhookErrorStatusMessage,
} from "../../chat/agent-chat-message-adapter.js";
import { buildChatUiDemoMessages } from "../../chat/chat-ui-demo-fixture.js";
import {
  pruneRecentChatProjectIds,
  readRecentChatProjectIds,
  rememberRecentChatProjectId,
  resolveRecentChatProjectsForStrip,
  type ChatProjectOption,
} from "../../chat/chat-project-option.js";
import {
  CHAT_THINKING_OFF,
  chatThinkingAfterSend,
  chatThinkingAfterStatus,
  chatThinkingFromPendingReplyAt,
  chatThinkingIsActive,
  chatThinkingRemainingMs,
  type ChatThinkingState,
} from "../../chat/chat-thinking-state.js";
import type { ChatCardNavigate } from "./chat-card-navigate.js";
import { ChatThread } from "./chat-thread.js";
import type { ChatThreadPeer } from "./chat-thread-header.js";

/** Dispatched by desktop shell when cloud SSE pushes agent.chat.status / reply. */
export const AGENT_SHELL_CHAT_STATUS_WINDOW_EVENT =
  "backsteros:agent-shell-chat-status";

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
};

function messagesFromThread(
  thread: ChatThreadWithMessages,
  agentName: string,
  thinkingActive: boolean,
): ChatUiMessage[] {
  const mapped = thread.messages.map(chatThreadMessageToUi);
  if (thinkingActive) {
    return [...mapped, thinkingStatusMessage(agentName)];
  }
  return mapped;
}

function stripThinkingMessages(
  messages: readonly ChatUiMessage[],
): ChatUiMessage[] {
  return messages.filter((message) => !message.id.startsWith("thinking-"));
}

function withThinkingMessage(
  messages: readonly ChatUiMessage[],
  agentName: string,
  thinkingActive: boolean,
): ChatUiMessage[] {
  const base = stripThinkingMessages(messages);
  if (!thinkingActive) return base;
  return [...base, thinkingStatusMessage(agentName)];
}

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
  const [liveThreadId, setLiveThreadId] = useState<string | null>(null);
  const [liveMessages, setLiveMessages] = useState<ChatUiMessage[] | null>(
    null,
  );
  const [thinkingState, setThinkingState] =
    useState<ChatThinkingState>(CHAT_THINKING_OFF);
  const pollGen = useRef(0);
  const liveThreadIdRef = useRef<string | null>(null);
  liveThreadIdRef.current = liveThreadId;

  useEffect(() => {
    if (!projectId || !activeProject) return;
    setThreads((prev) =>
      ensureThreadMessages(prev, threadKey, () =>
        buildProjectRoomMessages(activeProject, threadAgent),
      ),
    );
  }, [activeProject, projectId, threadAgent, threadKey]);

  // Open / refresh the live agent thread when Sander (etc.) is selected.
  useEffect(() => {
    if (!liveAgentId || !liveAgentChat) {
      setLiveThreadId(null);
      setLiveMessages(null);
      setThinkingState(CHAT_THINKING_OFF);
      return;
    }
    let cancelled = false;
    const gen = ++pollGen.current;
    void (async () => {
      try {
        const thread = await liveAgentChat.openThread(liveAgentId);
        if (cancelled || pollGen.current !== gen) return;
        const now = Date.now();
        const nextThinking = chatThinkingFromPendingReplyAt(
          thread.pendingReplyAt,
          now,
        );
        setLiveThreadId(thread.id);
        setThinkingState(nextThinking);
        setLiveMessages(
          messagesFromThread(
            thread,
            thread.agentName ?? threadAgent.name,
            chatThinkingIsActive(nextThinking, now),
          ),
        );
      } catch {
        if (cancelled || pollGen.current !== gen) return;
        setLiveThreadId(null);
        setLiveMessages([
          webhookErrorStatusMessage(
            `Could not open chat with ${threadAgent.name}.`,
          ),
        ]);
        setThinkingState(CHAT_THINKING_OFF);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [liveAgentChat, liveAgentId, threadAgent.name]);

  // Expire provisional / working timers without polling the thread.
  useEffect(() => {
    const remaining = chatThinkingRemainingMs(thinkingState, Date.now());
    if (remaining == null) return;
    const handle = window.setTimeout(() => {
      const now = Date.now();
      if (!chatThinkingIsActive(thinkingState, now)) {
        setThinkingState(CHAT_THINKING_OFF);
        setLiveMessages((prev) =>
          prev ? withThinkingMessage(prev, threadAgent.name, false) : prev,
        );
      }
    }, remaining + 25);
    return () => window.clearTimeout(handle);
  }, [thinkingState, threadAgent.name]);

  // Agent status / reply presence from cloud SSE (via desktop shell).
  useEffect(() => {
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<{
        threadId?: string;
        state?: "working" | "idle";
      }>).detail;
      const threadId = detail?.threadId?.trim() || "";
      if (!threadId || threadId !== liveThreadIdRef.current) return;
      if (detail.state !== "working" && detail.state !== "idle") return;
      const now = Date.now();
      const next = chatThinkingAfterStatus(detail.state, now);
      setThinkingState(next);
      setLiveMessages((prev) =>
        prev
          ? withThinkingMessage(
              prev,
              threadAgent.name,
              chatThinkingIsActive(next, now),
            )
          : prev,
      );
    };
    window.addEventListener(AGENT_SHELL_CHAT_STATUS_WINDOW_EVENT, onStatus);
    return () =>
      window.removeEventListener(AGENT_SHELL_CHAT_STATUS_WINDOW_EVENT, onStatus);
  }, [threadAgent.name]);

  // Light poll only while agent has reported working (catch reply without SSE).
  useEffect(() => {
    if (
      thinkingState.mode !== "working" ||
      !liveThreadId ||
      !liveAgentChat
    ) {
      return;
    }
    const agentName = threadAgent.name;
    const handle = window.setInterval(() => {
      void (async () => {
        try {
          const thread = await liveAgentChat.getThread(liveThreadId);
          const now = Date.now();
          const next = chatThinkingFromPendingReplyAt(
            thread.pendingReplyAt,
            now,
          );
          setThinkingState(next);
          setLiveMessages(
            messagesFromThread(
              thread,
              thread.agentName ?? agentName,
              chatThinkingIsActive(next, now),
            ),
          );
        } catch {
          /* keep waiting */
        }
      })();
    }, 2500);
    return () => window.clearInterval(handle);
  }, [liveAgentChat, liveThreadId, thinkingState.mode, threadAgent.name]);

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
        setLiveMessages((prev) => [...(prev ?? []), optimistic]);
        try {
          const result = await liveAgentChat.sendMessage(
            liveThreadId,
            text.trim(),
          );
          const thread = await liveAgentChat.getThread(liveThreadId);
          const clock = Date.now();
          const nextThinking =
            result.webhookError || !result.thinking
              ? CHAT_THINKING_OFF
              : chatThinkingAfterSend(clock);
          setThinkingState(nextThinking);
          let mapped = messagesFromThread(
            thread,
            thread.agentName ?? threadAgent.name,
            chatThinkingIsActive(nextThinking, clock),
          );
          if (result.webhookError) {
            mapped = [
              ...stripThinkingMessages(mapped),
              webhookErrorStatusMessage(result.webhookError),
            ];
          }
          setLiveMessages(mapped);
        } catch (error) {
          setLiveMessages((prev) => [
            ...(prev ?? []).filter((message) => message.id !== pendingId),
            webhookErrorStatusMessage(
              error instanceof Error
                ? error.message
                : `Could not send to ${threadAgent.name}.`,
            ),
          ]);
          setThinkingState(CHAT_THINKING_OFF);
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
        const previous = liveMessages;
        setLiveMessages((prev) =>
          (prev ?? []).filter((message) => !ids.has(message.id)),
        );
        try {
          await liveAgentChat.deleteMessages(liveThreadId, messageIds);
          const thread = await liveAgentChat.getThread(liveThreadId);
          // Keep locally removed ids out even if the server lag/filters miss one.
          const clock = Date.now();
          const nextThinking = chatThinkingFromPendingReplyAt(
            thread.pendingReplyAt,
            clock,
          );
          setThinkingState(nextThinking);
          setLiveMessages(
            messagesFromThread(
              thread,
              thread.agentName ?? threadAgent.name,
              chatThinkingIsActive(nextThinking, clock),
            ).filter((message) => !ids.has(message.id)),
          );
        } catch (error) {
          console.warn("[chat] delete messages failed; restoring", error);
          setLiveMessages(previous);
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
    [
      liveAgentChat,
      liveAgentId,
      liveMessages,
      liveThreadId,
      projectId,
      threadAgent.id,
      threadAgent.name,
    ],
  );

  const messages =
    liveAgentId && liveMessages != null
      ? liveMessages
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
          emptyState={null}
          placeholder="Message…"
        />
      </div>
    </div>
  );
}
