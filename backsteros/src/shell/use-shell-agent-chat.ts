import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Agent,
  ChatThreadMessage,
  ChatThreadWithMessages,
  CreateChatThreadMessageResult,
} from "@backsteros/contracts";

import {
  cloudCoreRequestJson,
  isCloudCoreApiError,
} from "../lib/cloud-core-api";

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
 * Shell chat column → cloud-core via the agents door (`agent.backsteros.com`).
 * Uses the same owner-key cloud client as timer sync; the rest of the product
 * shell stays on local-core. Chat tables are not replicated.
 */
export function useShellAgentChat(): ShellAgentChatApi {
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const body = await cloudCoreRequestJson<{ agents: Agent[] }>(
          "/api/v1/agents",
        );
        if (!cancelled) setAgents(body.agents.filter((agent) => agent.enabled));
      } catch (error) {
        if (!cancelled) {
          if (isCloudCoreApiError(error) && error.status === 401) {
            console.warn("[shell-chat] owner API key required for cloud chat");
          }
          setAgents([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const openThread = useCallback(async (agentId: string) => {
    return cloudCoreRequestJson<ChatThreadWithMessages>("/api/v1/chat/threads", {
      method: "POST",
      body: JSON.stringify({ agentId }),
    });
  }, []);

  const sendMessage = useCallback(async (threadId: string, body: string) => {
    return cloudCoreRequestJson<CreateChatThreadMessageResult>(
      `/api/v1/chat/threads/${encodeURIComponent(threadId)}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ body }),
      },
    );
  }, []);

  const getThread = useCallback(async (threadId: string) => {
    return cloudCoreRequestJson<ChatThreadWithMessages>(
      `/api/v1/chat/threads/${encodeURIComponent(threadId)}`,
    );
  }, []);

  const listMessages = useCallback(async (threadId: string) => {
    const body = await cloudCoreRequestJson<{ messages: ChatThreadMessage[] }>(
      `/api/v1/chat/threads/${encodeURIComponent(threadId)}/messages`,
    );
    return body.messages;
  }, []);

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
