/**
 * Disposable ACP chat event subscriber (T3-style).
 *
 * Opens a task-scoped WebSocket that receives `acp-event` frames from the
 * sidecar chat bus. Closing the socket does not stop the ACP session —
 * server-side projection keeps writing the transcript.
 */
import { useEffect, useRef } from "react";

import {
  clearLiveAgentWorkingForTask,
  markLiveAgentWorkingForTask,
} from "./clear-live-agent-working";
import type {
  AgentAttachRequest,
  AgentEndRequest,
} from "./cursor-agent-cli";
import {
  emptyAgentActivitySummary,
  type AgentActivitySummary,
  type StatusBarAgentItem,
} from "./agent-activity";
import {
  shouldFinalizeChatTurn,
  type AcpSettleSource,
} from "./agent-acp-settle";
import { getPtyWebSocketUrl, stopPtyAgentTask } from "../pty";

export type AgentAcpUiRequest = {
  kind: "permission" | "ask_question";
  requestId: string;
  title: string;
  detail: string | null;
  options: { id: string; label: string }[];
  questions?: {
    id: string;
    prompt: string;
    options: { id: string; label: string }[];
    multiSelect?: boolean;
  }[];
};

export type UseAgentAcpEventsOptions = {
  taskId: string | null;
  projectId?: string | null;
  projectLabel?: string;
  chatId?: string | null;
  cwd?: string | null;
  enabled?: boolean;
  agentAttachRequest?: AgentAttachRequest | null;
  onAgentAttachRequestHandled?: () => void;
  agentEndRequest?: AgentEndRequest | null;
  onAgentEndRequestHandled?: () => void;
  onAssistantMessage?: (taskId: string, text: string) => void;
  onAcpSessionUpdate?: (taskId: string, update: unknown) => void;
  onCursorUpdateTodos?: (taskId: string, params: unknown) => void;
  onCursorCreatePlan?: (taskId: string, params: unknown) => void;
  onAcpTurnSettled?: (taskId: string) => void;
  /** Sidecar projector minted the durable assistant message id for this turn. */
  onAcpTurnBegin?: (
    taskId: string,
    messageId: string,
    meta?: { turnId?: string | null; startedAt?: number | null },
  ) => void;
  onAcpTurnState?: (
    taskId: string,
    state: {
      turnId?: string | null;
      messageId?: string | null;
      status: "completed" | "interrupted" | "failed";
      completedAt?: number | null;
    },
  ) => void;
  onAcpUiRequest?: (taskId: string, request: AgentAcpUiRequest) => void;
  onAcpUiRequestCleared?: (taskId: string, requestId: string | null) => void;
  onAgentHookTurnUpdate?: (
    taskId: string,
    message: {
      event?: string;
      activity?: string | null;
      text?: string | null;
      toolName?: string | null;
      toolUseId?: string | null;
      toolInput?: unknown;
      toolOutput?: string | null;
      errorMessage?: string | null;
      durationMs?: number | null;
    },
  ) => void;
  onAgentActivitySummaryChange?: (summary: AgentActivitySummary) => void;
  onWorkingTaskIdsChange?: (taskIds: string[]) => void;
  onAgentStatusItemsChange?: (items: StatusBarAgentItem[]) => void;
  onAgentOpenTaskIdsChange?: (taskIds: string[]) => void;
};

/**
 * Subscribe to ACP chat events for the selected task and report working
 * sessions from the sidecar (all busy ACP sessions, not only the focused one).
 */
export function useAgentAcpEvents(options: UseAgentAcpEventsOptions): void {
  const {
    taskId,
    projectId = null,
    projectLabel = "Task",
    chatId = null,
    cwd = null,
    enabled = true,
    agentAttachRequest = null,
    onAgentAttachRequestHandled,
    agentEndRequest = null,
    onAgentEndRequestHandled,
    onAssistantMessage,
    onAcpSessionUpdate,
    onCursorUpdateTodos,
    onCursorCreatePlan,
    onAcpTurnSettled,
    onAcpTurnBegin,
    onAcpTurnState,
    onAcpUiRequest,
    onAcpUiRequestCleared,
    onAgentHookTurnUpdate,
    onAgentActivitySummaryChange,
    onWorkingTaskIdsChange,
    onAgentStatusItemsChange,
    onAgentOpenTaskIdsChange,
  } = options;

  const callbacksRef = useRef({
    onAssistantMessage,
    onAcpSessionUpdate,
    onCursorUpdateTodos,
    onCursorCreatePlan,
    onAcpTurnSettled,
    onAcpTurnBegin,
    onAcpTurnState,
    onAcpUiRequest,
    onAcpUiRequestCleared,
    onAgentHookTurnUpdate,
    onAgentActivitySummaryChange,
    onWorkingTaskIdsChange,
    onAgentStatusItemsChange,
    onAgentOpenTaskIdsChange,
    onAgentAttachRequestHandled,
    onAgentEndRequestHandled,
  });
  callbacksRef.current = {
    onAssistantMessage,
    onAcpSessionUpdate,
    onCursorUpdateTodos,
    onCursorCreatePlan,
    onAcpTurnSettled,
    onAcpTurnBegin,
    onAcpTurnState,
    onAcpUiRequest,
    onAcpUiRequestCleared,
    onAgentHookTurnUpdate,
    onAgentActivitySummaryChange,
    onWorkingTaskIdsChange,
    onAgentStatusItemsChange,
    onAgentOpenTaskIdsChange,
    onAgentAttachRequestHandled,
    onAgentEndRequestHandled,
  };

  const workingRef = useRef(new Set<string>());
  const openRef = useRef(new Set<string>());
  /** Poll-observed busy tasks — veto idle/stop settle; drive background list marks. */
  const pollBusyRef = useRef(new Set<string>());
  /** Live-socket activity busy — survives poll flicker until prompt-complete/stop. */
  const activityBusyRef = useRef(new Set<string>());

  const republishWorkingMarks = () => {
    workingRef.current = new Set([
      ...pollBusyRef.current,
      ...activityBusyRef.current,
    ]);
    publishStatus();
  };

  const publishStatus = () => {
    const workingTaskIds = [...workingRef.current];
    const openTaskIds = [...openRef.current];
    const statusItems: StatusBarAgentItem[] = workingTaskIds.map((id) => ({
      taskId: id,
      projectId,
      projectLabel: projectLabel || "Task",
      activity: "working" as const,
    }));
    callbacksRef.current.onWorkingTaskIdsChange?.(workingTaskIds);
    callbacksRef.current.onAgentOpenTaskIdsChange?.(openTaskIds);
    callbacksRef.current.onAgentStatusItemsChange?.(statusItems);
    const summary = emptyAgentActivitySummary();
    summary.working = workingTaskIds.length;
    summary.present = openTaskIds.length;
    summary.total = Math.max(workingTaskIds.length, openTaskIds.length);
    callbacksRef.current.onAgentActivitySummaryChange?.(summary);
  };

  // Poll ACP sessions so background turns keep list/board Working… without a
  // viewer. Do NOT finalize Chat from poll idle — that raced mid-turn and
  // froze the transcript on settled chrome (T3: session.status is authority).
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function refreshSessions() {
      try {
        const { listPtySessions } = await import("../pty");
        const result = await listPtySessions({ kind: "agent" });
        if (cancelled || !result.ok) return;
        const nextWorking = new Set<string>();
        for (const session of result.sessions) {
          const sid = session.taskId?.trim();
          if (!sid) continue;
          if (session.lastActivity === "working") nextWorking.add(sid);
        }
        pollBusyRef.current = nextWorking;
        // List/board marks only — never finalize Chat from poll idle.
        republishWorkingMarks();
      } catch {
        /* ignore */
      }
    }

    void refreshSessions();
    const timer = window.setInterval(() => {
      void refreshSessions();
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- publishStatus reads refs
  }, [enabled, projectId, projectLabel]);

  // Attach request: mark open. Only mark working for Start-agent bootstrap
  // (sessionIsNew) — /clear and return-to-task reattach must not flash Working…
  useEffect(() => {
    if (!agentAttachRequest) return;
    const id = agentAttachRequest.taskId.trim();
    if (id) {
      openRef.current.add(id);
      if (agentAttachRequest.sessionIsNew) {
        activityBusyRef.current.add(id);
        markLiveAgentWorkingForTask(id);
        republishWorkingMarks();
      } else {
        publishStatus();
      }
    }
    callbacksRef.current.onAgentAttachRequestHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentAttachRequest]);

  // Stop agent.
  useEffect(() => {
    if (!agentEndRequest) return;
    const id = agentEndRequest.taskId.trim();
    void (async () => {
      clearLiveAgentWorkingForTask(id);
      activityBusyRef.current.delete(id);
      pollBusyRef.current.delete(id);
      workingRef.current.delete(id);
      openRef.current.delete(id);
      republishWorkingMarks();
      await stopPtyAgentTask(id);
    })();
    callbacksRef.current.onAgentEndRequestHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentEndRequest]);

  // chatId is assigned when Start-agent binds the session. Reconnecting the
  // socket on that change flushes a queued settle mid-bootstrap and freezes
  // Chat on settled "Worked…" chrome while the agent keeps going.
  const chatIdRef = useRef(chatId);
  chatIdRef.current = chatId;
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;

  // Live ACP event socket for the focused task.
  useEffect(() => {
    const id = taskId?.trim() || "";
    if (!enabled || !id) return;

    openRef.current.add(id);
    publishStatus();

    const url = getPtyWebSocketUrl({
      cols: 80,
      rows: 24,
      cwd: cwdRef.current?.trim() || null,
      kind: "agent",
      taskId: id,
      chatId: chatIdRef.current?.trim().toLowerCase() || null,
    });

    const socket = new WebSocket(url);
    let settledTimer: number | null = null;

    const settle = (source: AcpSettleSource) => {
      if (
        !shouldFinalizeChatTurn({
          source,
          activityBusy: activityBusyRef.current.has(id),
        })
      ) {
        return;
      }
      if (settledTimer != null) window.clearTimeout(settledTimer);
      // Queue behind any same-tick afterAgentResponse frame so text lands in
      // turnUi before finalize — but do not wait 80ms (that left Working…
      // visible after the agent was already done).
      settledTimer = window.setTimeout(() => {
        settledTimer = null;
        if (
          !shouldFinalizeChatTurn({
            source,
            activityBusy: activityBusyRef.current.has(id),
          })
        ) {
          return;
        }
        activityBusyRef.current.delete(id);
        pollBusyRef.current.delete(id);
        workingRef.current.delete(id);
        clearLiveAgentWorkingForTask(id);
        republishWorkingMarks();
        callbacksRef.current.onAcpTurnSettled?.(id);
      }, 0);
    };

    socket.addEventListener("message", (event) => {
      let message: {
        type?: string;
        event?: string;
        activity?: string | null;
        update?: unknown;
        params?: unknown;
        text?: string | null;
        error?: string;
        turnId?: string | null;
        messageId?: string | null;
        status?: string | null;
        startedAt?: number | null;
        completedAt?: number | null;
        requestId?: string | null;
        auto?: boolean;
        title?: string | null;
        detail?: string | null;
        options?: unknown;
        questions?: unknown;
      };
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }

      if (message.type === "ready") {
        return;
      }

      if (message.type === "exit") {
        activityBusyRef.current.delete(id);
        workingRef.current.delete(id);
        openRef.current.delete(id);
        clearLiveAgentWorkingForTask(id);
        republishWorkingMarks();
        // T3: session end leaves the turn settled — finalize chat chrome too.
        settle("exit");
        return;
      }

      if (message.type === "agent-hook") {
        // Only start/resume Working from turn-start hooks. Late postToolUse /
        // afterFileEdit frames must not revive Working… after settle.
        const startsTurn =
          message.event === "beforeSubmitPrompt" ||
          message.event === "preToolUse" ||
          message.event === "sessionStart";
        if (
          (message.activity === "working" || startsTurn) &&
          (startsTurn ||
            activityBusyRef.current.has(id) ||
            workingRef.current.has(id))
        ) {
          activityBusyRef.current.add(id);
          markLiveAgentWorkingForTask(id);
          republishWorkingMarks();
        }
        if (
          message.event === "afterAgentResponse" &&
          typeof message.text === "string" &&
          message.text.trim()
        ) {
          callbacksRef.current.onAssistantMessage?.(id, message.text.trim());
        }
        callbacksRef.current.onAgentHookTurnUpdate?.(id, message);
        if (message.event === "stop" || message.activity === "idle") {
          // End-of-turn: clear activity busy first so the settle gate allows
          // finalize. Mid-turn false idles are vetoed when activityBusy stays.
          activityBusyRef.current.delete(id);
          settle(message.event === "stop" ? "stop" : "idle");
        }
        return;
      }

      if (message.type !== "acp-event") return;

      if (
        message.event === "turn-begin" &&
        typeof message.messageId === "string" &&
        message.messageId.trim()
      ) {
        callbacksRef.current.onAcpTurnBegin?.(id, message.messageId.trim(), {
          turnId:
            typeof message.turnId === "string" ? message.turnId.trim() : null,
          startedAt:
            typeof message.startedAt === "number" ? message.startedAt : null,
        });
        return;
      }

      if (
        message.event === "turn-state" &&
        (message.status === "completed" ||
          message.status === "interrupted" ||
          message.status === "failed")
      ) {
        activityBusyRef.current.delete(id);
        callbacksRef.current.onAcpTurnState?.(id, {
          turnId:
            typeof message.turnId === "string" ? message.turnId.trim() : null,
          messageId:
            typeof message.messageId === "string"
              ? message.messageId.trim()
              : null,
          status: message.status,
          completedAt:
            typeof message.completedAt === "number"
              ? message.completedAt
              : null,
        });
        settle(
          message.status === "interrupted"
            ? "stop"
            : message.status === "failed"
              ? "prompt-error"
              : "prompt-complete",
        );
        return;
      }

      if (message.event === "session-update" && message.update !== undefined) {
        // T3: working follows session/turn lifecycle, not every content chunk.
        // Marking working on each session/update revived Activities/Working…
        // after settle when late frames arrived (same class of bug as
        // afterAgentResponse flipping activity back to working).
        callbacksRef.current.onAcpSessionUpdate?.(id, message.update);
        return;
      }

      if (message.event === "cursor-update-todos") {
        callbacksRef.current.onCursorUpdateTodos?.(id, message.params);
        return;
      }
      if (message.event === "cursor-create-plan") {
        callbacksRef.current.onCursorCreatePlan?.(id, message.params);
        return;
      }

      if (message.event === "prompt-complete" || message.event === "prompt-error") {
        const reply =
          typeof message.text === "string" && message.text.trim()
            ? message.text.trim()
            : typeof message.error === "string" && message.error.trim()
              ? message.error.trim()
              : null;
        if (reply) {
          callbacksRef.current.onAssistantMessage?.(id, reply);
        }
        activityBusyRef.current.delete(id);
        settle(
          message.event === "prompt-error" ? "prompt-error" : "prompt-complete",
        );
        return;
      }

      if (
        (message.event === "permission" || message.event === "ask-question") &&
        typeof message.requestId === "string" &&
        message.requestId &&
        message.auto !== true
      ) {
        const options = Array.isArray(message.options)
          ? message.options
              .map((opt) => {
                if (!opt || typeof opt !== "object") return null;
                const o = opt as { id?: unknown; label?: unknown };
                const optId = typeof o.id === "string" ? o.id.trim() : "";
                if (!optId) return null;
                return {
                  id: optId,
                  label:
                    typeof o.label === "string" && o.label.trim()
                      ? o.label.trim()
                      : optId,
                };
              })
              .filter((opt): opt is { id: string; label: string } => opt != null)
          : [];
        const questions = Array.isArray(message.questions)
          ? message.questions
              .map((entry, index) => {
                if (!entry || typeof entry !== "object") return null;
                const q = entry as {
                  id?: unknown;
                  prompt?: unknown;
                  question?: unknown;
                  header?: unknown;
                  title?: unknown;
                  multiSelect?: unknown;
                  allowMultiple?: unknown;
                  allow_multiple?: unknown;
                  options?: unknown;
                };
                const qid =
                  typeof q.id === "string" && q.id.trim()
                    ? q.id.trim()
                    : `q-${index}`;
                const prompt =
                  typeof q.prompt === "string"
                    ? q.prompt.trim()
                    : typeof q.question === "string"
                      ? q.question.trim()
                      : "";
                if (!prompt) return null;
                const header =
                  typeof q.header === "string" && q.header.trim()
                    ? q.header.trim()
                    : typeof q.title === "string" && q.title.trim()
                      ? q.title.trim()
                      : undefined;
                const qOptions = Array.isArray(q.options)
                  ? q.options
                      .map((opt) => {
                        if (!opt || typeof opt !== "object") return null;
                        const o = opt as { id?: unknown; label?: unknown };
                        const optionId =
                          typeof o.id === "string" ? o.id.trim() : "";
                        if (!optionId) return null;
                        return {
                          id: optionId,
                          label:
                            typeof o.label === "string" && o.label.trim()
                              ? o.label.trim()
                              : optionId,
                        };
                      })
                      .filter(
                        (opt): opt is { id: string; label: string } =>
                          opt != null,
                      )
                  : [];
                return {
                  id: qid,
                  prompt,
                  ...(header ? { header } : {}),
                  options:
                    qOptions.length > 0
                      ? qOptions
                      : [{ id: "ok", label: "OK" }],
                  multiSelect:
                    q.multiSelect === true ||
                    q.allowMultiple === true ||
                    q.allow_multiple === true,
                };
              })
              .filter(
                (
                  q,
                ): q is {
                  id: string;
                  prompt: string;
                  header?: string;
                  options: { id: string; label: string }[];
                  multiSelect: boolean;
                } => q != null,
              )
          : [];
        callbacksRef.current.onAcpUiRequest?.(id, {
          kind: message.event === "ask-question" ? "ask_question" : "permission",
          requestId: message.requestId,
          title:
            typeof message.title === "string" && message.title.trim()
              ? message.title.trim()
              : message.event === "ask-question"
                ? "Agent question"
                : "Permission required",
          detail: typeof message.detail === "string" ? message.detail : null,
          options,
          questions,
        });
        return;
      }

      if (
        message.event === "permission-timeout" ||
        message.event === "ask-question-timeout" ||
        message.event === "ui-request-cleared"
      ) {
        callbacksRef.current.onAcpUiRequestCleared?.(
          id,
          typeof message.requestId === "string" ? message.requestId : null,
        );
        return;
      }

      if (message.event === "activity") {
        if (message.activity === "working") {
          activityBusyRef.current.add(id);
          markLiveAgentWorkingForTask(id);
          republishWorkingMarks();
        } else if (message.activity === "idle") {
          activityBusyRef.current.delete(id);
          settle("idle");
        }
      }
    });

    return () => {
      // Flush a pending settle before teardown so collapse/remount cannot
      // drop the finalize that was already queued. Do not flush when the
      // agent is still marked working for this task — that happens when the
      // effect re-runs while a Start-agent bootstrap turn is in flight.
      if (settledTimer != null) {
        window.clearTimeout(settledTimer);
        settledTimer = null;
        if (
          shouldFinalizeChatTurn({
            source: "teardown",
            activityBusy: activityBusyRef.current.has(id),
          })
        ) {
          activityBusyRef.current.delete(id);
          clearLiveAgentWorkingForTask(id);
          callbacksRef.current.onAcpTurnSettled?.(id);
        }
      }
      openRef.current.delete(id);
      republishWorkingMarks();
      try {
        // Avoid "closed before connection established" noise when React Strict
        // Mode tears down the effect while the socket is still CONNECTING.
        if (socket.readyState === WebSocket.OPEN) {
          socket.close();
        } else if (socket.readyState === WebSocket.CONNECTING) {
          socket.onopen = () => {
            try {
              socket.close();
            } catch {
              /* ignore */
            }
          };
        }
      } catch {
        /* ignore */
      }
    };
    // Intentionally omit chatId/cwd — task-scoped chat bus; Start assigns
    // agentChatId after attach and must not tear down the live socket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, enabled]);
}