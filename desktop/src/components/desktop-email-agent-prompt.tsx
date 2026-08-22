import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { AgentMailMessageDetail } from "@backsteros/contracts";
import { TaskCommentEditor } from "@backsteros/ui";

import { readAgentChatMode } from "../lib/agent/agent-chat-mode";
import { readAgentChatModelId } from "../lib/agent/agent-chat-model";
import {
  loadAgentChatTranscript,
  syncAgentChatTranscript,
  type AgentChatMessage,
} from "../lib/agent/agent-chat-transcript";
import {
  clearLiveAgentWorkingForTask,
  markLiveAgentWorkingForTask,
} from "../lib/agent/clear-live-agent-working";
import {
  buildEmailAgentAcpPrompt,
  buildEmailComposeAgentAcpPrompt,
  type EmailComposeContext,
} from "../lib/agent/email-agent-prompt";
import { useDesktopEmailAgentSession } from "../lib/agent/use-desktop-email-agent-session";
import { useAgentAcpEvents } from "../lib/agent/use-agent-acp-events";
import { submitPtyAgentPrompt } from "../lib/pty";

export type DesktopEmailAgentPromptProps = {
  taskId: string;
  message?: AgentMailMessageDetail | null;
  composeContext?: EmailComposeContext | null;
  onAssistantTurnComplete?: (text: string) => void | Promise<void>;
  onWorkingChange?: (working: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Shown as a context chip (e.g. when revising an open draft). */
  contextLabel?: string | null;
};

function countAssistantMessages(rows: readonly AgentChatMessage[]): number {
  return rows.filter((row) => row.role === "assistant").length;
}

function EmailPromptSendIcon() {
  return (
    <svg
      className="email-agent-prompt__send-icon"
      viewBox="0 0 14 14"
      aria-hidden="true"
    >
      <path
        d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function resolveLatestAssistantText(
  rows: readonly AgentChatMessage[],
): string {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row?.role === "assistant" && row.text.trim()) {
      return row.text.trim();
    }
  }
  return "";
}

/**
 * Minimal email drafting prompt — no chat transcript, no steer UI.
 */
export function DesktopEmailAgentPrompt({
  taskId,
  message = null,
  composeContext = null,
  onAssistantTurnComplete,
  onWorkingChange,
  disabled = false,
  placeholder = "Describe the email you want…",
  contextLabel = null,
}: DesktopEmailAgentPromptProps) {
  const [draft, setDraft] = useState("");
  const [working, setWorking] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const turnNotifiedRef = useRef<string | null>(null);
  const assistantTextRef = useRef("");
  const chatIdRef = useRef<string | null>(null);
  const finalizeInFlightRef = useRef(false);
  const assistantBaselineRef = useRef(0);
  const finalizeTimerRef = useRef<number | null>(null);

  const {
    agentChatId,
    creatingAgent,
    agentError,
    startAgentSession,
  } = useDesktopEmailAgentSession({
    taskId,
    message,
    composeContext,
  });

  chatIdRef.current = agentChatId?.trim() || null;

  const setWorkingState = useCallback(
    (next: boolean) => {
      setWorking(next);
      onWorkingChange?.(next);
    },
    [onWorkingChange],
  );

  const notifyComplete = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !onAssistantTurnComplete) return;
      const key = trimmed.slice(0, 240);
      if (turnNotifiedRef.current === key) return;
      turnNotifiedRef.current = key;
      await onAssistantTurnComplete(trimmed);
    },
    [onAssistantTurnComplete],
  );

  const resolveAssistantText = useCallback(
    async (options?: { requireNewAssistant?: boolean }): Promise<string> => {
      const cached = assistantTextRef.current.trim();
      if (cached) return cached;

      const chatId = chatIdRef.current;
      if (!chatId) return "";

      const synced = await syncAgentChatTranscript(chatId);
      if (
        options?.requireNewAssistant &&
        countAssistantMessages(synced) <= assistantBaselineRef.current
      ) {
        return "";
      }

      const fromSync = resolveLatestAssistantText(synced);
      if (fromSync) {
        assistantTextRef.current = fromSync;
        return fromSync;
      }

      const local = loadAgentChatTranscript(chatId);
      if (
        options?.requireNewAssistant &&
        countAssistantMessages(local) <= assistantBaselineRef.current
      ) {
        return "";
      }

      return resolveLatestAssistantText(local);
    },
    [],
  );

  const finalizeTurnRef = useRef<() => Promise<void>>(async () => {});

  const finalizeTurn = useCallback(async () => {
    if (finalizeInFlightRef.current) return;
    finalizeInFlightRef.current = true;
    try {
      const text = await resolveAssistantText({ requireNewAssistant: true });
      if (!text.trim()) return;
      await notifyComplete(text);
    } finally {
      setWorkingState(false);
      clearLiveAgentWorkingForTask(taskId);
      finalizeInFlightRef.current = false;
    }
  }, [notifyComplete, resolveAssistantText, setWorkingState, taskId]);

  finalizeTurnRef.current = finalizeTurn;

  const scheduleFinalize = useCallback(() => {
    if (finalizeTimerRef.current != null) {
      window.clearTimeout(finalizeTimerRef.current);
    }
    finalizeTimerRef.current = window.setTimeout(() => {
      finalizeTimerRef.current = null;
      void finalizeTurnRef.current();
    }, 350);
  }, []);

  useEffect(
    () => () => {
      if (finalizeTimerRef.current != null) {
        window.clearTimeout(finalizeTimerRef.current);
      }
    },
    [],
  );

  useAgentAcpEvents({
    taskId,
    chatId: agentChatId,
    cwd: "~",
    enabled: Boolean(taskId.trim()) && (working || creatingAgent),
    onAssistantMessage: (forTaskId, text) => {
      if (forTaskId !== taskId) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      assistantTextRef.current = trimmed;
      scheduleFinalize();
    },
    onAcpTurnSettled: (forTaskId) => {
      if (forTaskId !== taskId) return;
      scheduleFinalize();
    },
    onAcpTurnState: (forTaskId, state) => {
      if (forTaskId !== taskId) return;
      if (state.status === "completed") {
        scheduleFinalize();
        return;
      }
      if (state.status === "failed" || state.status === "interrupted") {
        setWorkingState(false);
        clearLiveAgentWorkingForTask(taskId);
        if (state.status === "failed") {
          setSendError("Could not compose email. Try again.");
        }
      }
    },
  });

  useEffect(() => {
    if (!working) return;

    let cancelled = false;
    let attempts = 0;

    async function pollForCompletion() {
      if (cancelled) return;
      attempts += 1;

      const chatId = chatIdRef.current;
      if (chatId) {
        try {
          const text = await resolveAssistantText({ requireNewAssistant: true });
          if (text.trim()) {
            void finalizeTurn();
            return;
          }
        } catch {
          /* ignore poll errors */
        }
      }

      if (attempts >= 90) {
        setWorkingState(false);
        clearLiveAgentWorkingForTask(taskId);
        setSendError("Draft timed out. Try again.");
      }
    }

    void pollForCompletion();
    const timer = window.setInterval(() => {
      void pollForCompletion();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [finalizeTurn, resolveAssistantText, setWorkingState, taskId, working]);

  const buildAcpPrompt = useCallback(
    (userPrompt: string) => {
      if (composeContext) {
        return buildEmailComposeAgentAcpPrompt(userPrompt, composeContext);
      }
      if (message) {
        return buildEmailAgentAcpPrompt(userPrompt, message, {
          depth: agentChatId?.trim() ? "lean" : "full",
        });
      }
      return userPrompt.trim();
    },
    [agentChatId, composeContext, message],
  );

  const beginTurn = useCallback(() => {
    const chatId = chatIdRef.current;
    assistantBaselineRef.current = chatId
      ? countAssistantMessages(loadAgentChatTranscript(chatId))
      : 0;
    assistantTextRef.current = "";
    turnNotifiedRef.current = null;
    setSendError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    const userText = draft.trim();
    if (!userText || working || creatingAgent) return;

    beginTurn();

    if (!agentChatId?.trim()) {
      setDraft("");
      setWorkingState(true);
      markLiveAgentWorkingForTask(taskId);
      await startAgentSession({ prompt: userText });
      return;
    }

    const acpPrompt = buildAcpPrompt(userText);
    setDraft("");
    setWorkingState(true);
    markLiveAgentWorkingForTask(taskId);

    const result = await submitPtyAgentPrompt({
      taskId,
      prompt: acpPrompt,
      chatId: agentChatId,
      cwd: "~",
      model: readAgentChatModelId(),
      mode: readAgentChatMode(),
    });

    if (!result.ok) {
      setSendError(result.error);
      setWorkingState(false);
      clearLiveAgentWorkingForTask(taskId);
      setDraft(userText);
    }
  }, [
    agentChatId,
    beginTurn,
    buildAcpPrompt,
    creatingAgent,
    draft,
    setWorkingState,
    startAgentSession,
    taskId,
    working,
  ]);

  useEffect(() => {
    if (creatingAgent) setWorkingState(true);
  }, [creatingAgent, setWorkingState]);

  useEffect(() => {
    if (!agentError) return;
    setWorkingState(false);
    clearLiveAgentWorkingForTask(taskId);
  }, [agentError, setWorkingState, taskId]);

  const displayError = sendError || agentError;
  const inputDisabled = disabled || working || creatingAgent;
  const submitDisabled = inputDisabled || !draft.trim();

  const busy = working || creatingAgent;
  const context = contextLabel?.trim() || null;

  return (
    <div
      className={[
        "email-agent-prompt",
        context ? "email-agent-prompt--has-context" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {displayError ? (
        <p className="email-agent-prompt__error" role="alert">
          {displayError}
        </p>
      ) : null}
      <div className="email-agent-prompt__shell">
        <div
          className={[
            "email-agent-prompt__host",
            disabled && !busy ? "email-agent-prompt__host--inactive" : "",
            context ? "email-agent-prompt__host--context" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="email-agent-prompt__inner">
            {context ? (
              <div className="email-agent-prompt__context" aria-live="polite">
                <span className="email-agent-prompt__context-chip">
                  {context}
                </span>
              </div>
            ) : null}
            <div className="email-agent-prompt__input-row">
              <TaskCommentEditor
                className="email-agent-prompt__input"
                variant="composer"
                value={draft}
                disabled={inputDisabled}
                placeholder={placeholder}
                ariaLabel={
                  context
                    ? `Ask AI to update ${context}`
                    : "Email drafting instructions"
                }
                submitOnEnter
                onChange={setDraft}
                onSubmitShortcut={() => {
                  void handleSubmit();
                }}
              />
            </div>
            <div className="email-agent-prompt__toolbar">
              <button
                type="button"
                className={[
                  "email-agent-prompt__send",
                  busy ? "email-agent-prompt__send--busy" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={busy ? true : submitDisabled}
                aria-disabled={busy ? true : submitDisabled}
                aria-busy={busy}
                aria-label={busy ? "Drafting" : "Send"}
                title={busy ? "Drafting…" : "Send"}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => void handleSubmit()}
              >
                {busy ? (
                  <Loader2
                    className="email-agent-prompt__send-icon email-agent-prompt__send-icon--spin"
                    aria-hidden="true"
                  />
                ) : (
                  <EmailPromptSendIcon />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
