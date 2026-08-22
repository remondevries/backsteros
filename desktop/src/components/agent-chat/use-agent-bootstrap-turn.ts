import {
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

import {
  createOptimisticTurnUiState,
  type AgentChatTurnUiState,
} from "../../lib/agent/agent-acp-activity";
import {
  createAgentChatMessage,
  publishAgentChatTranscriptMessage,
  saveAgentChatTranscript,
  type AgentChatMessage,
} from "../../lib/agent/agent-chat-transcript";
import { markLiveAgentWorkingForTask } from "../../lib/agent/clear-live-agent-working";
import { useDesktopAgentStatus } from "../../lib/agent/agent-status-context";
import type { AgentAttachRequest } from "../../lib/agent/cursor-agent-cli";

/** Start-agent bootstrap: optimistic Working… chrome + first user message. */
export function useAgentBootstrapTurn({
  taskId,
  startingAgent,
  agentAttachRequest,
  schedulePersistLiveTurnTimeline,
  liveTurnMessageIdRef,
  turnUiRef,
  turnActiveRef,
  bootstrapPromptKeyRef,
  chatIdRef,
  setLiveTurnMessageId,
  setTurnUi,
  setTurnPending,
  setTurnStartedAt,
  setOptimisticUserMessages,
  setMessages,
}: {
  taskId: string;
  startingAgent: boolean;
  agentAttachRequest: AgentAttachRequest | null;
  schedulePersistLiveTurnTimeline: () => void;
  liveTurnMessageIdRef: RefObject<string | null>;
  turnUiRef: RefObject<AgentChatTurnUiState>;
  turnActiveRef: RefObject<boolean>;
  bootstrapPromptKeyRef: RefObject<string | null>;
  chatIdRef: RefObject<string | null>;
  setLiveTurnMessageId: Dispatch<SetStateAction<string | null>>;
  setTurnUi: Dispatch<SetStateAction<AgentChatTurnUiState>>;
  setTurnPending: Dispatch<SetStateAction<boolean>>;
  setTurnStartedAt: Dispatch<SetStateAction<number | null>>;
  setOptimisticUserMessages: Dispatch<SetStateAction<AgentChatMessage[]>>;
  setMessages: Dispatch<SetStateAction<AgentChatMessage[]>>;
}) {
  const { pendingBootstrapPrompt, setPendingBootstrapPrompt } =
    useDesktopAgentStatus();

  // Start click → show Thinking / Working for… before ensure/attach returns.
  // Typed send already does this in dispatchPrompt; bootstrap lagged until
  // sessionIsNew arrived after the ACP ensure round-trip.
  useEffect(() => {
    if (!startingAgent) return;
    turnActiveRef.current = true;
    setTurnPending(true);
    setTurnStartedAt((prev) => prev ?? Date.now());
    if (!liveTurnMessageIdRef.current) {
      const liveId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `live-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      liveTurnMessageIdRef.current = liveId;
      setLiveTurnMessageId(liveId);
    }
    setTurnUi((prev) => {
      if (prev.phase !== "idle") return prev;
      const next = createOptimisticTurnUiState();
      turnUiRef.current = next;
      return next;
    });
    markLiveAgentWorkingForTask(taskId);
  }, [startingAgent, taskId]);

  // Optimistic Start-agent user bubble as soon as the prompt is known (before
  // ensure/attach returns a real chatId).
  useEffect(() => {
    const pending = pendingBootstrapPrompt;
    if (!pending || pending.taskId !== taskId) return;
    const prompt = pending.prompt.trim();
    if (!prompt) return;
    const message: AgentChatMessage = {
      id: pending.messageId,
      role: "user",
      text: prompt,
      createdAt: pending.createdAt,
      ...(pending.images && pending.images.length > 0
        ? {
            images: pending.images.map((image) => ({
              id: image.id,
              name: image.name,
              mimeType: image.mimeType,
              ...(image.dataBase64
                ? { dataBase64: image.dataBase64 }
                : {}),
            })),
          }
        : {}),
    };
    setOptimisticUserMessages((prev) => {
      if (
        prev.some((entry) => entry.id === message.id || entry.text === prompt)
      ) {
        return prev;
      }
      return [...prev, message];
    });
  }, [pendingBootstrapPrompt, taskId]);

  // Record the Start-agent bootstrap prompt as the first user message once.
  // sessionIsNew means a bootstrap turn is already in flight (Start agent) —
  // not merely a fresh chat id (/clear).
  useEffect(() => {
    const request = agentAttachRequest;
    if (!request || request.taskId !== taskId) return;
    if (request.sessionIsNew) {
      // Keep Working… lit if the startingAgent effect already ran; otherwise
      // light it up here (e.g. attach arrived without a startingAgent frame).
      turnActiveRef.current = true;
      setTurnPending(true);
      setTurnStartedAt((prev) => prev ?? Date.now());
      // Match typed send: mint a live id so settled projector rows can be
      // suppressed while the bootstrap turn is still open.
      if (!liveTurnMessageIdRef.current) {
        const liveId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `live-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        liveTurnMessageIdRef.current = liveId;
        setLiveTurnMessageId(liveId);
      }
      setTurnUi((prev) => {
        if (prev.phase !== "idle") return prev;
        const next = createOptimisticTurnUiState();
        turnUiRef.current = next;
        return next;
      });
      markLiveAgentWorkingForTask(taskId);
    }
    const prompt = request.prompt?.trim();
    if (!prompt || !request.sessionIsNew) return;
    const key = `${request.chatId}:${prompt.slice(0, 80)}`;
    if (bootstrapPromptKeyRef.current === key) return;
    bootstrapPromptKeyRef.current = key;

    const pending =
      pendingBootstrapPrompt?.taskId === taskId &&
      pendingBootstrapPrompt.prompt.trim() === prompt
        ? pendingBootstrapPrompt
        : null;
    const message: AgentChatMessage = pending
      ? {
          id: pending.messageId,
          role: "user",
          text: prompt,
          createdAt: pending.createdAt,
          ...(pending.images && pending.images.length > 0
            ? {
                images: pending.images.map((image) => ({
                  id: image.id,
                  name: image.name,
                  mimeType: image.mimeType,
                  ...(image.dataBase64
                    ? { dataBase64: image.dataBase64 }
                    : {}),
                })),
              }
            : {}),
        }
      : createAgentChatMessage("user", prompt);
    setOptimisticUserMessages((prev) => {
      if (prev.some((entry) => entry.id === message.id || entry.text === prompt)) {
        return prev;
      }
      return [...prev, message];
    });
    setMessages((prev) => {
      if (prev.some((m) => m.role === "user" && m.text === prompt)) {
        return prev;
      }
      const next = [...prev, message];
      // Persist under the new chat id immediately so the agentChatId load
      // effect does not wipe an empty transcript over the bootstrap message.
      saveAgentChatTranscript(request.chatId, next);
      publishAgentChatTranscriptMessage(request.chatId, message);
      chatIdRef.current = request.chatId;
      return next;
    });
    setPendingBootstrapPrompt(null);
    // Persist live timeline only after the user row is queued (T3 order).
    if (request.sessionIsNew) {
      window.setTimeout(() => {
        schedulePersistLiveTurnTimeline();
      }, 0);
    }
  }, [
    agentAttachRequest,
    pendingBootstrapPrompt,
    schedulePersistLiveTurnTimeline,
    setPendingBootstrapPrompt,
    taskId,
  ]);
}
