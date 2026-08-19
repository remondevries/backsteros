import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
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
  mergeTranscriptMessages,
  publishAgentChatTranscriptMessage,
  saveAgentChatTranscript,
  syncAgentChatTranscript,
  type AgentChatMessage,
} from "../../lib/agent/agent-chat-transcript";
import {
  latestAgentChatChangedFiles,
  latestAgentChatPlan,
} from "../../lib/agent/agent-chat-changed-files";
import {
  hydrateAgentChatAccessMode,
  writeAgentChatAccessMode,
  type AgentChatAccessMode,
} from "../../lib/agent/agent-chat-access-mode";
import {
  agentChatModeToCursorModeId,
  hydrateAgentChatMode,
  writeAgentChatMode,
  type AgentChatMode,
} from "../../lib/agent/agent-chat-mode";
import {
  cancelPtyAcpTurn,
  ensurePtyAcpSession,
  fetchAgentPtyConnection,
  findPtySessionForTask,
  killPtySession,
  respondPtyAcpUiRequest,
  setPtyAcpAccessMode,
  setPtyAgentMode,
  setStoredPtySessionId,
  submitPtyAgentPrompt,
} from "../../lib/agent/agent-pty";
import {
  hydrateAgentChatModelId,
} from "../../lib/agent/agent-chat-model";
import {
  useAgentAcpUiRequests,
  type AgentAcpUiRequest,
} from "../../lib/agent/use-agent-acp-ui-requests";
import { isPadDevice } from "../../lib/device";
import { colors } from "../../lib/theme";
import { useMobileApiClient } from "../../lib/use-mobile-api-client";
import { AgentChatComposer } from "./agent-chat-composer";
import { AgentChatTranscript } from "./agent-chat-transcript";
import type { AgentChatChangedFile } from "../../lib/agent/agent-chat-changed-files";

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
  /**
   * Host registers end-session here so closing the Chat tab ends the ACP
   * session (desktop parity — no in-pane Stop button).
   */
  endSessionRef?: MutableRefObject<(() => Promise<void>) | null>;
  /** Notify host when changed files / plan payloads update. */
  onAgentSurfaceDataChange?: (data: {
    changedFiles: AgentChatChangedFile[];
    proposedPlanMarkdown: string | null;
    planSteps: NonNullable<AgentChatMessage["planSteps"]>;
  }) => void;
  /** Open the Diff surface tab (from changed-files row). */
  onOpenDiff?: () => void;
};

type PaneStatus = "idle" | "connecting" | "ready" | "error";

/**
 * Mobile agent chat pane: Chat-only via Cursor ACP on the laptop sidecar.
 * Start by sending a message; closing the Chat tab ends the session (no Stop
 * header — desktop parity).
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
  endSessionRef,
  onAgentSurfaceDataChange,
  onOpenDiff,
}: Props) {
  const client = useMobileApiClient();
  const [status, setStatus] = useState<PaneStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<"working" | "idle" | null>(null);
  const [busy, setBusy] = useState<"create" | "end" | null>(null);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [agentMode, setAgentMode] = useState<AgentChatMode>("build");
  const [accessMode, setAccessMode] =
    useState<AgentChatAccessMode>("supervised");
  const [uiRequest, setUiRequest] = useState<AgentAcpUiRequest | null>(null);
  const [connection, setConnection] = useState<AgentPtyConnection | null>(null);

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
  const working = activity === "working";
  const sessionReady = hasSession && status === "ready";
  const chatCanvasBg = isPadDevice() ? "transparent" : colors.background;

  useEffect(() => {
    void hydrateAgentChatModelId();
    void hydrateAgentChatMode().then(setAgentMode);
  }, []);

  useEffect(() => {
    void hydrateAgentChatAccessMode(taskId).then(setAccessMode);
  }, [taskId]);

  useEffect(() => {
    if (!onAgentSurfaceDataChange) return;
    const changedFiles = latestAgentChatChangedFiles(messages);
    const plan = latestAgentChatPlan(messages);
    onAgentSurfaceDataChange({
      changedFiles,
      proposedPlanMarkdown: plan.proposedPlanMarkdown,
      planSteps: plan.planSteps,
    });
  }, [messages, onAgentSurfaceDataChange]);

  useEffect(() => {
    if (!sessionReady) return;
    const connection = connectionRef.current;
    if (!connection) return;
    void setPtyAcpAccessMode(connection, {
      taskId,
      mode: accessMode,
      cwd: workingDirectory,
    });
  }, [accessMode, sessionReady, taskId, workingDirectory]);

  useAgentAcpUiRequests({
    connection,
    taskId,
    chatId: agentChatId,
    cwd: workingDirectory,
    enabled: sessionReady,
    onUiRequest: setUiRequest,
    onUiRequestCleared: (requestId) => {
      setUiRequest((current) => {
        if (!requestId) return null;
        if (current?.requestId === requestId) return null;
        return current;
      });
    },
  });

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
        if (loaded.length === 0) {
          if (prev.length > 0) {
            void saveAgentChatTranscript(id, prev);
            return prev;
          }
          return [];
        }
        return mergeTranscriptMessages(loaded, prev);
      });
    };

    void loadAgentChatTranscript(id).then((loaded) => {
      if (cancelled) return;
      setMessages((prev) => {
        if (loaded.length === 0) return prev;
        return mergeTranscriptMessages(loaded, prev);
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
              const merged = mergeTranscriptMessages(loaded, prev);
              if (
                merged.length === prev.length &&
                merged[merged.length - 1]?.id === prev[prev.length - 1]?.id
              ) {
                return prev;
              }
              return merged;
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
      setConnection(discovered.connection);
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

  const startAgentSession = useCallback(
    async (options?: { prompt?: string }) => {
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
        setConnection(discovered.connection);

        const acp = await ensurePtyAcpSession(discovered.connection, {
          taskId,
          cwd: workingDirectory,
        });
        if (!acp.ok) {
          throw new Error(acp.error);
        }

        const customPrompt = options?.prompt?.trim();
        const prompt =
          customPrompt ||
          buildReadyToStartAgentPrompt({
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
    },
    [
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
    ],
  );

  const handleAgentModeChange = useCallback(
    (mode: AgentChatMode) => {
      setAgentMode(mode);
      void writeAgentChatMode(mode);
      if (!hasSession) return;
      const connection = connectionRef.current;
      if (!connection) return;
      void setPtyAgentMode(connection, {
        taskId,
        mode: agentChatModeToCursorModeId(mode),
        chatId: chatIdRef.current,
        cwd: workingDirectory,
      });
    },
    [hasSession, taskId, workingDirectory],
  );

  const handleAccessModeChange = useCallback(
    (mode: AgentChatAccessMode) => {
      setAccessMode(mode);
      void writeAgentChatAccessMode(taskId, mode);
    },
    [taskId],
  );

  const handleRespondUiRequest = useCallback(
    async (optionId: string, preference?: "once" | "always" | "reject") => {
      const request = uiRequest;
      const connection = connectionRef.current;
      if (!request || !connection) return;
      const result = await respondPtyAcpUiRequest(connection, {
        requestId: request.requestId,
        optionId,
        preference: preference ?? null,
      });
      if (!result.ok) {
        setSendError(result.error);
        return;
      }
      setUiRequest(null);
    },
    [uiRequest],
  );

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text || working || busy) return;

    const lower = text.toLowerCase();
    if (lower === "/clear") {
      setDraft("");
      setSendError(null);
      setMessages([]);
      const chatId = chatIdRef.current;
      if (chatId) void saveAgentChatTranscript(chatId, []);
      // Closing + restarting Chat is the durable clear; locally wipe for UX.
      return;
    }
    if (lower === "/ask" || lower === "/plan" || lower === "/build") {
      const nextMode: AgentChatMode =
        lower === "/ask" ? "ask" : lower === "/plan" ? "plan" : "build";
      setDraft("");
      handleAgentModeChange(nextMode);
      return;
    }

    if (!hasSession) {
      setSendError(null);
      setDraft("");
      appendMessage("user", text);
      void startAgentSession({ prompt: text });
      return;
    }
    const ok = submitChatPrompt(text);
    if (!ok) {
      setSendError(
        sessionReady
          ? "Agent session is not ready yet. Wait a moment and try again."
          : "Agent session is not ready yet.",
      );
      return;
    }
    setSendError(null);
    appendMessage("user", text);
    setDraft("");
  }, [
    appendMessage,
    busy,
    draft,
    handleAgentModeChange,
    hasSession,
    sessionReady,
    startAgentSession,
    submitChatPrompt,
    working,
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

  useEffect(() => {
    if (!endSessionRef) return;
    endSessionRef.current = () => endAgentSession();
    return () => {
      endSessionRef.current = null;
    };
  }, [endAgentSession, endSessionRef]);

  if (!workingDirectory) {
    return (
      <View style={[styles.gate, { backgroundColor: chatCanvasBg }]}>
        <Text style={styles.gateTitle}>Working directory required</Text>
        <Text style={styles.gateBody}>
          Set a local working directory for this project on desktop, then reopen
          the task. The agent runs on your laptop over Tailscale.
        </Text>
      </View>
    );
  }

  const showConnecting = hasSession && status === "connecting";

  return (
    <View style={[styles.root, { backgroundColor: chatCanvasBg }]}>
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

      <View style={styles.body}>
        {showConnecting ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.muted} />
            <Text style={styles.loadingText}>Connecting over Tailscale…</Text>
          </View>
        ) : (
          <>
            <AgentChatTranscript
              messages={messages}
              working={working || busy === "create"}
              onOpenDiff={onOpenDiff}
              emptyHint={
                hasSession
                  ? "Send a message to talk to the agent."
                  : "Send a message to start the agent."
              }
            />
            {uiRequest ? (
              <View style={styles.uiRequest}>
                <Text style={styles.uiRequestTitle}>{uiRequest.title}</Text>
                {uiRequest.detail ? (
                  <Text style={styles.uiRequestDetail}>{uiRequest.detail}</Text>
                ) : null}
                <View style={styles.uiRequestActions}>
                  {uiRequest.options.map((option) => (
                    <Pressable
                      key={option.id}
                      accessibilityRole="button"
                      onPress={() => {
                        void handleRespondUiRequest(option.id);
                      }}
                      style={({ pressed }) => [
                        styles.uiRequestBtn,
                        pressed ? { opacity: 0.85 } : null,
                      ]}
                    >
                      <Text style={styles.uiRequestBtnLabel}>
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                  {uiRequest.options.length === 0 ? (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          void handleRespondUiRequest("allow", "once");
                        }}
                        style={styles.uiRequestBtn}
                      >
                        <Text style={styles.uiRequestBtnLabel}>Allow</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          void handleRespondUiRequest("reject", "reject");
                        }}
                        style={[styles.uiRequestBtn, styles.uiRequestBtnReject]}
                      >
                        <Text style={styles.uiRequestBtnLabel}>Reject</Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
              </View>
            ) : null}
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
                agentMode={agentMode}
                onAgentModeChange={handleAgentModeChange}
                accessMode={accessMode}
                onAccessModeChange={handleAccessModeChange}
                running={working || busy === "create"}
                disabled={
                  Boolean(busy) || (hasSession && !sessionReady && !working)
                }
                placeholder={
                  !hasSession
                    ? "Message to start the agent…"
                    : sessionReady
                      ? "Message the agent…"
                      : "Connecting to agent…"
                }
              />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
  },
  footer: {
    flexShrink: 0,
    // iPad: CodebaseTaskLayout already clears the floating tab pill with
    // PAD_CONTENT_INSET above it — don't double-stack FLOATING_TAB_BAR_CLEARANCE.
    paddingBottom: 0,
  },
  uiRequest: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 12,
    gap: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  uiRequestTitle: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
  },
  uiRequestDetail: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  uiRequestActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  uiRequestBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.buttonBg,
  },
  uiRequestBtnReject: {
    backgroundColor: "rgba(220, 38, 38, 0.85)",
  },
  uiRequestBtnLabel: {
    color: colors.buttonText,
    fontSize: 13,
    fontWeight: "600",
  },
  sendError: {
    paddingHorizontal: 12,
    paddingTop: 6,
    color: "#ff7b72",
    fontSize: 12,
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
