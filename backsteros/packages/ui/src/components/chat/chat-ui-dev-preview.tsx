"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatUiMessage } from "@backsteros/contracts";

import { buildChatUiDemoMessages } from "../../chat/chat-ui-demo-fixture.js";
import type { ChatCardNavigate } from "./chat-card-navigate.js";
import { ChatThread } from "./chat-thread.js";
import type { ChatThreadPeer } from "./chat-thread-header.js";

const FALLBACK_PEER: ChatThreadPeer = {
  id: "judith-fallback",
  kind: "contact",
  name: "Judith",
};

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

function initialThreads(
  peers: readonly ChatThreadPeer[],
): Record<string, ChatUiMessage[]> {
  const next: Record<string, ChatUiMessage[]> = {};
  for (const [index, peer] of peers.entries()) {
    next[peer.id] =
      index === 0 ? buildChatUiDemoMessages() : buildAgentStarterMessages(peer);
  }
  return next;
}

export type ChatUiDevPreviewProps = {
  /**
   * Peers for the header (Judith + agent contacts). Desktop resolves these
   * from workspace contacts and Settings → API → Agent keys.
   */
  peers?: readonly ChatThreadPeer[] | null;
  /** Same navigate callback as the shell chat column (navigateToHref). */
  onNavigate?: ChatCardNavigate | null;
};

/**
 * Dev-only preview for the ChatThread foundation. Used by `/dev/chat-ui`.
 * Existing Messages UI is unchanged — this is a parallel surface.
 */
export function ChatUiDevPreview({
  peers = null,
  onNavigate = null,
}: ChatUiDevPreviewProps) {
  const resolvedPeers = useMemo(
    () => (peers && peers.length > 0 ? peers : [FALLBACK_PEER]),
    [peers],
  );

  const [activePeerId, setActivePeerId] = useState(
    () => resolvedPeers[0]?.id ?? FALLBACK_PEER.id,
  );
  const [threads, setThreads] = useState<Record<string, ChatUiMessage[]>>(() =>
    initialThreads(resolvedPeers),
  );

  // When desktop finishes loading agent contacts, merge new peers without
  // wiping threads the user already typed into.
  useEffect(() => {
    setActivePeerId((current) =>
      resolvedPeers.some((peer) => peer.id === current)
        ? current
        : (resolvedPeers[0]?.id ?? FALLBACK_PEER.id),
    );
    setThreads((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const [index, peer] of resolvedPeers.entries()) {
        if (next[peer.id]) continue;
        next[peer.id] =
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
    resolvedPeers[0] ??
    FALLBACK_PEER;
  const messages = threads[activePeer.id] ?? [];

  const onSend = useCallback(
    async (text: string) => {
      const peerId = activePeer.id;
      const now = new Date().toISOString();
      const pendingId = `local-${crypto.randomUUID()}`;
      setThreads((prev) => ({
        ...prev,
        [peerId]: [
          ...(prev[peerId] ?? []),
          {
            id: pendingId,
            role: "user",
            author: { name: "You" },
            status: "pending",
            createdAt: now,
            parts: [{ type: "text", text }],
          },
        ],
      }));
      await new Promise((resolve) => setTimeout(resolve, 350));
      setThreads((prev) => ({
        ...prev,
        [peerId]: (prev[peerId] ?? []).map((message) =>
          message.id === pendingId
            ? { ...message, status: "done" as const }
            : message,
        ),
      }));
    },
    [activePeer.id],
  );

  const emptyState = useMemo(
    () => <p>Demo thread is empty — send a message to try the composer.</p>,
    [],
  );

  return (
    <div className="chat-ui-dev-page" data-content-detail>
      <div className="chat-ui-dev-page__thread">
        <ChatThread
          messages={messages}
          onSend={onSend}
          onNavigate={onNavigate}
          peers={resolvedPeers}
          activePeerId={activePeer.id}
          onPeerChange={setActivePeerId}
          emptyState={emptyState}
          placeholder={`Message ${activePeer.name}…`}
        />
      </div>
    </div>
  );
}
