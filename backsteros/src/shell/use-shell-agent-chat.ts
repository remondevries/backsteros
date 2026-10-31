import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Agent,
  AnswerChatThreadMessageChoicesResult,
  AnswerChatThreadMessageResult,
  ChatThreadMessage,
  ChatThreadWithMessages,
  CreateChatThreadMessageResult,
  DeleteChatThreadMessagesResult,
} from "@backsteros/contracts";

import { invalidateAgentDmThreads } from "../lib/agent-dm-seen";
import {
  cloudCoreRequestBlob,
  cloudCoreRequestJson,
  isCloudCoreApiError,
} from "../lib/cloud-core-api";
import { sortAgentsForDisplay } from "../lib/shell-agent-order";
import { SHELL_AGENT_ROSTER_CHANGED_EVENT } from "../lib/shell-agent-roster";
import { isAgentWebhookVerified } from "../lib/shell-agent-webhook-verified";

/** True when a non-empty webhook URL is stored (settings may still need a test). */
export function agentHasWebhookUrl(agent: Agent): boolean {
  return Boolean(agent.webhookUrl?.trim());
}

/**
 * Shell chat roster gate: URL + secret + successful Settings test on this device.
 */
export function agentReadyForChatRoster(agent: Agent): boolean {
  return (
    agentHasWebhookUrl(agent) &&
    agent.webhookSecretConfigured &&
    isAgentWebhookVerified(agent.id)
  );
}

export type ShellAgentChatApi = {
  agents: readonly Agent[];
  /** Enabled agents with a verified webhook — the only ones shown in chat. */
  webhookReadyAgents: readonly Agent[];
  agentsByContactId: ReadonlyMap<string, Agent>;
  /** Set when the cloud agents door could not be loaded (e.g. missing owner key). */
  agentsLoadError: string | null;
  openThread: (agentId: string) => Promise<ChatThreadWithMessages>;
  sendMessage: (
    threadId: string,
    body: string,
    options?: {
      attachmentIds?: readonly string[];
      skipLinkPreviews?: boolean;
    },
  ) => Promise<CreateChatThreadMessageResult>;
  uploadAttachment: (
    threadId: string,
    file: File,
  ) => Promise<{ id: string }>;
  resolveAttachmentUrl: (url: string) => Promise<string>;
  getThread: (threadId: string) => Promise<ChatThreadWithMessages>;
  listMessages: (threadId: string) => Promise<ChatThreadMessage[]>;
  deleteMessages: (
    threadId: string,
    messageIds: readonly string[],
  ) => Promise<DeleteChatThreadMessagesResult>;
  answerChoices: (
    threadId: string,
    messageId: string,
    values: readonly string[],
  ) => Promise<AnswerChatThreadMessageChoicesResult>;
  answerApproval: (
    threadId: string,
    messageId: string,
    decision: "approved" | "rejected",
    note?: string,
  ) => Promise<AnswerChatThreadMessageResult>;
};

/**
 * Shell chat column → cloud-core via the agents door (`agent.backsteros.com`).
 * Uses the same owner-key cloud client as timer sync; the rest of the product
 * shell stays on local-core. Chat tables are not replicated.
 */
export function useShellAgentChat(): ShellAgentChatApi {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoadError, setAgentsLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const body = await cloudCoreRequestJson<{ agents: Agent[] }>(
          "/api/v1/agents",
        );
        if (!cancelled) {
          setAgents(
            sortAgentsForDisplay(
              body.agents.filter((agent) => agent.enabled),
            ),
          );
          setAgentsLoadError(null);
        }
      } catch (error) {
        if (!cancelled) {
          if (isCloudCoreApiError(error) && error.status === 401) {
            console.warn("[shell-chat] owner API key required for cloud chat");
            setAgentsLoadError(
              "Cloud chat needs an owner API key (Tauri reads ~/.config/backsteros/cli.env; Vite serve loads it automatically). Restart the dev server after updating the key.",
            );
          } else {
            setAgentsLoadError(
              "Could not load agents from cloud (agent.backsteros.com). Check the network and try again.",
            );
          }
          setAgents([]);
        }
      }
    };
    void load();
    const onRosterChanged = () => {
      void load();
    };
    window.addEventListener(SHELL_AGENT_ROSTER_CHANGED_EVENT, onRosterChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(
        SHELL_AGENT_ROSTER_CHANGED_EVENT,
        onRosterChanged,
      );
    };
  }, []);

  const webhookReadyAgents = useMemo(
    () => sortAgentsForDisplay(agents.filter(agentReadyForChatRoster)),
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

  const sendMessage = useCallback(
    async (
      threadId: string,
      body: string,
      options?: {
        attachmentIds?: readonly string[];
        skipLinkPreviews?: boolean;
      },
    ) => {
      return cloudCoreRequestJson<CreateChatThreadMessageResult>(
        `/api/v1/chat/threads/${encodeURIComponent(threadId)}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            body,
            ...(options?.attachmentIds && options.attachmentIds.length > 0
              ? { attachmentIds: [...options.attachmentIds] }
              : {}),
            ...(options?.skipLinkPreviews
              ? { skipLinkPreviews: true }
              : {}),
          }),
        },
      );
    },
    [],
  );

  const uploadAttachment = useCallback(
    async (threadId: string, file: File) => {
      return cloudCoreRequestJson<{ id: string }>(
        `/api/v1/chat/threads/${encodeURIComponent(threadId)}/attachments`,
        {
          method: "POST",
          body: file,
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "X-Filename": file.name || "attachment.bin",
          },
        },
      );
    },
    [],
  );

  const resolveAttachmentUrl = useCallback(async (url: string) => {
    if (url.startsWith("blob:") || url.startsWith("data:")) return url;
    const path = url.startsWith("http")
      ? (() => {
          const parsed = new URL(url);
          return `${parsed.pathname}${parsed.search}`;
        })()
      : url;
    const blob = await cloudCoreRequestBlob(path);
    return URL.createObjectURL(blob);
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

  const deleteMessages = useCallback(
    async (threadId: string, messageIds: readonly string[]) => {
      const ids = [...messageIds];
      if (ids.length === 0) return { deletedIds: [] };
      const result =
        ids.length === 1
          ? await cloudCoreRequestJson<null>(
              `/api/v1/chat/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(ids[0]!)}`,
              { method: "DELETE" },
            ).then(() => ({ deletedIds: ids }))
          : await cloudCoreRequestJson<DeleteChatThreadMessagesResult>(
              `/api/v1/chat/threads/${encodeURIComponent(threadId)}/messages/delete`,
              {
                method: "POST",
                body: JSON.stringify({ messageIds: ids }),
              },
            );
      invalidateAgentDmThreads();
      return result;
    },
    [],
  );

  const answerChoices = useCallback(
    async (
      threadId: string,
      messageId: string,
      values: readonly string[],
    ) => {
      return cloudCoreRequestJson<AnswerChatThreadMessageChoicesResult>(
        `/api/v1/chat/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/answer`,
        {
          method: "POST",
          body: JSON.stringify({ values: [...values] }),
        },
      );
    },
    [],
  );

  const answerApproval = useCallback(
    async (
      threadId: string,
      messageId: string,
      decision: "approved" | "rejected",
      note?: string,
    ) => {
      return cloudCoreRequestJson<AnswerChatThreadMessageResult>(
        `/api/v1/chat/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/answer`,
        {
          method: "POST",
          body: JSON.stringify({
            decision,
            ...(note?.trim() ? { note: note.trim() } : {}),
          }),
        },
      );
    },
    [],
  );

  return useMemo(
    (): ShellAgentChatApi => ({
      agents,
      webhookReadyAgents,
      agentsByContactId,
      agentsLoadError,
      openThread,
      sendMessage,
      uploadAttachment,
      resolveAttachmentUrl,
      getThread,
      listMessages,
      deleteMessages,
      answerChoices,
      answerApproval,
    }),
    [
      agents,
      agentsByContactId,
      agentsLoadError,
      answerApproval,
      answerChoices,
      deleteMessages,
      getThread,
      listMessages,
      openThread,
      resolveAttachmentUrl,
      sendMessage,
      uploadAttachment,
      webhookReadyAgents,
    ],
  );
}
