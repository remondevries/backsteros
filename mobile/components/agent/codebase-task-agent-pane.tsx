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
  hydrateAgentChatViewMode,
  loadAgentChatTranscript,
  publishAgentChatTranscriptMessage,
  readAgentChatViewModeCached,
  saveAgentChatTranscript,
  syncAgentChatTranscript,
  writeAgentChatViewMode,
  type AgentChatMessage,
  type AgentChatViewMode,
} from "../../lib/agent/agent-chat-transcript";
import {
  buildPtyWebSocketUrl,
  ensurePtyAcpSession,
  ensurePtyAgent,
  fetchAgentPtyConnection,
  findPtySessionForTask,
  killPtySession,
  cancelPtyAcpTurn,
  sendPtyAgentKeys,
  setStoredPtySessionId,
  submitPtyAgentPrompt,
} from "../../lib/agent/agent-pty";
import {
  readAgentChatModelIdCached,
  hydrateAgentChatModelId,
} from "../../lib/agent/agent-chat-model";
import {
  cursorAgentResumeCommand,
  resolveAgentTerminalAction,
} from "../../lib/agent/cursor-agent-cli";
import { colors } from "../../lib/theme";
import { useMobileApiClient } from "../../lib/use-mobile-api-client";
import { AgentChatComposer } from "./agent-chat-composer";
import { AgentChatTranscript } from "./agent-chat-transcript";
import { AgentTerminalWebView } from "./agent-terminal-webview";

type Props = {
  taskId: string;
  taskNumber?: number | null;
  taskTitle: string;
  taskDescription?: string | null;
  taskDisplayId?: string | null;
  projectId: string;
  projectKey?: string | null;
  projectLabel: string;
  cwd: string | null;
  agentChatId: string | null;
  onAgentChatIdChange: (chatId: string | null) => void | Promise<void>;
};

type PaneStatus = "idle" | "connecting" | "ready" | "error";

const QUIT_THEN_RESUME_DELAY_MS = 600;

/**
 * iPad codebase right pane: Start / Stop agent (same lifecycle as desktop),
 * Chat / Terminal tabs (terminal default), interactive TUI over Tailscale.
 */
export function CodebaseTaskAgentPane({
  taskId,
  taskNumber = null,
  taskTitle,
  taskDescription = null,
  taskDisplayId = null,
  projectId,
  projectKey = null,
  projectLabel,
  cwd,
  agentChatId,
  onAgentChatIdChange,
}: Props) {
  const client = useMobileApiClient();
  const [status, setStatus] = useState<PaneStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [connectEpoch, setConnectEpoch] = useState(0);
  const [writeCommand, setWriteCommand] = useState<string | null>(null);
  const [writeEpoch, setWriteEpoch] = useState(0);
  const [activity, setActivity] = useState<"working" | "idle" | null>(null);
  const [busy, setBusy] = useState<"create" | "end" | null>(null);
  const [viewMode, setViewMode] = useState<AgentChatViewMode>(() =>
    readAgentChatViewModeCached(),
  );
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [ptyReady, setPtyReady] = useState(false);

  const chatIdRef = useRef<string | null>(
    agentChatId?.trim().toLowerCase() || null,
  );
  const sessionIdRef = useRef<string | null>(null);
  const connectionRef = useRef<AgentPtyConnection | null>(null);
  const sessionIsNewRef = useRef(false);
  const bootstrapPromptRef = useRef<string | null>(null);
  const connectKeyRef = useRef<string | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const bootstrapPromptKeyRef = useRef<string | null>(null);
  const previousTaskIdRef = useRef(taskId);

  const workingDirectory = cwd?.trim() || null;
  const hasSession = Boolean(agentChatId?.trim());
  const agentButtonMode: "create" | "end" = !hasSession ? "create" : "end";
  const working = activity === "working";

  useEffect(() => {
    void hydrateAgentChatViewMode().then(setViewMode);
    void hydrateAgentChatModelId();
  }, []);

  useEffect(() => {
    chatIdRef.current = agentChatId?.trim().toLowerCase() || null;
  }, [agentChatId]);

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      for (const timer of promptTimersRef.current) clearTimeout(timer);
      promptTimersRef.current = [];
    };
  }, []);

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

    // Local cache first, then shared sidecar (needs Tailscale PTY connection).
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
  }, [agentChatId, connectUrl]);

  const queueCommand = useCallback((command: string) => {
    setWriteCommand(command);
    setWriteEpoch((n) => n + 1);
  }, []);

  const clearPromptTimers = useCallback(() => {
    for (const timer of promptTimersRef.current) clearTimeout(timer);
    promptTimersRef.current = [];
  }, []);

  const submitChatPrompt = useCallback(
    (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed || !hasSession) return false;
      const connection = connectionRef.current;
      if (!connection) return false;
      clearPromptTimers();
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
    [clearPromptTimers, hasSession, taskId, workingDirectory],
  );

  const interruptChat = useCallback(() => {
    const connection = connectionRef.current;
    if (!connection) {
      queueCommand("\x1b");
      return;
    }
    void cancelPtyAcpTurn(connection, taskId).then((result) => {
      if (!result.ok) {
        void sendPtyAgentKeys(connection, { taskId, keys: ["esc"] }).then(
          (keys) => {
            if (!keys.ok) queueCommand("\x1b");
          },
        );
      }
    });
  }, [queueCommand, taskId]);

  const handleModelChange = useCallback(
    (modelId: string) => {
      if (!hasSession) return;
      const id = modelId.trim();
      if (!id) return;
      const connection = connectionRef.current;
      if (!connection) return;
      const command = id === "auto" ? "/model auto" : `/model ${id}`;
      clearPromptTimers();
      void submitPtyAgentPrompt(connection, {
        taskId,
        prompt: command,
        chatId: chatIdRef.current,
        cwd: workingDirectory,
      });
    },
    [clearPromptTimers, hasSession, taskId, workingDirectory],
  );

  const selectView = useCallback((mode: AgentChatViewMode) => {
    setViewMode(mode);
    void writeAgentChatViewMode(mode);
  }, []);

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
        hasSession
          ? "Agent session is not ready yet. Wait a moment and try again."
          : "Start an agent first.",
      );
      return;
    }
    setSendError(null);
    appendMessage("user", text);
    setDraft("");
  }, [appendMessage, draft, hasSession, submitChatPrompt, working]);

  const connectSession = useCallback(
    async (chatId: string) => {
      if (!workingDirectory) {
        setStatus("error");
        setError(
          "The agent terminal needs a working directory on this project (set it from desktop).",
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
      setWriteCommand(null);
      setPtyReady(false);

      const discovered = await fetchAgentPtyConnection(client);
      if (!discovered.ok) {
        connectKeyRef.current = null;
        setStatus("error");
        setError(discovered.error);
        setConnectUrl(null);
        return;
      }
      connectionRef.current = discovered.connection;
      chatIdRef.current = chatId.toLowerCase();

      void ensurePtyAcpSession(discovered.connection, {
        taskId,
        cwd: workingDirectory,
        chatId,
      });

      const prompt = bootstrapPromptRef.current;
      const ensured = await ensurePtyAgent(discovered.connection, {
        taskId,
        chatId,
        cwd: workingDirectory,
        prompt: null,
        model: sessionIsNewRef.current ? readAgentChatModelIdCached() : null,
        label: projectLabel || projectId,
        tabLabel: taskDisplayId || null,
      });
      if (!ensured.ok) {
        connectKeyRef.current = null;
        setStatus("error");
        setError(ensured.error);
        setConnectUrl(null);
        return;
      }

      const sessionId = ensured.sessionId;
      sessionIdRef.current = sessionId;
      await setStoredPtySessionId(taskId, sessionId);

      const url = buildPtyWebSocketUrl(discovered.connection, {
        cols: 100,
        rows: 32,
        cwd: workingDirectory,
        sessionId,
        kind: "agent",
        taskId,
        label: projectLabel || projectId,
        tabLabel: taskDisplayId || null,
        chatId,
      });

      setConnectUrl(url);
      setConnectEpoch((n) => n + 1);
      setStatus("ready");
    },
    [client, projectId, projectLabel, taskDisplayId, taskId, workingDirectory],
  );

  useEffect(() => {
    const chatId = agentChatId?.trim();
    if (!workingDirectory) return;
    if (!chatId) {
      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
      connectKeyRef.current = null;
      setConnectUrl(null);
      setWriteCommand(null);
      setActivity(null);
      setPtyReady(false);
      setStatus("idle");
      return;
    }
    void connectSession(chatId);
  }, [agentChatId, connectSession, workingDirectory]);

  const onPtyReady = useCallback(
    (info: {
      sessionId: string | null;
      reattached: boolean;
      agentSessionEnded: boolean;
      herdrManaged: boolean;
      lastActivity: "working" | "idle" | null;
    }) => {
      setPtyReady(true);
      if (info.sessionId) {
        sessionIdRef.current = info.sessionId;
        void setStoredPtySessionId(taskId, info.sessionId);
      }

      const chatId = chatIdRef.current;
      if (!chatId) return;

      if (info.herdrManaged) {
        sessionIsNewRef.current = false;
        bootstrapPromptRef.current = null;
        if (info.lastActivity === "working" || info.lastActivity === "idle") {
          setActivity(info.lastActivity);
        }
        return;
      }

      const agentLive = info.reattached && !info.agentSessionEnded;
      const prompt = bootstrapPromptRef.current;
      const sessionIsNew = sessionIsNewRef.current;
      const action = resolveAgentTerminalAction({
        tuiOpen: agentLive,
        attachedChatId: agentLive ? chatId : null,
        boundChatId: chatId,
        requestedChatId: chatId,
        sessionIsNew,
        prompt,
      });

      sessionIsNewRef.current = false;
      bootstrapPromptRef.current = null;

      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }

      if (action === "abort" || action === "noop") return;

      if (action === "prompt-in-tui" && prompt) {
        const connection = connectionRef.current;
        if (connection) {
          void submitPtyAgentPrompt(connection, { taskId, prompt });
        } else {
          queueCommand(`${prompt}\n`);
        }
        return;
      }

      const resume = cursorAgentResumeCommand(chatId, prompt);
      if (action === "quit-then-shell-resume") {
        queueCommand("/quit\n");
        resumeTimerRef.current = setTimeout(() => {
          resumeTimerRef.current = null;
          queueCommand(resume);
        }, QUIT_THEN_RESUME_DELAY_MS);
        return;
      }

      queueCommand(resume);
    },
    [queueCommand, taskId],
  );

  const startAgentSession = useCallback(async () => {
    if (busy) return;
    if (!workingDirectory) {
      setError(
        "The agent terminal needs a working directory on this project (set it from desktop).",
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

      const ensured = await ensurePtyAgent(discovered.connection, {
        taskId,
        chatId: acp.chatId,
        cwd: workingDirectory,
        prompt: null,
        model: readAgentChatModelIdCached(),
        label: projectLabel || projectId,
        tabLabel: taskDisplayId || null,
      });
      if (!ensured.ok) {
        throw new Error(ensured.error);
      }

      sessionIsNewRef.current = true;
      bootstrapPromptRef.current = prompt;
      sessionIdRef.current = ensured.sessionId;
      await setStoredPtySessionId(taskId, ensured.sessionId);
      connectKeyRef.current = null;
      await onAgentChatIdChange(acp.chatId);

      void submitPtyAgentPrompt(discovered.connection, {
        taskId,
        prompt,
        chatId: acp.chatId,
        cwd: workingDirectory,
      }).then((result) => {
        if (!result.ok) {
          setError(result.error);
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
    projectId,
    projectKey,
    projectLabel,
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

      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
      clearPromptTimers();
      sessionIdRef.current = null;
      sessionIsNewRef.current = false;
      bootstrapPromptRef.current = null;
      await setStoredPtySessionId(taskId, null);
      connectKeyRef.current = null;
      setConnectUrl(null);
      setWriteCommand(null);
      setActivity(null);
      setPtyReady(false);
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
  }, [
    agentChatId,
    busy,
    clearPromptTimers,
    client,
    onAgentChatIdChange,
    taskId,
  ]);

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

  const showStartGate = !hasSession && !connectUrl;
  const showConnecting = status === "connecting" && !connectUrl;

  return (
    <View style={styles.root}>
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          {status === "error" && hasSession ? (
            <Pressable
              onPress={() => {
                setError(null);
                setStatus("connecting");
                connectKeyRef.current = null;
                setConnectUrl(null);
                setPtyReady(false);
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
            the binding and kills the local PTY — same as desktop.
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
            <View
              style={styles.tabs}
              accessibilityRole="tablist"
              accessibilityLabel="Agent view"
            >
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: viewMode === "chat" }}
                onPress={() => selectView("chat")}
                style={[
                  styles.tab,
                  viewMode === "chat" ? styles.tabActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    viewMode === "chat" ? styles.tabLabelActive : null,
                  ]}
                >
                  Chat
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: viewMode === "terminal" }}
                onPress={() => selectView("terminal")}
                style={[
                  styles.tab,
                  viewMode === "terminal" ? styles.tabActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    viewMode === "terminal" ? styles.tabLabelActive : null,
                  ]}
                >
                  Terminal
                </Text>
              </Pressable>
            </View>

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
                <View
                  style={[
                    styles.pane,
                    viewMode === "chat"
                      ? styles.paneActive
                      : styles.paneInactive,
                  ]}
                  pointerEvents={viewMode === "chat" ? "auto" : "none"}
                  accessibilityElementsHidden={viewMode !== "chat"}
                  importantForAccessibility={
                    viewMode === "chat" ? "auto" : "no-hide-descendants"
                  }
                >
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
                      disabled={!hasSession && !working}
                      placeholder={
                        hasSession
                          ? "Message the agent…"
                          : "Start an agent to chat…"
                      }
                    />
                  </View>
                </View>

                <View
                  style={[
                    styles.pane,
                    viewMode === "terminal"
                      ? styles.paneActive
                      : styles.paneInactive,
                  ]}
                  pointerEvents={viewMode === "terminal" ? "auto" : "none"}
                  accessibilityElementsHidden={viewMode !== "terminal"}
                  importantForAccessibility={
                    viewMode === "terminal" ? "auto" : "no-hide-descendants"
                  }
                >
                  <AgentTerminalWebView
                    connectUrl={connectUrl}
                    connectEpoch={connectEpoch}
                    writeCommand={writeCommand}
                    writeEpoch={writeEpoch}
                    onPtyReady={onPtyReady}
                    onAssistantMessage={(text) =>
                      appendMessage("assistant", text)
                    }
                    onError={(message) => {
                      setError(message);
                      setStatus("error");
                      setPtyReady(false);
                    }}
                    onActivity={(next) => {
                      if (next === "working" || next === "idle") {
                        setActivity(next);
                      }
                    }}
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
  tabs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    padding: 2,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  tab: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  tabLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.02,
  },
  tabLabelActive: {
    color: "rgba(255,255,255,0.92)",
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
    position: "relative",
  },
  pane: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "column",
  },
  paneActive: {
    opacity: 1,
    zIndex: 2,
  },
  paneInactive: {
    opacity: 0,
    zIndex: 1,
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
