import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentMailMessageDetail } from "@backsteros/contracts";

import { readAgentChatMode } from "./agent-chat-mode";
import { readAgentChatModelId } from "./agent-chat-model";
import {
  createAgentChatMessage,
  publishAgentChatTranscriptMessage,
  saveAgentChatTranscript,
} from "./agent-chat-transcript";
import { useDesktopAgentStatus } from "./agent-status-context";
import {
  clearLiveAgentWorkingForTask,
  markLiveAgentWorkingForTask,
} from "./clear-live-agent-working";
import {
  buildEmailAgentAcpPrompt,
  buildEmailComposeAgentAcpPrompt,
  readEmailAgentChatId,
  writeEmailAgentChatId,
  type EmailComposeContext,
} from "./email-agent-prompt";
import { startEmailAgentSession } from "./start-email-agent-session";

export type UseDesktopEmailAgentSessionOptions = {
  taskId: string;
  message: AgentMailMessageDetail | null;
  composeContext?: EmailComposeContext | null;
};

/**
 * Email agent lifecycle — chat id in localStorage (not Postgres).
 */
export function useDesktopEmailAgentSession({
  taskId,
  message,
  composeContext = null,
}: UseDesktopEmailAgentSessionOptions) {
  const [agentChatId, setAgentChatId] = useState<string | null>(() =>
    readEmailAgentChatId(taskId),
  );
  const {
    requestAttach,
    requestEnd,
    focusAgentTab,
    setPendingBootstrapPrompt,
  } = useDesktopAgentStatus();

  const [creatingAgent, setCreatingAgent] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const creatingAgentRef = useRef(false);

  useEffect(() => {
    setAgentChatId(readEmailAgentChatId(taskId));
  }, [taskId]);

  const hasSession = Boolean(agentChatId?.trim());

  const startAgentSession = useCallback(
    async (options?: { prompt?: string; mode?: string | null }) => {
      const isCompose = Boolean(composeContext);
      if (!isCompose && !message) {
        setAgentError("Select a message before starting the agent.");
        return;
      }
      if (isCompose && !composeContext?.fromEmail.trim()) {
        setAgentError("Choose a From inbox before starting the agent.");
        return;
      }
      if (creatingAgentRef.current) return;
      creatingAgentRef.current = true;
      setCreatingAgent(true);
      setAgentError(null);
      markLiveAgentWorkingForTask(taskId);
      focusAgentTab();

      const userPrompt = options?.prompt?.trim();
      if (!userPrompt) {
        creatingAgentRef.current = false;
        setCreatingAgent(false);
        clearLiveAgentWorkingForTask(taskId);
        setAgentError("Type a message to start the agent.");
        return;
      }

      const acpPrompt = isCompose
        ? buildEmailComposeAgentAcpPrompt(userPrompt, composeContext!)
        : buildEmailAgentAcpPrompt(userPrompt, message!);
      const bootstrap = createAgentChatMessage("user", userPrompt);
      setPendingBootstrapPrompt({
        taskId,
        prompt: userPrompt,
        messageId: bootstrap.id,
        createdAt: bootstrap.createdAt,
      });

      try {
        const result = await startEmailAgentSession({
          taskId,
          prompt: acpPrompt,
          model: readAgentChatModelId(),
          mode: options?.mode ?? readAgentChatMode(),
        });
        if (!result.ok) {
          setPendingBootstrapPrompt(null);
          clearLiveAgentWorkingForTask(taskId);
          throw new Error(result.error);
        }
        saveAgentChatTranscript(result.chatId, [bootstrap]);
        publishAgentChatTranscriptMessage(result.chatId, bootstrap);
        writeEmailAgentChatId(taskId, result.chatId);
        setAgentChatId(result.chatId);
        requestAttach({
          taskId,
          chatId: result.chatId,
          prompt: userPrompt,
          sessionIsNew: true,
          forceReattach: true,
          focusUi: true,
        });
        setPendingBootstrapPrompt(null);
      } catch (err) {
        setPendingBootstrapPrompt(null);
        clearLiveAgentWorkingForTask(taskId);
        setAgentError(
          err instanceof Error
            ? err.message
            : "Could not create agent session.",
        );
      } finally {
        creatingAgentRef.current = false;
        setCreatingAgent(false);
      }
    },
    [
      composeContext,
      focusAgentTab,
      message,
      requestAttach,
      setPendingBootstrapPrompt,
      taskId,
    ],
  );

  const endAgentSession = useCallback(() => {
    const chatId = agentChatId?.trim();
    if (!chatId) return;
    clearLiveAgentWorkingForTask(taskId);
    requestEnd({ taskId, chatId });
    writeEmailAgentChatId(taskId, null);
    setAgentChatId(null);
  }, [agentChatId, requestEnd, taskId]);

  return {
    agentChatId,
    hasSession,
    creatingAgent,
    agentError,
    startAgentSession,
    endAgentSession,
  };
}
