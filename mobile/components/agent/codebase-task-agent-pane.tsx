import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { AgentPtyConnection } from "@backsteros/contracts";

import { buildReadyToStartAgentPrompt } from "../../lib/agent/agent-launch";
import {
  createAgentChatMessage,
  loadAgentChatTranscript,
  publishAgentChatTranscriptMessage,
  saveAgentChatTranscript,
  syncAgentChatTranscript,
  type AgentChatMessage,
} from "../../lib/agent/agent-chat-transcript";
import {
  cancelPtyAcpTurn,
  ensurePtyAcpSession,
  fetchAgentPtyConnection,
  findPtySessionForTask,
  killPtySession,
  setStoredPtySessionId,
  submitPtyAgentPrompt,
} from "../../lib/agent/agent-pty";
import {
  hydrateAgentChatModelId,
} from "../../lib/agent/agent-chat-model";
import { colors } from "../../lib/theme";
import { useMobileApiClient } from "../../lib/use-mobile-api-client";
import { AgentChatComposer } from "./agent-chat-composer";
import { AgentChatTranscript } from "./agent-chat-transcript";

type Props = {
  taskId: string;
  taskNumber?: number | null;
  taskTitle: string;
  taskDescription?: string | null;
  taskDisplayId?: string | null;
  projectId: string;
  projectKey?: string | null;
  /** Kept for call-site compatibility; ACP chat does not use project labels. */
  projectLabel?: string;
  cwd: string | null;
  agentChatId: string | null;
  onAgentChatIdChange: (chatId: string | null) => void | Promise<void>;
};

type PaneStatus = "idle" | "connecting" | "ready" | "error";

/**
 * iPad codebase right pane: Start / Stop agent (same lifecycle as desktop),
 * Chat-only via Cursor ACP on the laptop sidecar (T3-style; no agent TUI).
 */
export function CodebaseTaskAgentPane({
  taskId,
  taskNumber = null,
  taskTitle,
  taskDescription = null,
  taskDisplayId = null,
  projectId: _projectId,
  projectKey = null,
  cwd,
  agentChatId,
  onAgentChatIdChange,
}: Props) {
  const client = useMobileApiClient();
  const [status, setStatus] = useState<PaneStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<"working" | "idle" | null>(null);
  const [busy, setBusy] = useState<"create" | "end" | null>(null);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);

  const chatIdRef = useRef<string | null>(
    agentChatId?.trim().toLowerCase() || null,
  );
  const sessionIdRef = useRef<string | null>(null);
  const connectionRef = useRef<AgentPtyConnection | null>(null);
  const sessionIsNewRef = useRef(false);
  const bootstrapPromptRef = useRef<string | null>(null);
  const connectKeyRef = useRef<string | null>(null);
  const bootstrapPromptKeyRef = useRef<string | null>(null);
  const previousTaskIdRef = useRef(taskId);

  const workingDirectory = cwd?.trim() || null;
  const hasSession = Boolean(agentChatId?.trim());
  const agentButtonMode: "create" | "end" = !hasSession ? "create" : "end";
  const working = activity === "working";
  const sessionReady = hasSession && status === "ready";

  useEffect(() => {
    void hydrateAgentChatModelId();
  }, []);

  useEffect(() => {
    chatIdRef.current = agentChatId?.trim().toLowerCase() || null;
  }, [agentChatId]);

  useEffect(() => {
    const taskChanged = previousTaskIdRef.current !== taskId;
    previousTaskIdRef.current = taskId;
    if (taskChanged) {
      bootstrapPromptKeyRef.current = null;
    }

    const id = agentChatId?.trim() || null;
    if (!id) {
      if (taskChanged) setMessages([]);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const applyRemote = (loaded: AgentChatMessage[]) => {
      if (cancelled) return;
      setMessages((prev) => {
        if (loaded.length > 0) return loaded;
        if (prev.length > 0) {
          void saveAgentChatTranscript(id, prev);
          return prev;
        }
        return [];
      });
    };

    void loadAgentChatTranscript(id).then((loaded) => {
      if (cancelled) return;
      setMessages((prev) => {
        if (loaded.length > 0) return loaded;
        if (prev.length > 0) return prev;
        return [];
      });
    });

    void (async () => {
      try {
        let connection = connectionRef.current;
        if (!connection) {
          const discovered = await fetchAgentPtyConnection(client);
          if (!discovered.ok) return;
          connection = discovered.connection;
          connectionRef.current = connection;
        }
        if (cancelled) return;
        applyRemote(await syncAgentChatTranscript(connection, id));

        timer = setInterval(() => {
          void syncAgentChatTranscript(connection, id).then((loaded) => {
            if (cancelled || loaded.length === 0) return;
            setMessages((prev) => {
              if (
                prev.length === loaded.length &&
                prev[prev.length - 1]?.id === loaded[loaded.length - 1]?.id
              ) {
                return prev;
              }
              return loaded;
            });
          });
        }, 2500);
      } catch {
        /* offline — keep local cache */
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [agentChatId, client, taskId]);

  useEffect(() => {
    const id = agentChatId?.trim();
    if (!id) return;
    void saveAgentChatTranscript(id, messages);
  }, [agentChatId, messages]);

  useEffect(() => {
    if (status !== "ready") return;
    if (!sessionIsNewRef.current) return;
    const prompt = bootstrapPromptRef.current?.trim();
    const chatId = agentChatId?.trim();
    if (!prompt || !chatId) return;
    const key = `${chatId}:${prompt.slice(0, 80)}`;
    if (bootstrapPromptKeyRef.current === key) return;
    bootstrapPromptKeyRef.current = key;

    const message = createAgentChatMessage("user", prompt);
    setMessages((prev) => {
      if (prev.some((m) => m.role === "user" && m.text === prompt)) {
        return prev;
      }
      const next = [...prev, message];
      void saveAgentChatTranscript(chatId, next);
      publishAgentChatTranscriptMessage(
        connectionRef.current,
        chatId,
        message,
      );
      return next;
    });
    sessionIsNewRef.current = false;
    bootstrapPromptRef.current = null;
  }, [agentChatId, status]);

  const submitChatPrompt = useCallback(
    (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed || !hasSession) return false;
      const connection = connectionRef.current;
      if (!connection) return false;
      setActivity("working");
      void submitPtyAgentPrompt(connection, {
        taskId,
        prompt: trimmed,
        chatId: chatIdRef.current,
        cwd: workingDirectory,
      }).then((result) => {
        if (!result.ok) {
          setSendError(result.error);
          setActivity("idle");
        }
      });
      return true;
    },
    [hasSession, taskId, workingDirectory],
  );

  const interruptChat = useCallback(() => {
    const connection = connectionRef.current;
    if (!connection) return;
    void cancelPtyAcpTurn(connection, taskId).then((result) => {
      if (!result.ok) {
        setSendError(result.error);
      }
      setActivity("idle");
    });
  }, [taskId]);

  const handleModelChange = useCallback(
    (modelId: string) => {
      if (!hasSession) return;
      const id = modelId.trim();
      if (!id) return;
      const connection = connectionRef.current;
      if (!connection) return;
      const command = id === "auto" ? "/model auto" : `/model ${id}`;
      void submitPtyAgentPrompt(connection, {
        taskId,
        prompt: command,
        chatId: chatIdRef.current,
        cwd: workingDirectory,
      });
    },
    [hasSession, taskId, workingDirectory],
  );

  const appendMessage = useCallback((role: "user" | "assistant", text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const message = createAgentChatMessage(role, trimmed);
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (
        role === "assistant" &&
        last?.role === "assistant" &&
        last.text === trimmed
      ) {
        return prev;
      }
      if (role === "user" && last?.role === "user" && last.text === trimmed) {
        return prev;
      }
      publishAgentChatTranscriptMessage(
        connectionRef.current,
        chatIdRef.current,
        message,
      );
      return [...prev, message];
    });
  }, []);

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text || working) return;
    const ok = submitChatPrompt(text);
    if (!ok) {
      setSendError(
        sessionReady
          ? "Agent session is not ready yet. Wait a moment and try again."
          : "Start an agent first.",
      );
      return;
    }
    setSendError(null);
    appendMessage("user", text);
    setDraft("");
  }, [appendMessage, draft, sessionReady, submitChatPrompt, working]);

  const connectSession = useCallback(
    async (chatId: string) => {
      if (!workingDirectory) {
        setStatus("error");
        setError(
          "The agent needs a working directory on this project (set it from desktop).",
        );
        return;
      }

      const key = `${taskId}:${chatId.toLowerCase()}`;
      if (connectKeyRef.current === key) {
        return;
      }
      connectKeyRef.current = key;

      setStatus("connecting");
      setError(null);

      const discovered = await fetchAgentPtyConnection(client);
      if (!discovered.ok) {
        connectKeyRef.current = null;
        setStatus("error");
        setError(discovered.error);
        return;
      }
      connectionRef.current = discovered.connection;
      chatIdRef.current = chatId.toLowerCase();

      const acp = await ensurePtyAcpSession(discovered.connection, {
        taskId,
        cwd: workingDirectory,
        chatId,
      });
      if (!acp.ok) {
        connectKeyRef.current = null;
        setStatus("error");
        setError(acp.error);
        return;
      }

      sessionIdRef.current = acp.sessionId;
      await setStoredPtySessionId(taskId, acp.sessionId);
      setStatus("ready");
    },
    [client, taskId, workingDirectory],
  );

  useEffect(() => {
    const chatId = agentChatId?.trim();
    if (!workingDirectory) return;
    if (!chatId) {
      connectKeyRef.current = null;
      setActivity(null);
      setStatus("idle");
      return;
    }
    void connectSession(chatId);
  }, [agentChatId, connectSession, workingDirectory]);

  const startAgentSession = useCallback(async () => {
    if (busy) return;
    if (!workingDirectory) {
      setError(
        "The agent needs a working directory on this project (set it from desktop).",
      );
      setStatus("error");
      return;
    }

    setBusy("create");
    setError(null);
    try {
      const discovered = await fetchAgentPtyConnection(client);
      if (!discovered.ok) {
        throw new Error(discovered.error);
      }
      connectionRef.current = discovered.connection;

      const acp = await ensurePtyAcpSession(discovered.connection, {
        taskId,
        cwd: workingDirectory,
      });
      if (!acp.ok) {
        throw new Error(acp.error);
      }

      const prompt = buildReadyToStartAgentPrompt({
        id: taskId,
        number: taskNumber,
        title: taskTitle,
        description: taskDescription,
        projectKey,
        displayId: taskDisplayId,
        workingDirectory,
      });

      sessionIsNewRef.current = true;
      bootstrapPromptRef.current = prompt;
      sessionIdRef.current = acp.sessionId;
      await setStoredPtySessionId(taskId, acp.sessionId);
      connectKeyRef.current = null;
      setActivity("working");
      await onAgentChatIdChange(acp.chatId);

      void submitPtyAgentPrompt(discovered.connection, {
        taskId,
        prompt,
        chatId: acp.chatId,
        cwd: workingDirectory,
      }).then((result) => {
        if (!result.ok) {
          setError(result.error);
          setActivity("idle");
        }
      });
    } catch (err) {
      sessionIsNewRef.current = false;
      bootstrapPromptRef.current = null;
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "Could not create agent session.",
      );
    } finally {
      setBusy(null);
    }
  }, [
    busy,
    client,
    onAgentChatIdChange,
    projectKey,
    taskDescription,
    taskDisplayId,
    taskId,
    taskNumber,
    taskTitle,
    workingDirectory,
  ]);

  const endAgentSession = useCallback(async () => {
    if (busy) return;
    const chatId = agentChatId?.trim();
    if (!chatId) return;

    setBusy("end");
    setError(null);
    try {
      let connection = connectionRef.current;
      if (!connection) {
        const discovered = await fetchAgentPtyConnection(client);
        if (discovered.ok) connection = discovered.connection;
      }

      if (connection) {
        void cancelPtyAcpTurn(connection, taskId);
      }

      let sessionId = sessionIdRef.current;
      if (!sessionId && connection) {
        sessionId = await findPtySessionForTask(connection, taskId);
      }

      if (connection && sessionId) {
        const killed = await killPtySession(connection, sessionId);
        if (!killed.ok) {
          setError(killed.error);
        }
      }

      sessionIdRef.current = null;
      sessionIsNewRef.current = false;
      bootstrapPromptRef.current = null;
      await setStoredPtySessionId(taskId, null);
      connectKeyRef.current = null;
      setActivity(null);
      setMessages([]);
      setDraft("");
      setStatus("idle");
      await onAgentChatIdChange(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not stop agent session.",
      );
    } finally {
      setBusy(null);
    }
  }, [agentChatId, busy, client, onAgentChatIdChange, taskId]);

  const onAgentButtonClick = useCallback(() => {
    if (busy) return;
    if (agentButtonMode === "create") {
      void startAgentSession();
      return;
    }
    void endAgentSession();
  }, [agentButtonMode, busy, endAgentSession, startAgentSession]);

  if (!workingDirectory) {
    return (
      <View style={styles.gate}>
        <Text style={styles.gateTitle}>Working directory required</Text>
        <Text style={styles.gateBody}>
          Set a local working directory for this project on desktop, then reopen
          the task. The agent runs on your laptop over Tailscale.
        </Text>
      </View>
    );
  }

  const showStartGate = !hasSession;
  const showConnecting = hasSession && status === "connecting";

  return (
    <View style={styles.root}>
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          {status === "error" && hasSession ? (
            <Pressable
              onPress={() => {
                setError(null);
                connectKeyRef.current = null;
                const chatId = agentChatId?.trim();
                if (chatId) void connectSession(chatId);
              }}
              style={({ pressed }) => [
                styles.retry,
                pressed ? { opacity: 0.85 } : null,
              ]}
            >
              <Text style={styles.retryLabel}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {showStartGate ? (
        <View style={styles.gate}>
          <Text style={styles.gateTitle}>No agent on this task</Text>
          <Text style={styles.gateBody}>
            Start an agent to open a Cursor session on your laptop. Stop clears
            the binding and ends the ACP session — same as desktop.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              busy === "create" ? "Creating agent" : "Start Agent"
            }
            disabled={Boolean(busy)}
            onPress={onAgentButtonClick}
            style={({ pressed }) => [
              styles.startBtn,
              busy ? styles.agentBtnBusy : null,
              pressed && !busy ? { opacity: 0.85 } : null,
            ]}
          >
            <Text style={styles.startBtnLabel}>
              {busy === "create" ? "Creating…" : "Start agent"}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Agent chat</Text>
            <View style={styles.headerActions}>
              {working ? (
                <Text style={styles.workingLabel}>Working…</Text>
              ) : activity === "idle" ? (
                <Text style={styles.idleLabel}>Idle</Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  busy === "end" ? "Stopping agent" : "Stop agent"
                }
                disabled={Boolean(busy)}
                onPress={onAgentButtonClick}
                style={({ pressed }) => [
                  styles.agentBtn,
                  styles.agentBtnActive,
                  busy ? styles.agentBtnBusy : null,
                  pressed && !busy ? { opacity: 0.85 } : null,
                ]}
              >
                <View
                  style={[
                    styles.agentDot,
                    working ? styles.agentDotWorking : null,
                  ]}
                />
                <Text style={styles.agentBtnLabel}>
                  {busy === "end" ? "Stopping…" : "Stop"}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.body}>
            {showConnecting ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.muted} />
                <Text style={styles.loadingText}>
                  Connecting over Tailscale…
                </Text>
              </View>
            ) : (
              <>
                <AgentChatTranscript
                  messages={messages}
                  working={working}
                  emptyHint="Send a message to talk to the agent."
                />
                <View style={styles.footer}>
                  {sendError ? (
                    <Text style={styles.sendError} accessibilityRole="alert">
                      {sendError}
                    </Text>
                  ) : null}
                  <AgentChatComposer
                    value={draft}
                    onChange={(next) => {
                      setDraft(next);
                      if (sendError) setSendError(null);
                    }}
                    onSend={handleSend}
                    onCancel={interruptChat}
                    onModelChange={handleModelChange}
                    running={working}
                    disabled={!sessionReady && !working}
                    placeholder={
                      sessionReady
                        ? "Message the agent…"
                        : "Connecting to agent…"
                    }
                  />
                </View>
              </>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#0f1115",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
    zIndex: 2,
  },
  headerTitle: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.02,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  workingLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
  },
  idleLabel: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.04,
  },
  body: {
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
  },
  footer: {
    flexShrink: 0,
  },
  sendError: {
    paddingHorizontal: 12,
    paddingTop: 6,
    color: "#ff7b72",
    fontSize: 12,
  },
  agentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "rgba(15,17,21,0.82)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
  },
  agentBtnActive: {
    backgroundColor: "rgba(248, 81, 73, 0.28)",
    borderColor: "rgba(248, 81, 73, 0.5)",
  },
  agentBtnBusy: {
    opacity: 0.65,
  },
  agentBtnLabel: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 13,
    fontWeight: "600",
  },
  agentDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#3fb950",
  },
  agentDotWorking: {
    backgroundColor: "#d29922",
  },
  startBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.buttonBg,
  },
  startBtnLabel: {
    color: colors.buttonText,
    fontSize: 14,
    fontWeight: "600",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 13,
  },
  gate: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#0f1115",
  },
  gateTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
  },
  gateBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  errorBanner: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(248, 81, 73, 0.35)",
    backgroundColor: "rgba(248, 81, 73, 0.08)",
    zIndex: 3,
  },
  errorText: {
    color: "#ff7b72",
    fontSize: 13,
    lineHeight: 18,
  },
  retry: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.buttonBg,
  },
  retryLabel: {
    color: colors.buttonText,
    fontSize: 13,
    fontWeight: "600",
  },
});
