"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatUiFilePart, ChatUiMessage } from "@backsteros/contracts";

import { buildChatUiDemoMessages } from "../../chat/chat-ui-demo-fixture.js";
import {
  readRecentChatProjectIds,
  rememberRecentChatProjectId,
  type ChatProjectOption,
} from "../../chat/chat-project-option.js";
import type { ChatCardNavigate } from "./chat-card-navigate.js";
import { ChatThread } from "./chat-thread.js";
import type { ChatThreadPeer } from "./chat-thread-header.js";

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
          text: `You're in **${project.name}**. I'm ${peer.name}, the default agent for this project. Type \`/exit\` or click × on the project badge to leave.`,
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
};

/**
 * Dev-only preview for the ChatThread foundation. Used by `/dev/chat-ui` and
 * the shell right chat column. Existing Messages UI is unchanged.
 */
export function ChatUiDevPreview({
  peers = null,
  projects = null,
  onNavigate = null,
}: ChatUiDevPreviewProps) {
  const resolvedPeers = useMemo(() => {
    const base =
      peers && peers.length > 0 ? [...peers] : [FALLBACK_JUDITH];
    if (!findPeerByName(base, "Niels")) {
      base.push(FALLBACK_NIELS);
    }
    if (!findPeerByName(base, "Judith") && !peers?.length) {
      return [FALLBACK_JUDITH, FALLBACK_NIELS];
    }
    return base;
  }, [peers]);

  const resolvedProjects = useMemo(
    () => (projects && projects.length > 0 ? projects : []),
    [projects],
  );

  const defaultPeer =
    findPeerByName(resolvedPeers, "Judith") ??
    resolvedPeers[0] ??
    FALLBACK_JUDITH;
  const projectPeer =
    findPeerByName(resolvedPeers, "Niels") ??
    FALLBACK_NIELS;

  const [activePeerId, setActivePeerId] = useState(defaultPeer.id);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [recentProjectIds, setRecentProjectIds] = useState<string[]>(() =>
    readRecentChatProjectIds(),
  );
  const [threads, setThreads] = useState<Record<string, ChatUiMessage[]>>(
    () => {
      const key = chatDemoThreadKey(defaultPeer.id, null);
      return {
        [key]: buildChatUiDemoMessages(),
      };
    },
  );

  // When desktop finishes loading agent contacts, merge peers without wiping
  // threads the user already typed into.
  useEffect(() => {
    setActivePeerId((current) =>
      resolvedPeers.some((peer) => peer.id === current)
        ? current
        : (findPeerByName(resolvedPeers, "Judith")?.id ??
          resolvedPeers[0]?.id ??
          FALLBACK_JUDITH.id),
    );
    setThreads((prev) => {
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
  }, [resolvedPeers]);

  const activePeer =
    resolvedPeers.find((peer) => peer.id === activePeerId) ??
    defaultPeer;
  const activeProject =
    projectId == null
      ? null
      : (resolvedProjects.find((project) => project.id === projectId) ?? null);

  const threadKey = chatDemoThreadKey(activePeer.id, projectId);
  const messages = threads[threadKey] ?? [];

  useEffect(() => {
    if (!projectId || !activeProject) return;
    setThreads((prev) =>
      ensureThreadMessages(prev, threadKey, () =>
        buildProjectRoomMessages(activeProject, activePeer),
      ),
    );
  }, [activePeer, activeProject, projectId, threadKey]);

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

  const onLeaveProject = useCallback(() => {
    setProjectId(null);
    setActivePeerId(defaultPeer.id);
  }, [defaultPeer.id]);

  const onPeerChange = useCallback((peerId: string) => {
    setActivePeerId(peerId);
  }, []);

  const onSend = useCallback(
    async (text: string, attachments: readonly ChatUiFilePart[] = []) => {
      const key = chatDemoThreadKey(activePeer.id, projectId);
      const now = new Date().toISOString();
      const pendingId = `local-${crypto.randomUUID()}`;
      const parts: ChatUiMessage["parts"] = [
        ...(text.trim() ? [{ type: "text" as const, text }] : []),
        ...attachments,
      ];
      if (parts.length === 0) return;
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
    [activePeer.id, projectId],
  );

  const emptyState = useMemo(
    () => <p>Demo thread is empty — send a message to try the composer.</p>,
    [],
  );

  const placeholder = activeProject
    ? `Message ${activePeer.name} in ${activeProject.name}…`
    : `Message ${activePeer.name}…`;

  return (
    <div className="chat-ui-dev-page" data-content-detail>
      <div className="chat-ui-dev-page__thread">
        <ChatThread
          messages={messages}
          onSend={onSend}
          onNavigate={onNavigate}
          peers={resolvedPeers}
          activePeerId={activePeer.id}
          onPeerChange={onPeerChange}
          projects={resolvedProjects}
          recentProjectIds={recentProjectIds}
          activeProject={
            activeProject
              ? { id: activeProject.id, name: activeProject.name }
              : null
          }
          onSelectProject={onSelectProject}
          onLeaveProject={onLeaveProject}
          emptyState={emptyState}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}
