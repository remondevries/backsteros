import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Agent,
  ChatThreadMessage,
  ChatThreadWithMessages,
  CreateChatThreadMessageResult,
} from "@backsteros/contracts";

import { useDesktopApi } from "../lib/api-context";

export function agentHasWebhookUrl(agent: Agent): boolean {
  return Boolean(agent.webhookUrl?.trim());
}

export type ShellAgentChatApi = {
  agents: readonly Agent[];
  /** Enabled agents with a webhook URL — the only ones shown in chat (OS-155). */
  webhookReadyAgents: readonly Agent[];
  agentsByContactId: ReadonlyMap<string, Agent>;
  openThread: (agentId: string) => Promise<ChatThreadWithMessages>;
  sendMessage: (
    threadId: string,
    body: string,
  ) => Promise<CreateChatThreadMessageResult>;
  getThread: (threadId: string) => Promise<ChatThreadWithMessages>;
  listMessages: (threadId: string) => Promise<ChatThreadMessage[]>;
};

/**
 * Loads chat agents and exposes REST helpers for the shell ChatThread column.
 * Messages arrive via polling (not PowerSync) — Tier C style.
 */
export function useShellAgentChat(): ShellAgentChatApi {
  const { client } = useDesktopApi();
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const body = await client.requestJson<{ agents: Agent[] }>(
          "/api/v1/agents",
        );
        if (!cancelled) setAgents(body.agents.filter((agent) => agent.enabled));
      } catch {
        if (!cancelled) setAgents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const webhookReadyAgents = useMemo(
    () => agents.filter(agentHasWebhookUrl),
    [agents],
  );

  const agentsByContactId = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const agent of webhookReadyAgents) {
      const contactId = agent.contactId?.trim();
      if (contactId && !map.has(contactId)) map.set(contactId, agent);
    }
    return map;
  }, [webhookReadyAgents]);

  const openThread = useCallback(
    async (agentId: string) => {
      return client.requestJson<ChatThreadWithMessages>("/api/v1/chat/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId }),
      });
    },
    [client],
  );

  const sendMessage = useCallback(
    async (threadId: string, body: string) => {
      return client.requestJson<CreateChatThreadMessageResult>(
        `/api/v1/chat/threads/${encodeURIComponent(threadId)}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
    },
    [client],
  );

  const getThread = useCallback(
    async (threadId: string) => {
      return client.requestJson<ChatThreadWithMessages>(
        `/api/v1/chat/threads/${encodeURIComponent(threadId)}`,
      );
    },
    [client],
  );

  const listMessages = useCallback(
    async (threadId: string) => {
      const body = await client.requestJson<{ messages: ChatThreadMessage[] }>(
        `/api/v1/chat/threads/${encodeURIComponent(threadId)}/messages`,
      );
      return body.messages;
    },
    [client],
  );

  return {
    agents,
    webhookReadyAgents,
    agentsByContactId,
    openThread,
    sendMessage,
    getThread,
    listMessages,
  };
}
