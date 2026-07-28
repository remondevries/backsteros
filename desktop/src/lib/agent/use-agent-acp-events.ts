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

    // Poll ACP sessions so background turns keep list/board Working… without a viewer.
    // Also recover chat settle when the session goes idle but a settle frame was missed.
    useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const previouslyWorking = new Set<string>();

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
        // Tasks that were busy and are now idle → settle (authoritative ACP busy).
        for (const sid of previouslyWorking) {
          if (!nextWorking.has(sid) && workingRef.current.has(sid)) {
            workingRef.current.delete(sid);
            clearLiveAgentWorkingForTask(sid);
            callbacksRef.current.onAcpTurnSettled?.(sid);
          }
        }
        previouslyWorking.clear();
        for (const sid of nextWorking) previouslyWorking.add(sid);
        workingRef.current = nextWorking;
        publishStatus();
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
        workingRef.current.add(id);
        markLiveAgentWorkingForTask(id);
      }
      publishStatus();
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
      workingRef.current.delete(id);
      openRef.current.delete(id);
      publishStatus();
      await stopPtyAgentTask(id);
    })();
    callbacksRef.current.onAgentEndRequestHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentEndRequest]);

  // Live ACP event socket for the focused task.
  useEffect(() => {
    const id = taskId?.trim() || "";
    if (!enabled || !id) return;

    openRef.current.add(id);
    publishStatus();

    const url = getPtyWebSocketUrl({
      cols: 80,
      rows: 24,
      cwd: cwd?.trim() || null,
      kind: "agent",
      taskId: id,
      chatId: chatId?.trim().toLowerCase() || null,
    });

    const socket = new WebSocket(url);
    let settledTimer: number | null = null;

    const settle = () => {
      if (settledTimer != null) window.clearTimeout(settledTimer);
      // Queue behind any same-tick afterAgentResponse frame so text lands in
      // turnUi before finalize — but do not wait 80ms (that left Working…
      // visible after the agent was already done).
      settledTimer = window.setTimeout(() => {
        settledTimer = null;
        workingRef.current.delete(id);
        clearLiveAgentWorkingForTask(id);
        publishStatus();
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
        workingRef.current.delete(id);
        openRef.current.delete(id);
        clearLiveAgentWorkingForTask(id);
        publishStatus();
        // T3: session end leaves the turn settled — finalize chat chrome too.
        settle();
        return;
      }

      if (message.type === "agent-hook") {
        if (message.activity === "working" || message.event === "preToolUse") {
          workingRef.current.add(id);
          markLiveAgentWorkingForTask(id);
          publishStatus();
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
          settle();
        }
        return;
      }

      if (message.type !== "acp-event") return;

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
        settle();
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
          workingRef.current.add(id);
          markLiveAgentWorkingForTask(id);
          publishStatus();
        } else if (message.activity === "idle") {
          settle();
        }
      }
    });

    return () => {
      // Flush a pending settle before teardown so collapse/remount cannot
      // drop the finalize that was already queued.
      if (settledTimer != null) {
        window.clearTimeout(settledTimer);
        settledTimer = null;
        workingRef.current.delete(id);
        clearLiveAgentWorkingForTask(id);
        callbacksRef.current.onAcpTurnSettled?.(id);
      }
      openRef.current.delete(id);
      publishStatus();
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, chatId, cwd, enabled]);
}