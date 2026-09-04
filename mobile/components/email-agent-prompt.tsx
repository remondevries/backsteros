import type { AgentPtyConnection } from "@backsteros/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  createAgentChatMessage,
  loadAgentChatTranscript,
  publishAgentChatTranscriptMessage,
  saveAgentChatTranscript,
  syncAgentChatTranscript,
  type AgentChatMessage,
} from "../lib/agent/agent-chat-transcript";
import { fetchAgentPtyConnection, submitPtyAgentPrompt } from "../lib/agent/agent-pty";
import {
  buildEmailComposeAgentAcpPrompt,
  type EmailComposeContext,
} from "../lib/agent/email-agent-prompt";
import {
  readEmailAgentChatId,
  writeEmailAgentChatId,
} from "../lib/agent/email-agent-chat-id";
import { startEmailAgentSession } from "../lib/agent/start-email-agent-session";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { colors } from "../lib/theme";
import { TextInput } from "./app-text-input";

export type EmailAgentPromptProps = {
  taskId: string;
  composeContext: EmailComposeContext;
  onAssistantTurnComplete?: (text: string) => void | Promise<void>;
  onWorkingChange?: (working: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
  contextLabel?: string | null;
};

function countAssistantMessages(rows: readonly AgentChatMessage[]): number {
  return rows.filter((row) => row.role === "assistant").length;
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
 * Minimal email drafting prompt — no transcript UI (desktop EmailAgentPrompt parity).
 * Requires Settings → Server / Tailscale PTY reachable.
 */
export function EmailAgentPrompt({
  taskId,
  composeContext,
  onAssistantTurnComplete,
  onWorkingChange,
  disabled = false,
  placeholder = "Describe the email you want…",
  contextLabel = null,
}: EmailAgentPromptProps) {
  const client = useMobileApiClient();
  const [draft, setDraft] = useState("");
  const [working, setWorking] = useState(false);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [agentChatId, setAgentChatId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const connectionRef = useRef<AgentPtyConnection | null>(null);
  const chatIdRef = useRef<string | null>(null);
  const turnNotifiedRef = useRef<string | null>(null);
  const assistantTextRef = useRef("");
  const assistantBaselineRef = useRef(0);
  const finalizeInFlightRef = useRef(false);
  const creatingRef = useRef(false);

  chatIdRef.current = agentChatId?.trim() || null;

  useEffect(() => {
    let cancelled = false;
    void readEmailAgentChatId(taskId).then((id) => {
      if (!cancelled) setAgentChatId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

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

      const connection = connectionRef.current;
      if (connection) {
        try {
          const synced = await syncAgentChatTranscript(connection, chatId);
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
        } catch {
          /* fall through to local */
        }
      }

      const local = await loadAgentChatTranscript(chatId);
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

  const finalizeTurn = useCallback(async () => {
    if (finalizeInFlightRef.current) return;
    finalizeInFlightRef.current = true;
    try {
      const text = await resolveAssistantText({ requireNewAssistant: true });
      if (!text.trim()) return;
      await notifyComplete(text);
    } finally {
      setWorkingState(false);
      finalizeInFlightRef.current = false;
    }
  }, [notifyComplete, resolveAssistantText, setWorkingState]);

  useEffect(() => {
    if (!working) return;

    let cancelled = false;
    let attempts = 0;

    async function pollForCompletion() {
      if (cancelled) return;
      attempts += 1;
      try {
        const text = await resolveAssistantText({ requireNewAssistant: true });
        if (text.trim()) {
          void finalizeTurn();
          return;
        }
      } catch {
        /* ignore poll errors */
      }
      if (attempts >= 90) {
        setWorkingState(false);
        setSendError("Draft timed out. Try again.");
      }
    }

    void pollForCompletion();
    const timer = setInterval(() => {
      void pollForCompletion();
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [finalizeTurn, resolveAssistantText, setWorkingState, working]);

  const beginTurn = useCallback(async () => {
    const chatId = chatIdRef.current;
    assistantBaselineRef.current = chatId
      ? countAssistantMessages(await loadAgentChatTranscript(chatId))
      : 0;
    assistantTextRef.current = "";
    turnNotifiedRef.current = null;
    setSendError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    const userText = draft.trim();
    if (!userText || working || creatingAgent || creatingRef.current) return;
    if (!composeContext.fromEmail.trim()) {
      setSendError("Choose a From mailbox before drafting.");
      return;
    }

    await beginTurn();
    setDraft("");

    const acpPrompt = buildEmailComposeAgentAcpPrompt(
      userText,
      composeContext,
    );

    if (!agentChatId?.trim()) {
      creatingRef.current = true;
      setCreatingAgent(true);
      setWorkingState(true);
      try {
        const discovered = await fetchAgentPtyConnection(client);
        if (!discovered.ok) {
          throw new Error(discovered.error);
        }
        connectionRef.current = discovered.connection;

        const result = await startEmailAgentSession(discovered.connection, {
          taskId,
          prompt: acpPrompt,
        });
        if (!result.ok) {
          throw new Error(result.error);
        }

        const bootstrap = createAgentChatMessage("user", userText);
        await saveAgentChatTranscript(result.chatId, [bootstrap]);
        publishAgentChatTranscriptMessage(
          discovered.connection,
          result.chatId,
          bootstrap,
        );
        await writeEmailAgentChatId(taskId, result.chatId);
        setAgentChatId(result.chatId);
      } catch (error) {
        setSendError(
          error instanceof Error
            ? error.message
            : "Could not start email agent.",
        );
        setWorkingState(false);
        setDraft(userText);
      } finally {
        creatingRef.current = false;
        setCreatingAgent(false);
      }
      return;
    }

    setWorkingState(true);
    let connection = connectionRef.current;
    if (!connection) {
      const discovered = await fetchAgentPtyConnection(client);
      if (!discovered.ok) {
        setSendError(discovered.error);
        setWorkingState(false);
        setDraft(userText);
        return;
      }
      connection = discovered.connection;
      connectionRef.current = connection;
    }

    const result = await submitPtyAgentPrompt(connection, {
      taskId,
      prompt: acpPrompt,
      chatId: agentChatId,
      cwd: "~",
    });

    if (!result.ok) {
      setSendError(result.error);
      setWorkingState(false);
      setDraft(userText);
    }
  }, [
    agentChatId,
    beginTurn,
    client,
    composeContext,
    creatingAgent,
    draft,
    setWorkingState,
    taskId,
    working,
  ]);

  const busy = working || creatingAgent;
  const inputDisabled = disabled || busy;
  const submitDisabled = inputDisabled || !draft.trim();
  const context = contextLabel?.trim() || null;

  return (
    <View style={styles.root}>
      {sendError ? (
        <Text style={styles.error} accessibilityRole="alert">
          {sendError}
        </Text>
      ) : null}
      {context ? (
        <View style={styles.contextChip} accessibilityLiveRegion="polite">
          <Text style={styles.contextLabel}>{context}</Text>
        </View>
      ) : null}
      <View style={styles.shell}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          editable={!inputDisabled}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          multiline
          style={styles.input}
          accessibilityLabel={
            context
              ? `Ask AI to update ${context}`
              : "Email drafting instructions"
          }
          onSubmitEditing={() => {
            void handleSubmit();
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={busy ? "Drafting" : "Send"}
          accessibilityState={{ disabled: busy ? true : submitDisabled, busy }}
          disabled={busy ? true : submitDisabled}
          onPress={() => {
            void handleSubmit();
          }}
          style={({ pressed }) => [
            styles.send,
            (busy ? true : submitDisabled) ? styles.sendDisabled : null,
            pressed && !(busy || submitDisabled) ? { opacity: 0.75 } : null,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <Text style={styles.sendLabel}>↑</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 8,
  },
  error: {
          color: colors.danger,
    fontSize: 13,
  },
  contextChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  contextLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
  },
  shell: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.14)",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    color: colors.foreground,
    fontSize: 15,
    lineHeight: 20,
    paddingVertical: 6,
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.foreground,
  },
  sendDisabled: {
    opacity: 0.4,
  },
  sendLabel: {
    color: colors.background,
    fontSize: 16,
    fontWeight: "700",
  },
});
