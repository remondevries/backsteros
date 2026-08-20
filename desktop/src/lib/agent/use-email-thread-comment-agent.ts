import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentMailMessageDetail } from "@backsteros/contracts";

import { readAgentChatMode } from "./agent-chat-mode";
import { readAgentChatModelId } from "./agent-chat-model";
import {
  loadAgentChatTranscript,
  syncAgentChatTranscript,
  type AgentChatMessage,
} from "./agent-chat-transcript";
import {
  clearLiveAgentWorkingForTask,
  markLiveAgentWorkingForTask,
} from "./clear-live-agent-working";
import {
  buildEmailAgentAcpPrompt,
  parseEmailAgentCommentResponse,
} from "./email-agent-prompt";
import { useDesktopEmailAgentSession } from "./use-desktop-email-agent-session";
import { useAgentAcpEvents } from "./use-agent-acp-events";
import { submitPtyAgentPrompt } from "../pty";

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
};

/**
 * Quiet email-thread agent turns for sticky timeline comments (no agent tab focus).
 */
export function useEmailThreadCommentAgent({
  taskId,
  message,
  onResult,
}: {
  taskId: string | null;
  message: AgentMailMessageDetail | null;
  onResult: (result: EmailThreadCommentAgentResult) => void | Promise<void>;
}) {
  const resolvedTaskId = taskId?.trim() || "";
  const {
    agentChatId,
    creatingAgent,
    agentError,
    startAgentSession,
  } = useDesktopEmailAgentSession({
    taskId: resolvedTaskId || "email:idle",
    message,
    quiet: true,
  });

  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assistantTextRef = useRef("");
  const assistantBaselineRef = useRef(0);
  const turnActiveRef = useRef(false);
  const finalizeInFlightRef = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const chatIdRef = useRef<string | null>(null);
  chatIdRef.current = agentChatId?.trim() || null;

  const finalizeTurn = useCallback(async () => {
    if (!turnActiveRef.current || finalizeInFlightRef.current) return;
    finalizeInFlightRef.current = true;
    try {
      let text = assistantTextRef.current.trim();
      const chatId = chatIdRef.current;
      if (!text && chatId) {
        try {
          const synced = await syncAgentChatTranscript(chatId);
          if (countAssistantMessages(synced) > assistantBaselineRef.current) {
            text = latestAssistantText(synced);
          }
        } catch {
          const local = loadAgentChatTranscript(chatId);
          if (countAssistantMessages(local) > assistantBaselineRef.current) {
            text = latestAssistantText(local);
          }
        }
      }
      if (!text) return;
      turnActiveRef.current = false;
      const parsed = parseEmailAgentCommentResponse(text);
      // Tool noise during a successful draft turn should not stick as UI error.
      if (parsed.replyDraftBody?.trim()) {
        setError(null);
      }
      await onResultRef.current(parsed);
    } finally {
      setWorking(false);
      if (resolvedTaskId) clearLiveAgentWorkingForTask(resolvedTaskId);
      finalizeInFlightRef.current = false;
    }
  }, [resolvedTaskId]);

  useAgentAcpEvents({
    taskId: resolvedTaskId,
    chatId: agentChatId,
    cwd: "~",
    enabled: Boolean(resolvedTaskId) && working,
    onAssistantMessage: (forTaskId, text) => {
      if (forTaskId !== resolvedTaskId) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      assistantTextRef.current = trimmed;
      void finalizeTurn();
    },
    onAcpTurnSettled: (forTaskId) => {
      if (forTaskId !== resolvedTaskId) return;
      void finalizeTurn();
    },
    onAcpTurnState: (forTaskId, state) => {
      if (forTaskId !== resolvedTaskId) return;
      if (state.status === "completed") {
        void finalizeTurn();
        return;
      }
      if (state.status === "failed" || state.status === "interrupted") {
        turnActiveRef.current = false;
        setWorking(false);
        clearLiveAgentWorkingForTask(resolvedTaskId);
        if (state.status === "failed") {
          setError("Agent could not respond. Try again.");
        }
      }
    },
  });

  const sendComment = useCallback(
    async (
      userText: string,
      options?: { message?: AgentMailMessageDetail | null },
    ) => {
      const trimmed = userText.trim();
      const contextMessage = options?.message ?? message;
      if (
        !trimmed ||
        !resolvedTaskId ||
        !contextMessage ||
        working ||
        creatingAgent
      ) {
        return;
      }
      setError(null);
      turnActiveRef.current = true;
      assistantTextRef.current = "";
      setWorking(true);
      markLiveAgentWorkingForTask(resolvedTaskId);

      const existingChatId = chatIdRef.current;
      assistantBaselineRef.current = existingChatId
        ? countAssistantMessages(loadAgentChatTranscript(existingChatId))
        : 0;

      if (!existingChatId) {
        const chatId = await startAgentSession({
          prompt: trimmed,
          message: contextMessage,
        });
        if (!chatId) {
          turnActiveRef.current = false;
          setWorking(false);
          return;
        }
        return;
      }

      const acpPrompt = buildEmailAgentAcpPrompt(trimmed, contextMessage, {
        depth: "lean",
      });
      const result = await submitPtyAgentPrompt({
        taskId: resolvedTaskId,
        prompt: acpPrompt,
        chatId: existingChatId,
        cwd: "~",
        model: readAgentChatModelId(),
        mode: readAgentChatMode(),
      });
      if (!result.ok) {
        turnActiveRef.current = false;
        setWorking(false);
        clearLiveAgentWorkingForTask(resolvedTaskId);
        setError(result.error);
      }
    },
    [creatingAgent, message, resolvedTaskId, startAgentSession, working],
  );

  useEffect(() => {
    if (agentError) {
      setError(agentError);
      setWorking(false);
      turnActiveRef.current = false;
    }
  }, [agentError]);

  return {
    sendComment,
    working: working || creatingAgent,
    error,
  };
}
