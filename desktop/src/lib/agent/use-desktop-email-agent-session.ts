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
  buildEmailDraftReviseAgentAcpPrompt,
  readEmailAgentChatId,
  resolveEditableEmailDraftBody,
  writeEmailAgentChatId,
  type EmailAgentPromptIntent,
  type EmailComposeContext,
} from "./email-agent-prompt";
import { startEmailAgentSession } from "./start-email-agent-session";

export type UseDesktopEmailAgentSessionOptions = {
  taskId: string;
  message: AgentMailMessageDetail | null;
  composeContext?: EmailComposeContext | null;
  /** When true, do not focus the global agent chat tab (timeline comments). */
  quiet?: boolean;
};

/**
 * Email agent lifecycle — chat id in localStorage (not Postgres).
 */
export function useDesktopEmailAgentSession({
  taskId,
  message,
  composeContext = null,
  quiet = false,
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
    async (options?: {
      prompt?: string;
      mode?: string | null;
      message?: AgentMailMessageDetail | null;
      intent?: EmailAgentPromptIntent;
      draftBody?: string;
    }) => {
      const isCompose = Boolean(composeContext);
      const contextMessage = options?.message ?? message;
      if (!isCompose && !contextMessage) {
        setAgentError("Select a message before starting the agent.");
        return null;
      }
      if (isCompose && !composeContext?.fromEmail.trim()) {
        setAgentError("Choose a From inbox before starting the agent.");
        return null;
      }
      if (creatingAgentRef.current) return null;
      creatingAgentRef.current = true;
      setCreatingAgent(true);
      setAgentError(null);
      markLiveAgentWorkingForTask(taskId);
      if (!quiet) focusAgentTab();

      const userPrompt = options?.prompt?.trim();
      if (!userPrompt) {
        creatingAgentRef.current = false;
        setCreatingAgent(false);
        clearLiveAgentWorkingForTask(taskId);
        setAgentError("Type a message to start the agent.");
        return null;
      }

      const intent = options?.intent ?? "comment";
      const acpPrompt = isCompose
        ? buildEmailComposeAgentAcpPrompt(userPrompt, composeContext!)
        : intent === "revise-draft"
          ? buildEmailDraftReviseAgentAcpPrompt(
              userPrompt,
              contextMessage!,
              options?.draftBody ??
                resolveEditableEmailDraftBody(contextMessage!.conceptDraft),
            )
          : buildEmailAgentAcpPrompt(userPrompt, contextMessage!, {
              depth: "full",
            });
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
          focusUi: !quiet,
        });
        setPendingBootstrapPrompt(null);
        return result.chatId;
      } catch (err) {
        setPendingBootstrapPrompt(null);
        clearLiveAgentWorkingForTask(taskId);
        setAgentError(
          err instanceof Error
            ? err.message
            : "Could not create agent session.",
        );
        return null;
      } finally {
        creatingAgentRef.current = false;
        setCreatingAgent(false);
      }
    },
    [
      composeContext,
      focusAgentTab,
      message,
      quiet,
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
