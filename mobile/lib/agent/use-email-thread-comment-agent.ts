import type { AgentMailMessageDetail, AgentPtyConnection } from "@backsteros/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  createAgentChatMessage,
  loadAgentChatTranscript,
  publishAgentChatTranscriptMessage,
  saveAgentChatTranscript,
  syncAgentChatTranscript,
  type AgentChatMessage,
} from "./agent-chat-transcript";
import {
  fetchAgentPtyConnection,
  submitPtyAgentPrompt,
} from "./agent-pty";
import {
  readEmailAgentChatId,
  writeEmailAgentChatId,
} from "./email-agent-chat-id";
import {
  buildEmailAgentAcpPrompt,
  parseEmailAgentCommentResponse,
  type EmailAgentCreateTaskSpec,
} from "./email-agent-prompt";
import { startEmailAgentSession } from "./start-email-agent-session";
import { useMobileApiClient } from "../use-mobile-api-client";

function countAssistantMessages(rows: readonly AgentChatMessage[]): number {
  return rows.filter((row) => row.role === "assistant").length;
}

function latestAssistantText(rows: readonly AgentChatMessage[]): string {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row?.role === "assistant" && row.text.trim()) {
      return row.text.trim();
    }
  }
  return "";
}

export type EmailThreadCommentAgentResult = {
  commentBody: string;
  replyDraftBody: string | null;
  createTasks: EmailAgentCreateTaskSpec[];
};

/**
 * Quiet email-thread agent turns for sticky timeline comments.
 * Polls transcript for completion (compose EmailAgentPrompt pattern).
 */
export function useEmailThreadCommentAgent({
  taskId,
  message,
  onResult,
  enabled = true,
}: {
  taskId: string | null;
  message: AgentMailMessageDetail | null;
  onResult: (result: EmailThreadCommentAgentResult) => void | Promise<void>;
  enabled?: boolean;
}) {
  const client = useMobileApiClient();
  const resolvedTaskId = enabled ? taskId?.trim() || "" : "";

  const [agentChatId, setAgentChatId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectionRef = useRef<AgentPtyConnection | null>(null);
  const chatIdRef = useRef<string | null>(null);
  const assistantTextRef = useRef("");
  const assistantBaselineRef = useRef(0);
  const turnActiveRef = useRef(false);
  const finalizeInFlightRef = useRef(false);
  const creatingRef = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  chatIdRef.current = agentChatId?.trim() || null;

  useEffect(() => {
    if (!resolvedTaskId) {
      setAgentChatId(null);
      return;
    }
    let cancelled = false;
    void readEmailAgentChatId(resolvedTaskId).then((id) => {
      if (!cancelled) setAgentChatId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedTaskId]);

  const finalizeTurn = useCallback(async () => {
    if (!turnActiveRef.current || finalizeInFlightRef.current) return;
    finalizeInFlightRef.current = true;
    try {
      let text = assistantTextRef.current.trim();
      const chatId = chatIdRef.current;
      const connection = connectionRef.current;
      if (!text && chatId) {
        try {
          if (connection) {
            const synced = await syncAgentChatTranscript(connection, chatId);
            if (countAssistantMessages(synced) > assistantBaselineRef.current) {
              text = latestAssistantText(synced);
            }
          }
          if (!text) {
            const local = await loadAgentChatTranscript(chatId);
            if (countAssistantMessages(local) > assistantBaselineRef.current) {
              text = latestAssistantText(local);
            }
          }
        } catch {
          /* ignore */
        }
      }
      if (!text) return;
      turnActiveRef.current = false;
      const parsed = parseEmailAgentCommentResponse(text);
      if (parsed.replyDraftBody?.trim() || parsed.createTasks.length > 0) {
        setError(null);
      }
      await onResultRef.current(parsed);
    } finally {
      setWorking(false);
      finalizeInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!working) return;
    let cancelled = false;
    let attempts = 0;

    async function poll() {
      if (cancelled || !turnActiveRef.current) return;
      attempts += 1;
      try {
        const chatId = chatIdRef.current;
        const connection = connectionRef.current;
        if (chatId && connection) {
          const synced = await syncAgentChatTranscript(connection, chatId);
          if (countAssistantMessages(synced) > assistantBaselineRef.current) {
            const text = latestAssistantText(synced);
            if (text) {
              assistantTextRef.current = text;
              void finalizeTurn();
              return;
            }
          }
        }
      } catch {
        /* ignore */
      }
      if (attempts >= 90) {
        turnActiveRef.current = false;
        setWorking(false);
        setError("Agent timed out. Try again.");
      }
    }

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [finalizeTurn, working]);

  const sendComment = useCallback(
    async (
      userText: string,
      options?: { message?: AgentMailMessageDetail | null },
    ): Promise<boolean> => {
      const trimmed = userText.trim();
      const contextMessage = options?.message ?? message;
      if (
        !trimmed ||
        !resolvedTaskId ||
        !contextMessage ||
        working ||
        creatingAgent ||
        creatingRef.current
      ) {
        return false;
      }

      setError(null);
      turnActiveRef.current = true;
      assistantTextRef.current = "";
      setWorking(true);

      const existingChatId = chatIdRef.current;
      assistantBaselineRef.current = existingChatId
        ? countAssistantMessages(await loadAgentChatTranscript(existingChatId))
        : 0;

      try {
        if (!existingChatId) {
          creatingRef.current = true;
          setCreatingAgent(true);
          const discovered = await fetchAgentPtyConnection(client);
          if (!discovered.ok) {
            throw new Error(discovered.error);
          }
          connectionRef.current = discovered.connection;
          const acpPrompt = buildEmailAgentAcpPrompt(trimmed, contextMessage, {
            depth: "full",
          });
          const result = await startEmailAgentSession(discovered.connection, {
            taskId: resolvedTaskId,
            prompt: acpPrompt,
          });
          if (!result.ok) {
            throw new Error(result.error);
          }
          const bootstrap = createAgentChatMessage("user", trimmed);
          await saveAgentChatTranscript(result.chatId, [bootstrap]);
          publishAgentChatTranscriptMessage(
            discovered.connection,
            result.chatId,
            bootstrap,
          );
          await writeEmailAgentChatId(resolvedTaskId, result.chatId);
          setAgentChatId(result.chatId);
          return true;
        }

        let connection = connectionRef.current;
        if (!connection) {
          const discovered = await fetchAgentPtyConnection(client);
          if (!discovered.ok) {
            throw new Error(discovered.error);
          }
          connection = discovered.connection;
          connectionRef.current = connection;
        }

        const acpPrompt = buildEmailAgentAcpPrompt(trimmed, contextMessage, {
          depth: "lean",
        });
        const result = await submitPtyAgentPrompt(connection, {
          taskId: resolvedTaskId,
          prompt: acpPrompt,
          chatId: existingChatId,
          cwd: "~",
        });
        if (!result.ok) {
          throw new Error(result.error);
        }
        return true;
      } catch (caught) {
        turnActiveRef.current = false;
        setWorking(false);
        setError(
          caught instanceof Error
            ? caught.message
            : "Agent could not respond. Try again.",
        );
        return false;
      } finally {
        creatingRef.current = false;
        setCreatingAgent(false);
      }
    },
    [client, creatingAgent, message, resolvedTaskId, working],
  );

  return {
    sendComment,
    working: working || creatingAgent,
    error,
  };
}
