import { useCallback, useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import {
  emptyAgentActivitySummary,
  summarizeAgentActivity,
  type AgentActivity,
  type AgentActivitySummary,
  type StatusBarAgentItem,
} from "../lib/agent/agent-activity";
import { isAgentCliOpenFromSignals } from "../lib/agent/agent-cli-open";
import { applyAgentTurnCompleted } from "../lib/agent/apply-agent-turn-completed";
import {
  cursorAgentQuitText,
  cursorAgentResumeCommand,
  resolveAgentTerminalAction,
  type AgentAttachRequest,
  type AgentEndRequest,
} from "../lib/agent/cursor-agent-cli";
import { markTaskInProgressForAgent } from "../lib/agent/agent-task-mutations";
import {
  clearLiveAgentWorkingForTask,
  markLiveAgentWorkingForTask,
  registerClearLiveAgentWorking,
  registerMarkLiveAgentWorking,
} from "../lib/agent/clear-live-agent-working";
import {
  parseAgentTurnUsage,
  type AgentTurnCompleteReason,
  type AgentTurnCompletedEvent,
  type AgentTurnUsage,
} from "../lib/agent/agent-turn";
import { isAgentChatDestroyed, markAgentChatDestroyed } from "../lib/agent/task-agent-sessions";
import { readAgentChatModelId } from "../lib/agent/agent-chat-model";
import { useDesktopApi } from "../lib/api-context";
import {
  ensurePtyAgent,
  getPtyWebSocketUrl,
  killPtySession,
  cancelPtyAcpTurn,
  submitPtyAgentPrompt,
  type PtySessionKind,
} from "../lib/pty";

type TerminalEntry = {
  term: Terminal;
  fit: FitAddon;
  socket: WebSocket | null;
  disposed: boolean;
  sessionId: string;
};

const SESSION_STORAGE_KEY = "backsteros-desktop.pty-session-ids-v2";

function readPersistedSessionIds(): Map<string, string> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, string>;
    return new Map(
      Object.entries(parsed).filter(([, v]) => typeof v === "string"),
    );
  } catch {
    return new Map();
  }
}

/**
 * Module-level PTY viewport state.
 *
 * The sidecar owns long-lived PTY processes (agents keep running after leave).
 * React only owns the disposable viewer (xterm + WebSocket). Leave detaches
 * the viewer; return reconnects to the same sessionId without touching the agent.
 * Only Stop agent kills the sidecar PTY.
 */
const liveEntries = new Map<string, TerminalEntry>();
const liveSessionByKey = readPersistedSessionIds();
const liveAttachedChat = new Map<string, string>();
const liveActivity = new Map<string, AgentActivity>();
const liveAgentMarked = new Set<string>();
const liveHookLive = new Set<string>();
const liveReattached = new Set<string>();
/** taskId → chatId waiting for WS `ready` before resume-or-noop decision. */
const liveViewerReconcile = new Map<string, string>();
/** Last assistant text for the in-flight turn (stop / afterAgentResponse). */
const liveAssistantText = new Map<string, string>();
const liveTurnUsage = new Map<string, AgentTurnUsage>();
const liveTurnStartedAt = new Map<string, number>();
/** Sessions that have started a turn and expect a stop/review outcome. */
const liveTurnArmed = new Set<string>();
/** Hold-thread root comment id for the next review/hold comment. */
const liveReplyParentByTask = new Map<string, string>();
const livePendingStopEmit = new Map<
  string,
  {
    timer: ReturnType<typeof setTimeout>;
    taskId: string;
    reason: AgentTurnCompleteReason;
    abrupt: boolean;
  }
>();

/** React panels subscribe so optimistic working marks refresh list/chat UI. */
const activityBumpListeners = new Set<() => void>();

function notifyAgentActivityBump() {
  for (const listener of activityBumpListeners) {
    listener();
  }
}

export function subscribeAgentActivityBump(listener: () => void): () => void {
  activityBumpListeners.add(listener);
  return () => {
    activityBumpListeners.delete(listener);
  };
}

/** Optimistically mark a live PTY session as working (composer send / prompt). */
function markLiveSessionWorking(sessionId: string) {
  const alreadyWorking = liveActivity.get(sessionId) === "working";
  liveActivity.set(sessionId, "working");
  liveTurnArmed.add(sessionId);
  liveAgentMarked.add(sessionId);
  liveHookLive.add(sessionId);
  if (!liveTurnStartedAt.has(sessionId)) {
    liveTurnStartedAt.set(sessionId, Date.now());
  }
  if (!alreadyWorking) {
    notifyAgentActivityBump();
  }
}

/**
 * Mark a task as working even when no PTY session id is known yet (Chat ACP
 * bootstrap / first prompt before the viewer attaches).
 */
const liveWorkingTaskIds = new Set<string>();

function markLiveTaskWorking(taskId: string) {
  const id = taskId.trim();
  if (!id) return;
  const already = liveWorkingTaskIds.has(id);
  liveWorkingTaskIds.add(id);
  const sessionId = liveSessionByKey.get(sessionKey(id, "agent"));
  if (sessionId) {
    markLiveSessionWorking(sessionId);
    return;
  }
  if (!already) {
    notifyAgentActivityBump();
  }
}

/**
 * Stop PTY-side "agent working" marks for a task. Registered with
 * clear-live-agent-working so Stop / turn-complete also clear Chat UI marks.
 */
function clearPtyLiveAgentWorking(taskId: string): void {
  const id = taskId.trim();
  if (!id) return;
  liveWorkingTaskIds.delete(id);
  const sessionId = liveSessionByKey.get(sessionKey(id, "agent"));
  if (!sessionId) {
    notifyAgentActivityBump();
    return;
  }
  liveTurnArmed.delete(sessionId);
  const pending = livePendingStopEmit.get(sessionId);
  if (pending) {
    clearTimeout(pending.timer);
    livePendingStopEmit.delete(sessionId);
  }
  if (liveActivity.get(sessionId) === "working") {
    liveActivity.set(sessionId, "idle");
  }
  notifyAgentActivityBump();
}

registerClearLiveAgentWorking(clearPtyLiveAgentWorking);
registerMarkLiveAgentWorking(markLiveTaskWorking);

export { clearLiveAgentWorkingForTask };

function writePersistedSessionIds(map: Map<string, string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(map)),
    );
  } catch {
    /* ignore */
  }
}

function sessionKey(taskId: string, kind: PtySessionKind = "agent"): string {
  return `${taskId}:${kind}`;
}

/**
 * Drop the UI viewport (xterm + WebSocket) for a task. Keeps the sidecar PTY
 * and session id so return can reattach without killing a running agent.
 */
export function detachAgentViewport(
  taskId: string,
  kind: PtySessionKind = "agent",
): void {
  const id = taskId.trim();
  if (!id) return;
  const key = sessionKey(id, kind);
  const entry = liveEntries.get(key);
  liveViewerReconcile.delete(id);
  if (!entry) return;
  entry.disposed = true;
  try {
    entry.socket?.close();
  } catch {
    /* ignore */
  }
  try {
    entry.term.dispose();
  } catch {
    /* ignore */
  }
  liveEntries.delete(key);
}

/** True when this task currently has a live UI viewer (xterm + WS). */
export function hasAgentViewport(
  taskId: string,
  kind: PtySessionKind = "agent",
): boolean {
  const entry = liveEntries.get(sessionKey(taskId.trim(), kind));
  return Boolean(entry && !entry.disposed);
}

function writeAgentPtyInput(taskId: string, data: string): boolean {
  const entry = liveEntries.get(sessionKey(taskId.trim(), "agent"));
  if (!entry || entry.disposed) return false;
  if (entry.socket && entry.socket.readyState === WebSocket.OPEN) {
    sendPtyMessage(entry.socket, { type: "input", data });
    return true;
  }
  return false;
}

/**
 * Inject raw bytes into the live agent PTY (no working-state side effects).
 * Used for light TUI commands such as `/model …`.
 */
export function injectAgentPtyText(taskId: string, data: string): boolean {
  return writeAgentPtyInput(taskId, data);
}

/**
 * Submit a follow-up prompt for a task (chat composer).
 * Sidecar prefers the live Herdr agent pane when present; ACP for images / fallback.
 */
export function submitAgentComposerPrompt(
  taskId: string,
  prompt: string,
  options?: {
    chatId?: string | null;
    cwd?: string | null;
    mode?: string | null;
    images?: { mimeType: string; data: string }[] | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = prompt.trim();
  const id = taskId.trim();
  const images = (options?.images ?? []).filter(
    (image) =>
      image.mimeType.startsWith("image/") && image.data.trim().length > 0,
  );
  if ((!trimmed && images.length === 0) || !id) {
    return Promise.resolve({
      ok: false,
      error: "taskId and prompt are required.",
    });
  }
  // Always mark the task — Chat ACP can run before a PTY session id exists.
  markLiveAgentWorkingForTask(id);
  return submitPtyAgentPrompt({
    taskId: id,
    prompt: trimmed,
    chatId: options?.chatId ?? null,
    cwd: options?.cwd ?? null,
    mode: options?.mode ?? null,
    images,
  });
}

/** Soft-interrupt the in-flight Chat turn via ACP cancel (T3-style). */
export function interruptAgentComposer(taskId: string): boolean {
  const id = taskId.trim();
  if (!id) return false;
  // Drop Working… immediately — cancel can lag or fail while the UI stays stuck.
  clearLiveAgentWorkingForTask(id);
  void cancelPtyAcpTurn(id);
  return true;
}

/** Drop local viewport state after Settings Kill (or process exit). */
export function forgetLivePtySession(sessionId: string) {
  const id = sessionId.trim();
  if (!id) return;
  for (const [key, entry] of [...liveEntries.entries()]) {
    if (entry.sessionId !== id) continue;
    entry.disposed = true;
    try {
      entry.socket?.close();
    } catch {
      /* ignore */
    }
    try {
      entry.term.dispose();
    } catch {
      /* ignore */
    }
    liveEntries.delete(key);
    liveSessionByKey.delete(key);
    liveReattached.delete(id);
    liveAgentMarked.delete(id);
    liveHookLive.delete(id);
    liveActivity.delete(id);
    let taskId = "";
    if (key.endsWith(":agent")) {
      taskId = key.slice(0, -":agent".length);
    } else if (key.endsWith(":shell")) {
      taskId = key.slice(0, -":shell".length);
    }
    if (taskId && key.endsWith(":agent")) {
      liveAttachedChat.delete(taskId);
      liveViewerReconcile.delete(taskId);
    }
  }
  writePersistedSessionIds(liveSessionByKey);
}

function sendPtyMessage(
  socket: WebSocket | null,
  message: Record<string, unknown>,
) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pty-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Put this entry's xterm into the visible host (task switches share one host). */
function hostHasLayout(host: HTMLElement): boolean {
  return host.clientWidth > 2 && host.clientHeight > 2;
}

/**
 * SIGWINCH dance — fullscreen TUIs (Cursor Agent) often need a real size
 * change to repaint after the UI was hidden or the xterm was remounted.
 * Coalesce overlapping calls — a resize storm leaves the Agent TUI blank.
 */
let repaintTimer: number | null = null;
let repaintEntry: TerminalEntry | null = null;

const TERMINAL_BG = "#131313";
const TERMINAL_FG = "#ededed";

function forceTuiRepaint(entry: TerminalEntry) {
  if (!entry.socket || entry.socket.readyState !== WebSocket.OPEN) return;
  repaintEntry = entry;
  if (repaintTimer != null) {
    window.clearTimeout(repaintTimer);
  }
  repaintTimer = window.setTimeout(() => {
    repaintTimer = null;
    const target = repaintEntry;
    repaintEntry = null;
    if (!target || target.disposed) return;
    if (!target.socket || target.socket.readyState !== WebSocket.OPEN) return;
    const cols = Math.max(2, target.term.cols || 80);
    const rows = Math.max(2, target.term.rows || 24);
    sendPtyMessage(target.socket, {
      type: "resize",
      cols,
      rows: Math.max(1, rows - 1),
    });
    window.setTimeout(() => {
      if (target.disposed) return;
      sendPtyMessage(target.socket, { type: "resize", cols, rows });
      try {
        target.term.scrollToBottom();
      } catch {
        /* ignore */
      }
    }, 50);
  }, 80);
}

function showEntryInHost(
  host: HTMLElement,
  entry: TerminalEntry,
  options?: { repaint?: boolean },
) {
  const element = entry.term.element;
  if (!element) return;
  const remount =
    element.parentElement !== host || host.childElementCount !== 1;
  if (remount) {
    host.replaceChildren();
    host.appendChild(element);
  }
  const hasLayout = hostHasLayout(host);
  // Never fit/resize while the host is hidden — that shrinks the live Agent TUI.
  if (!hasLayout) {
    try {
      entry.term.scrollToBottom();
    } catch {
      /* ignore */
    }
    return;
  }

  const prevCols = entry.term.cols;
  const prevRows = entry.term.rows;
  try {
    entry.fit.fit();
  } catch {
    /* ignore */
  }
  const sizeChanged =
    entry.term.cols !== prevCols || entry.term.rows !== prevRows;
  // Already mounted at the right size — skip resize storms from effect re-runs.
  if (!remount && !sizeChanged && !options?.repaint) {
    return;
  }

  if (options?.repaint || remount) {
    forceTuiRepaint(entry);
  } else {
    sendPtyMessage(entry.socket, {
      type: "resize",
      cols: entry.term.cols,
      rows: entry.term.rows,
    });
  }
  try {
    entry.term.scrollToBottom();
  } catch {
    /* ignore */
  }
}

export type DesktopTerminalPanelProps = {
  taskId: string | null;
  projectId?: string | null;
  projectLabel?: string;
  /** Task display id (e.g. LD-2) — Herdr tab label. */
  taskDisplayId?: string | null;
  cwd?: string | null;
  /**
   * PTY kind. `"agent"` is the task rail (bound chat / Start agent).
   * `"shell"` opens a plain shell on load (no agent attach).
   */
  kind?: PtySessionKind;
  /**
   * Always show and connect a PTY on load (codebase task layout). Still
   * handles agent attach/end when `kind` is `"agent"`.
   */
  alwaysOpen?: boolean;
  /**
   * `"chat"` softens placeholder copy and host chrome for the non-codebase
   * agent chat rail. Session attach behavior is identical.
   */
  variant?: "terminal" | "chat";
  /**
   * Codebase projects only: PATCH the task to In Progress when the agent
   * starts working (hooks / attach prompts). Off for non-codebase rails.
   */
  autoMarkInProgress?: boolean;
  /** Cursor chat id from core (`task.agentChatId`) for the selected task. */
  boundAgentChatId?: string | null;
  collapsed?: boolean;
  layoutReady?: boolean;
  agentAttachRequest?: AgentAttachRequest | null;
  onAgentAttachRequestHandled?: () => void;
  agentEndRequest?: AgentEndRequest | null;
  onAgentEndRequestHandled?: () => void;
  onAgentActivitySummaryChange?: (summary: AgentActivitySummary) => void;
  onWorkingTaskIdsChange?: (taskIds: string[]) => void;
  onAgentStatusItemsChange?: (items: StatusBarAgentItem[]) => void;
  onAgentOpenTaskIdsChange?: (taskIds: readonly string[]) => void;
  focusRequest?: number;
  /**
   * Fired when the Cursor agent emits assistant reply text
   * (`afterAgentResponse`). Used by the chat transcript view.
   */
  onAssistantMessage?: (taskId: string, text: string) => void;
  /** Structured ACP `session/update` frames (tool calls, thoughts, plan). */
  onAcpSessionUpdate?: (taskId: string, update: unknown) => void;
  /**
   * Cursor CLI agent-hook frames with tool/thought/todo detail (Herdr path).
   * Chat maps these onto the same ActivityList / PlanTodoList chrome as ACP.
   */
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
  /** `cursor/update_todos` checklist updates. */
  onCursorUpdateTodos?: (taskId: string, params: unknown) => void;
  /** `cursor/create_plan` proposed plan markdown. */
  onCursorCreatePlan?: (taskId: string, params: unknown) => void;
  /** ACP turn finished or failed — clear ephemeral activity UI. */
  onAcpTurnSettled?: (taskId: string) => void;
  /** Interactive permission / ask_question from ACP (non-auto). */
  onAcpUiRequest?: (
    taskId: string,
    request: {
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
    },
  ) => void;
  /** Cleared / timed-out UI request. */
  onAcpUiRequestCleared?: (taskId: string, requestId: string | null) => void;
  /**
   * When set, unbound agent panes show a full-size Start agent hit target
   * instead of an idle shell / “start from Activities” copy.
   */
  onStartAgent?: () => void;
  startingAgent?: boolean;
  /** Top-right Stop control (iOS-style) while a session is live. */
  onStopAgent?: () => void;
};

/**
 * Task PTY viewport. Session ids are local; agent chat binding lives on the
 * task in core (`agentChatId`). Use `alwaysOpen` for codebase task layouts.
 */
export function DesktopTerminalPanel({
  taskId,
  projectId = null,
  projectLabel = "Task",
  taskDisplayId = null,
  cwd = null,
  kind = "agent",
  alwaysOpen = false,
  variant = "terminal",
  autoMarkInProgress = false,
  boundAgentChatId = null,
  collapsed = false,
  layoutReady = true,
  agentAttachRequest = null,
  onAgentAttachRequestHandled,
  agentEndRequest = null,
  onAgentEndRequestHandled,
  onAgentActivitySummaryChange,
  onWorkingTaskIdsChange,
  onAgentStatusItemsChange,
  onAgentOpenTaskIdsChange,
  focusRequest = 0,
  onAssistantMessage,
  onAcpSessionUpdate,
  onAgentHookTurnUpdate,
  onCursorUpdateTodos,
  onCursorCreatePlan,
  onAcpTurnSettled,
  onAcpUiRequest,
  onAcpUiRequestCleared,
  onStartAgent,
  startingAgent = false,
  onStopAgent,
}: DesktopTerminalPanelProps) {
  const { client } = useDesktopApi();
  const clientRef = useRef(client);
  clientRef.current = client;
  const onAssistantMessageRef = useRef(onAssistantMessage);
  onAssistantMessageRef.current = onAssistantMessage;
  const onAcpSessionUpdateRef = useRef(onAcpSessionUpdate);
  onAcpSessionUpdateRef.current = onAcpSessionUpdate;
  const onAgentHookTurnUpdateRef = useRef(onAgentHookTurnUpdate);
  onAgentHookTurnUpdateRef.current = onAgentHookTurnUpdate;
  const onCursorUpdateTodosRef = useRef(onCursorUpdateTodos);
  onCursorUpdateTodosRef.current = onCursorUpdateTodos;
  const onCursorCreatePlanRef = useRef(onCursorCreatePlan);
  onCursorCreatePlanRef.current = onCursorCreatePlan;
  const onAcpTurnSettledRef = useRef(onAcpTurnSettled);
  onAcpTurnSettledRef.current = onAcpTurnSettled;
  const onAcpUiRequestRef = useRef(onAcpUiRequest);
  onAcpUiRequestRef.current = onAcpUiRequest;
  const onAcpUiRequestClearedRef = useRef(onAcpUiRequestCleared);
  onAcpUiRequestClearedRef.current = onAcpUiRequestCleared;

  const agentHostRef = useRef<HTMLDivElement | null>(null);
  const entriesRef = useRef(liveEntries);
  const sessionByKeyRef = useRef(liveSessionByKey);
  const attachedChatRef = useRef(liveAttachedChat);
  const activityRef = useRef(liveActivity);
  const agentMarkedRef = useRef(liveAgentMarked);
  const reattachedSessionsRef = useRef(liveReattached);
  const hookLiveRef = useRef(liveHookLive);
  const boundChatIdRef = useRef(boundAgentChatId);
  const autoMarkInProgressRef = useRef(autoMarkInProgress);
  autoMarkInProgressRef.current = autoMarkInProgress;
  const [activityTick, setActivityTick] = useState(0);
  /** Tasks whose agent viewport was cleared by Stop — show placeholder until core clears agentChatId or a new attach. */
  const [suppressedAgentTasks, setSuppressedAgentTasks] = useState(
    () => new Set<string>(),
  );

  const emitTurnCompletedRef = useRef<
    | ((
        sessionId: string,
        taskIdForSession: string,
        meta: { reason: AgentTurnCompleteReason; abrupt: boolean },
      ) => void)
    | null
  >(null);

  const emitTurnCompleted = useCallback(
    (
      sessionId: string,
      taskIdForSession: string,
      meta: { reason: AgentTurnCompleteReason; abrupt: boolean },
    ) => {
      const startedAt = liveTurnStartedAt.get(sessionId);
      liveTurnStartedAt.delete(sessionId);
      const usage = liveTurnUsage.get(sessionId) ?? null;
      liveTurnUsage.delete(sessionId);
      const assistantText = liveAssistantText.get(sessionId) ?? null;
      liveAssistantText.delete(sessionId);
      const durationMs = Math.max(
        0,
        usage?.durationMs != null && usage.durationMs > 0
          ? usage.durationMs
          : startedAt
            ? Date.now() - startedAt
            : 0,
      );
      // Always drop Working… / list pulses when a turn ends — even for short
      // thank-you replies. The duration/token guard only skips observer-side
      // status + comment mutations (avoid flicker from sub-second noise).
      clearLiveAgentWorkingForTask(taskIdForSession);
      if (
        !(
          meta.abrupt ||
          meta.reason === "stop" ||
          meta.reason === "sessionEnd" ||
          durationMs >= 1000 ||
          (usage?.totalTokens ?? 0) > 0
        )
      ) {
        return;
      }
      const event: AgentTurnCompletedEvent = {
        taskId: taskIdForSession,
        durationMs,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        cacheReadTokens: usage?.cacheReadTokens ?? null,
        cacheWriteTokens: usage?.cacheWriteTokens ?? null,
        totalTokens: usage?.totalTokens ?? null,
        chatId:
          usage?.conversationId ??
          attachedChatRef.current.get(taskIdForSession) ??
          null,
        status: usage?.status ?? null,
        assistantText,
        reason: meta.reason,
        abrupt: meta.abrupt,
      };
      const parentCommentId =
        liveReplyParentByTask.get(taskIdForSession) ?? null;
      liveReplyParentByTask.delete(taskIdForSession);
      // Always apply observer status (In Review / On Hold). Chat is the
      // universal agent surface now — skipping left tasks stuck In Progress.
      void applyAgentTurnCompleted(clientRef.current, event, {
        parentCommentId,
      });
    },
    [],
  );
  emitTurnCompletedRef.current = emitTurnCompleted;

  useEffect(() => {
    boundChatIdRef.current = boundAgentChatId;
  }, [boundAgentChatId]);

  useEffect(() => {
    if (!taskId) return;
    if (boundAgentChatId?.trim()) return;
    setSuppressedAgentTasks((prev) => {
      if (!prev.has(taskId)) return prev;
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });
  }, [boundAgentChatId, taskId]);

  useEffect(() => {
    if (!agentAttachRequest) return;
    setSuppressedAgentTasks((prev) => {
      if (!prev.has(agentAttachRequest.taskId)) return prev;
      const next = new Set(prev);
      next.delete(agentAttachRequest.taskId);
      return next;
    });
  }, [agentAttachRequest]);

  const bumpActivity = useCallback(() => {
    setActivityTick((n) => n + 1);
  }, []);

  useEffect(() => subscribeAgentActivityBump(bumpActivity), [bumpActivity]);

  const isAgentTuiOpen = useCallback((forTaskId: string, sessionId: string) => {
    const entry = entriesRef.current.get(sessionKey(forTaskId, "agent"));
    const uiConnected = Boolean(
      entry &&
        !entry.disposed &&
        entry.socket &&
        entry.socket.readyState === WebSocket.OPEN,
    );
    return isAgentCliOpenFromSignals({
      uiConnected,
      hasAgentTitle: false,
      titleConfirmed: false,
      hookLive: hookLiveRef.current.has(sessionId),
      activity: activityRef.current.get(sessionId) ?? null,
      attached: attachedChatRef.current.has(forTaskId),
      markedAsAgent: agentMarkedRef.current.has(sessionId),
    });
  }, []);

  const markAgentCliLeft = useCallback(
    (forTaskId: string, sessionId: string) => {
      agentMarkedRef.current.delete(sessionId);
      hookLiveRef.current.delete(sessionId);
      activityRef.current.delete(sessionId);
      attachedChatRef.current.delete(forTaskId);
      bumpActivity();
    },
    [bumpActivity],
  );

  const disposeEntry = useCallback((entry: TerminalEntry) => {
    entry.disposed = true;
    try {
      entry.socket?.close();
    } catch {
      /* ignore */
    }
    try {
      entry.term.dispose();
    } catch {
      /* ignore */
    }
  }, []);

  const ensureEntry = useCallback(
    (forTaskId: string, ptyKind: PtySessionKind = kind): TerminalEntry | null => {
      const host = agentHostRef.current;
      if (!host) return null;

      const key = sessionKey(forTaskId, ptyKind);
      let sessionId = sessionByKeyRef.current.get(key);
      if (!sessionId) {
        sessionId = newSessionId();
        sessionByKeyRef.current.set(key, sessionId);
        writePersistedSessionIds(sessionByKeyRef.current);
      }

      const existing = entriesRef.current.get(key);
      if (existing && !existing.disposed && existing.sessionId === sessionId) {
        const socket = existing.socket;
        const socketAlive =
          socket &&
          (socket.readyState === WebSocket.OPEN ||
            socket.readyState === WebSocket.CONNECTING);
        if (socketAlive) {
          showEntryInHost(host, existing);
          return existing;
        }
        disposeEntry(existing);
        entriesRef.current.delete(key);
      } else if (existing) {
        disposeEntry(existing);
        entriesRef.current.delete(key);
      }

      host.replaceChildren();

      const term = new Terminal({
        convertEol: false,
        // Agent: no blink; cursor color matches bg (CSS also hides the layer).
        cursorBlink: ptyKind !== "agent",
        fontSize: 12,
        lineHeight: 1.2,
        letterSpacing: 0,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        scrollback: 10_000,
        theme: {
          background: TERMINAL_BG,
          foreground: TERMINAL_FG,
          cursor: ptyKind === "agent" ? TERMINAL_BG : TERMINAL_FG,
          cursorAccent: TERMINAL_BG,
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      if (hostHasLayout(host)) {
        fit.fit();
      }

      const entry: TerminalEntry = {
        term,
        fit,
        socket: null,
        disposed: false,
        sessionId,
      };
      entriesRef.current.set(key, entry);

      term.onData((data) => {
        sendPtyMessage(entry.socket, { type: "input", data });
      });

      const cols = Math.max(2, term.cols || 80);
      const rows = Math.max(1, term.rows || 24);
      const boundChat =
        ptyKind === "agent"
          ? boundChatIdRef.current?.trim().toLowerCase() || null
          : null;
      const url = getPtyWebSocketUrl({
        cols,
        rows,
        cwd,
        sessionId,
        kind: ptyKind,
        taskId: forTaskId,
        label: projectLabel || null,
        tabLabel: taskDisplayId || null,
        chatId: boundChat,
      });

      let pendingStartup: string | null = null;
      const flushStartup = () => {
        if (!pendingStartup) return;
        const command = pendingStartup;
        pendingStartup = null;
        sendPtyMessage(entry.socket, { type: "input", data: command });
      };

      const adoptCanonicalSessionId = (actual: string) => {
        const next = actual.trim();
        if (!next || next === entry.sessionId) return entry.sessionId;
        const previous = entry.sessionId;
        entry.sessionId = next;
        sessionByKeyRef.current.set(key, next);
        writePersistedSessionIds(sessionByKeyRef.current);
        const migrate = <T,>(map: Map<string, T>) => {
          if (!map.has(previous)) return;
          if (!map.has(next)) map.set(next, map.get(previous) as T);
          map.delete(previous);
        };
        const migrateSet = (set: Set<string>) => {
          if (!set.has(previous)) return;
          set.delete(previous);
          set.add(next);
        };
        migrate(activityRef.current);
        migrate(liveActivity);
        migrate(liveAssistantText);
        migrate(liveTurnUsage);
        migrate(liveTurnStartedAt);
        migrate(livePendingStopEmit);
        migrateSet(agentMarkedRef.current);
        migrateSet(hookLiveRef.current);
        migrateSet(liveAgentMarked);
        migrateSet(liveHookLive);
        migrateSet(liveTurnArmed);
        migrateSet(reattachedSessionsRef.current);
        migrateSet(liveReattached);
        return next;
      };

      const handleMessage = (event: MessageEvent) => {
        if (entry.disposed) return;
        let message: {
          type?: string;
          data?: string;
          message?: string;
          sessionId?: string;
          activity?: string | null;
          event?: string;
          source?: string;
          reattached?: boolean;
          agentSessionEnded?: boolean;
          herdrManaged?: boolean;
          lastActivity?: string | null;
          text?: string;
          error?: string;
          usage?: unknown;
          update?: unknown;
          params?: unknown;
          requestId?: string | null;
          auto?: boolean;
          title?: string | null;
          detail?: string | null;
          options?: unknown;
          questions?: unknown;
          reason?: string | null;
          toolName?: string;
          toolUseId?: string;
          toolInput?: unknown;
          toolOutput?: string;
          errorMessage?: string;
          durationMs?: number;
        };
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (message.type === "output" && typeof message.data === "string") {
          entry.term.write(message.data);
          return;
        }
        if (message.type === "acp-event") {
          if (
            message.event === "session-update" &&
            message.update !== undefined
          ) {
            onAcpSessionUpdateRef.current?.(forTaskId, message.update);
          } else if (message.event === "cursor-update-todos") {
            onCursorUpdateTodosRef.current?.(forTaskId, message.params);
          } else if (message.event === "cursor-create-plan") {
            onCursorCreatePlanRef.current?.(forTaskId, message.params);
          } else if (
            message.event === "prompt-complete" ||
            message.event === "prompt-error"
          ) {
            const sessionId = entry.sessionId;
            const replyText =
              typeof message.text === "string" && message.text.trim()
                ? message.text.trim()
                : typeof message.error === "string" && message.error.trim()
                  ? message.error.trim()
                  : typeof message.message === "string" && message.message.trim()
                    ? message.message.trim()
                    : null;
            if (replyText) {
              liveAssistantText.set(sessionId, replyText);
            }
            // Chat ACP owns turn completion. Apply In Review / On Hold here —
            // before settle clears liveTurnArmed. Prefer finalizing with the
            // reply text so activities land on the assistant message.
            emitTurnCompletedRef.current?.(sessionId, forTaskId, {
              reason: "stop",
              abrupt: message.event === "prompt-error",
            });
            if (replyText) {
              onAssistantMessageRef.current?.(forTaskId, replyText);
            }
            // Always settle — assistant text is applied to the live turn first
            // (interleaved segments), then frozen into the transcript.
            onAcpTurnSettledRef.current?.(forTaskId);
          } else if (
            (message.event === "permission" ||
              message.event === "ask-question") &&
            typeof message.requestId === "string" &&
            message.requestId &&
            message.auto !== true
          ) {
            const options = Array.isArray(message.options)
              ? message.options
                  .map((opt) => {
                    if (!opt || typeof opt !== "object") return null;
                    const o = opt as { id?: unknown; label?: unknown };
                    const id = typeof o.id === "string" ? o.id.trim() : "";
                    if (!id) return null;
                    return {
                      id,
                      label:
                        typeof o.label === "string" && o.label.trim()
                          ? o.label.trim()
                          : id,
                    };
                  })
                  .filter(
                    (opt): opt is { id: string; label: string } => opt != null,
                  )
              : [];
            const questions = Array.isArray(message.questions)
              ? message.questions
                  .map((entry, index) => {
                    if (!entry || typeof entry !== "object") return null;
                    const q = entry as {
                      id?: unknown;
                      prompt?: unknown;
                      multiSelect?: unknown;
                      options?: unknown;
                    };
                    const id =
                      typeof q.id === "string" && q.id.trim()
                        ? q.id.trim()
                        : `q-${index}`;
                    const prompt =
                      typeof q.prompt === "string" ? q.prompt.trim() : "";
                    if (!prompt) return null;
                    const qOptions = Array.isArray(q.options)
                      ? q.options
                          .map((opt) => {
                            if (!opt || typeof opt !== "object") return null;
                            const o = opt as {
                              id?: unknown;
                              label?: unknown;
                            };
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
                            (
                              opt,
                            ): opt is { id: string; label: string } =>
                              opt != null,
                          )
                      : [];
                    return {
                      id,
                      prompt,
                      options: qOptions,
                      multiSelect: q.multiSelect === true,
                    };
                  })
                  .filter(
                    (
                      q,
                    ): q is {
                      id: string;
                      prompt: string;
                      options: { id: string; label: string }[];
                      multiSelect: boolean;
                    } => q != null,
                  )
              : [];
            onAcpUiRequestRef.current?.(forTaskId, {
              kind:
                message.event === "ask-question"
                  ? "ask_question"
                  : "permission",
              requestId: message.requestId,
              title:
                typeof message.title === "string" && message.title.trim()
                  ? message.title.trim()
                  : message.event === "ask-question"
                    ? "Agent question"
                    : "Permission required",
              detail:
                typeof message.detail === "string" ? message.detail : null,
              options,
              questions,
            });
          } else if (
            message.event === "permission-timeout" ||
            message.event === "ask-question-timeout" ||
            message.event === "ui-request-cleared"
          ) {
            onAcpUiRequestClearedRef.current?.(
              forTaskId,
              typeof message.requestId === "string" ? message.requestId : null,
            );
          } else if (
            message.event === "activity" &&
            (message.activity === "working" || message.activity === "idle")
          ) {
            // Mirror ACP activity onto the same path as agent-hook activity so
            // Chat Working… cannot drift from the live ACP session.
            const sessionId = entry.sessionId;
            if (message.activity === "working") {
              markLiveSessionWorking(sessionId);
              if (autoMarkInProgressRef.current) {
                void markTaskInProgressForAgent(clientRef.current, forTaskId);
              }
            } else {
              const previous = activityRef.current.get(sessionId) ?? null;
              const wasArmed =
                previous === "working" ||
                liveTurnArmed.has(sessionId) ||
                liveWorkingTaskIds.has(forTaskId);
              clearLiveAgentWorkingForTask(forTaskId);
              // Defer Chat settle — same race as agent-hook idle vs response text.
              const existing = livePendingStopEmit.get(sessionId);
              if (existing) clearTimeout(existing.timer);
              const timer = setTimeout(() => {
                livePendingStopEmit.delete(sessionId);
                onAcpTurnSettledRef.current?.(forTaskId);
                if (wasArmed) {
                  emitTurnCompletedRef.current?.(sessionId, forTaskId, {
                    reason: "stop",
                    abrupt: false,
                  });
                }
              }, 800);
              livePendingStopEmit.set(sessionId, {
                timer,
                taskId: forTaskId,
                reason: "stop",
                abrupt: false,
              });
              liveTurnArmed.delete(sessionId);
              activityRef.current.set(sessionId, "idle");
              agentMarkedRef.current.add(sessionId);
              hookLiveRef.current.add(sessionId);
              bumpActivity();
            }
          }
          return;
        }
        if (message.type === "ready") {
          const sessionIdNow = message.sessionId
            ? adoptCanonicalSessionId(message.sessionId)
            : entry.sessionId;
          if (message.reattached) {
            reattachedSessionsRef.current.add(sessionIdNow);
          }

          // Viewer return: decide resume vs noop only after the sidecar says
          // whether this WebSocket reattached to a still-running agent PTY.
          // Herdr-managed sessions already run `agent --resume` inside the pane —
          // never inject another resume into a shared attach.
          const reconcileChat = liveViewerReconcile.get(forTaskId);
          if (reconcileChat) {
            liveViewerReconcile.delete(forTaskId);
            attachedChatRef.current.set(forTaskId, reconcileChat);
            const herdrManaged = Boolean(message.herdrManaged);
            const agentStillLive =
              herdrManaged ||
              (Boolean(message.reattached) && !message.agentSessionEnded);
            if (agentStillLive) {
              pendingStartup = null;
              agentMarkedRef.current.add(sessionIdNow);
              if (
                message.lastActivity === "working" ||
                message.lastActivity === "idle" ||
                message.activity === "working" ||
                message.activity === "idle"
              ) {
                hookLiveRef.current.add(sessionIdNow);
                const activity =
                  message.lastActivity === "working" ||
                  message.activity === "working"
                    ? "working"
                    : "idle";
                const wasWorking =
                  liveWorkingTaskIds.has(forTaskId) ||
                  liveTurnArmed.has(sessionIdNow) ||
                  activityRef.current.get(sessionIdNow) === "working";
                activityRef.current.set(sessionIdNow, activity);
                if (activity === "idle") {
                  // Bootstrap/ACP turn may have finished before this viewer
                  // attached — drop stuck Working… marks and settle Chat UI.
                  clearLiveAgentWorkingForTask(forTaskId);
                  onAcpTurnSettledRef.current?.(forTaskId);
                  if (wasWorking) {
                    emitTurnCompletedRef.current?.(sessionIdNow, forTaskId, {
                      reason: "stop",
                      abrupt: false,
                    });
                  }
                } else {
                  markLiveSessionWorking(sessionIdNow);
                }
              } else {
                activityRef.current.set(sessionIdNow, "present");
              }
              bumpActivity();
            } else {
              // Fresh non-Herdr PTY or agent already left — resume the bound chat.
              pendingStartup = cursorAgentResumeCommand(reconcileChat, null);
              window.setTimeout(
                flushStartup,
                message.reattached ? 50 : 350,
              );
            }
          } else if (pendingStartup && !message.herdrManaged) {
            window.setTimeout(flushStartup, message.reattached ? 50 : 350);
          } else if (message.herdrManaged) {
            pendingStartup = null;
            agentMarkedRef.current.add(sessionIdNow);
          }

          if (message.agentSessionEnded) {
            markAgentCliLeft(forTaskId, sessionIdNow);
          } else if (
            message.lastActivity === "working" ||
            message.lastActivity === "idle" ||
            message.activity === "working" ||
            message.activity === "idle"
          ) {
            const activity =
              message.lastActivity === "working" ||
              message.activity === "working"
                ? "working"
                : "idle";
            const wasWorking =
              liveWorkingTaskIds.has(forTaskId) ||
              liveTurnArmed.has(sessionIdNow) ||
              activityRef.current.get(sessionIdNow) === "working";
            activityRef.current.set(sessionIdNow, activity);
            agentMarkedRef.current.add(sessionIdNow);
            hookLiveRef.current.add(sessionIdNow);
            if (activity === "idle") {
              clearLiveAgentWorkingForTask(forTaskId);
              onAcpTurnSettledRef.current?.(forTaskId);
              if (wasWorking) {
                emitTurnCompletedRef.current?.(sessionIdNow, forTaskId, {
                  reason: "stop",
                  abrupt: false,
                });
              }
            } else {
              markLiveSessionWorking(sessionIdNow);
            }
            bumpActivity();
          } else if (message.reattached) {
            activityRef.current.set(sessionIdNow, "present");
            bumpActivity();
          }
          const hostEl = agentHostRef.current;
          if (hostEl && hostHasLayout(hostEl)) {
            try {
              fit.fit();
            } catch {
              /* ignore */
            }
            if (message.reattached) {
              forceTuiRepaint(entry);
            } else {
              sendPtyMessage(entry.socket, {
                type: "resize",
                cols: Math.max(2, term.cols || 80),
                rows: Math.max(1, term.rows || 24),
              });
            }
          }
          return;
        }
        if (message.type === "agent-hook") {
          // sessionEnd: TUI left. If a turn was still armed/working, complete it
          // as an abrupt exit (→ On Hold). If already idle after `stop`, only
          // clean up — do not fire a second turn-completed.
          if (message.event === "sessionEnd") {
            const sessionId = entry.sessionId;
            const previous = activityRef.current.get(sessionId) ?? null;
            const turnStillActive =
              previous === "working" || liveTurnArmed.has(sessionId);

            if (turnStillActive) {
              emitTurnCompletedRef.current?.(sessionId, forTaskId, {
                reason: "sessionEnd",
                abrupt: true,
              });
            }
            liveTurnArmed.delete(sessionId);
            const pending = livePendingStopEmit.get(sessionId);
            if (pending) {
              clearTimeout(pending.timer);
              livePendingStopEmit.delete(sessionId);
            }
            markAgentCliLeft(forTaskId, sessionId);
            return;
          }

          // Forward tool / thought / todo detail to Chat. With ACP-first Chat
          // sends, this enriches Terminal-originated Herdr activity; Chat turns
          // primarily stream via acp-event session/update.
          onAgentHookTurnUpdateRef.current?.(forTaskId, {
            event: typeof message.event === "string" ? message.event : undefined,
            activity:
              message.activity === "working" ||
              message.activity === "idle" ||
              message.activity === "attention"
                ? message.activity
                : null,
            text: typeof message.text === "string" ? message.text : null,
            toolName: typeof message.toolName === "string" ? message.toolName : null,
            toolUseId:
              typeof message.toolUseId === "string" ? message.toolUseId : null,
            toolInput: message.toolInput,
            toolOutput:
              typeof message.toolOutput === "string" ? message.toolOutput : null,
            errorMessage:
              typeof message.errorMessage === "string"
                ? message.errorMessage
                : null,
            durationMs:
              typeof message.durationMs === "number" ? message.durationMs : null,
          });

          const sessionId = entry.sessionId;
          const usage = parseAgentTurnUsage(message.usage);
          if (usage) {
            liveTurnUsage.set(sessionId, usage);
          }
          if (
            (message.event === "afterAgentResponse" ||
              message.event === "stop" ||
              message.event === "sessionEnd") &&
            typeof message.text === "string" &&
            message.text.trim()
          ) {
            const assistantText = message.text.trim();
            liveAssistantText.set(sessionId, assistantText);
            if (message.event === "afterAgentResponse") {
              onAssistantMessageRef.current?.(forTaskId, assistantText);
            }
          }

          // afterAgentResponse is text-only. Never mark working — CLI often
          // sends it after stop; flush a deferred turn-complete if waiting.
          if (message.event === "afterAgentResponse") {
            const pending = livePendingStopEmit.get(sessionId);
            if (pending) {
              clearTimeout(pending.timer);
              livePendingStopEmit.delete(sessionId);
              emitTurnCompletedRef.current?.(sessionId, pending.taskId, {
                reason: pending.reason,
                abrupt: pending.abrupt,
              });
            }
            return;
          }

          const activity =
            message.activity === "working"
              ? "working"
              : message.activity === "idle"
                ? "idle"
                : message.activity === "attention"
                  ? "attention"
                  : null;
          if (activity === "working") {
            const previous = activityRef.current.get(sessionId) ?? null;
            if (previous !== "working") {
              markLiveSessionWorking(sessionId);
              if (autoMarkInProgressRef.current) {
                void markTaskInProgressForAgent(clientRef.current, forTaskId);
              }
            } else {
              activityRef.current.set(sessionId, "working");
              agentMarkedRef.current.add(sessionId);
              hookLiveRef.current.add(sessionId);
              bumpActivity();
            }
          } else if (activity === "attention") {
            clearLiveAgentWorkingForTask(forTaskId);
            liveTurnArmed.delete(sessionId);
            activityRef.current.set(sessionId, "attention");
            agentMarkedRef.current.add(sessionId);
            hookLiveRef.current.add(sessionId);
            bumpActivity();
          } else if (activity === "idle") {
            // PTY already suppresses Herdr idle while ACP is busy — trust idle
            // here so Working… tracks the live agent (Herdr + ACP), not sticky
            // optimistic marks.
            const previous = activityRef.current.get(sessionId) ?? null;
            const wasArmed =
              previous === "working" ||
              liveTurnArmed.has(sessionId) ||
              liveWorkingTaskIds.has(forTaskId);
            const reason: AgentTurnCompleteReason =
              message.event === "sessionEnd" ? "sessionEnd" : "stop";

            // Drop list/board Working… immediately. Defer Chat settle so
            // afterAgentResponse can finalize with activities still in turnUi
            // — early settle was wiping the "Worked for…" fold.
            clearLiveAgentWorkingForTask(forTaskId);

            const existing = livePendingStopEmit.get(sessionId);
            if (existing) clearTimeout(existing.timer);
            const abrupt = false;
            const timer = setTimeout(() => {
              livePendingStopEmit.delete(sessionId);
              onAcpTurnSettledRef.current?.(forTaskId);
              if (wasArmed) {
                emitTurnCompletedRef.current?.(sessionId, forTaskId, {
                  reason,
                  abrupt,
                });
              }
            }, 800);
            livePendingStopEmit.set(sessionId, {
              timer,
              taskId: forTaskId,
              reason,
              abrupt,
            });

            liveTurnArmed.delete(sessionId);
            activityRef.current.set(sessionId, "idle");
            agentMarkedRef.current.add(sessionId);
            hookLiveRef.current.add(sessionId);
            bumpActivity();
          }
          return;
        }
        if (message.type === "error" && message.message) {
          entry.term.writeln(`\r\n\x1b[31m${message.message}\x1b[0m\r\n`);
          return;
        }
        if (message.type === "exit") {
          entry.term.writeln("\r\n\x1b[90m[session ended]\x1b[0m\r\n");
          markAgentCliLeft(forTaskId, entry.sessionId);
          forgetLivePtySession(entry.sessionId);
        }
      };

      // Attach listeners before the socket can deliver frames (localhost is fast).
      const socket = new WebSocket(url);
      entry.socket = socket;
      socket.addEventListener("message", handleMessage);
      socket.addEventListener("open", () => {
        if (entry.disposed) return;
        const hostEl = agentHostRef.current;
        if (hostEl && hostHasLayout(hostEl)) {
          try {
            fit.fit();
          } catch {
            /* ignore */
          }
          sendPtyMessage(socket, {
            type: "resize",
            cols: entry.term.cols,
            rows: entry.term.rows,
          });
        }
      });
      socket.addEventListener("close", () => {
        if (entry.disposed) return;
        entry.socket = null;
        // Herdr reloads after ACP turns (`herdr-restarted`); reattach quietly.
        const attempts =
          ((entry as TerminalEntry & { reconnectAttempts?: number })
            .reconnectAttempts ?? 0) + 1;
        (entry as TerminalEntry & { reconnectAttempts?: number }).reconnectAttempts =
          attempts;
        if (kind === "agent" && attempts <= 3) {
          entry.term.writeln(
            "\r\n\x1b[90m[session reloading — reconnecting…]\x1b[0m\r\n",
          );
          window.setTimeout(() => {
            if (entry.disposed) return;
            const key = sessionKey(forTaskId, "agent");
            disposeEntry(entry);
            entriesRef.current.delete(key);
            try {
              agentHostRef.current?.replaceChildren();
            } catch {
              /* ignore */
            }
            ensureEntry(forTaskId, "agent");
          }, 600);
          return;
        }
        entry.term.writeln(
          "\r\n\x1b[33mDisconnected from PTY. Run `pnpm pty` then reopen.\x1b[0m\r\n",
        );
        bumpActivity();
      });

      (
        entry as TerminalEntry & {
          setPendingStartup?: (cmd: string) => void;
        }
      ).setPendingStartup = (cmd: string) => {
        pendingStartup = cmd.endsWith("\n") ? cmd : `${cmd}\n`;
        if (socket.readyState === WebSocket.OPEN) {
          window.setTimeout(flushStartup, 100);
        }
      };

      return entry;
    },
    [
      bumpActivity,
      cwd,
      disposeEntry,
      kind,
      markAgentCliLeft,
      projectLabel,
      taskDisplayId,
    ],
  );

  const sendInput = useCallback(
    (forTaskId: string, data: string) => {
      const entry = ensureEntry(forTaskId, "agent");
      if (!entry) return;
      if (entry.socket && entry.socket.readyState === WebSocket.OPEN) {
        sendPtyMessage(entry.socket, { type: "input", data });
        return;
      }
      const withPending = entry as TerminalEntry & {
        setPendingStartup?: (cmd: string) => void;
      };
      withPending.setPendingStartup?.(data);
    },
    [ensureEntry],
  );

  const runAttach = useCallback(
    (request: AgentAttachRequest) => {
      const requested = request.chatId.trim().toLowerCase();
      if (!requested || isAgentChatDestroyed(requested)) return;

      if (request.forceReattach) {
        // Leave/return: always destroy the UI viewer, then build a fresh one
        // onto the Herdr session. Ensure the pane exists (idempotent); never
        // inject a second `agent --resume` into a shared attach.
        const key = sessionKey(request.taskId, "agent");
        const existing = entriesRef.current.get(key);
        if (existing) {
          disposeEntry(existing);
          entriesRef.current.delete(key);
        }
        try {
          agentHostRef.current?.replaceChildren();
        } catch {
          /* ignore */
        }
        attachedChatRef.current.set(request.taskId, requested);
        liveViewerReconcile.set(request.taskId, requested);
        const cwdNow = cwd?.trim() || null;
        // Session start / return: mark working when a new turn is expected so
        // list pulses don't wait on a WebSocket hook that may not be attached yet.
        if (request.sessionIsNew || request.prompt?.trim()) {
          markLiveAgentWorkingForTask(request.taskId);
        }
        void (async () => {
          if (cwdNow) {
            const ensured = await ensurePtyAgent({
              taskId: request.taskId,
              chatId: requested,
              cwd: cwdNow,
              prompt: request.prompt,
              model: request.sessionIsNew ? readAgentChatModelId() : null,
              label: projectLabel || null,
              tabLabel: taskDisplayId || null,
            });
            if (ensured.ok) {
              sessionByKeyRef.current.set(key, ensured.sessionId);
              writePersistedSessionIds(sessionByKeyRef.current);
            }
          }
          ensureEntry(request.taskId, "agent");
          bumpActivity();
        })();
        return;
      }

      ensureEntry(request.taskId, "agent");
      const previouslyAttached =
        attachedChatRef.current.get(request.taskId) ?? null;
      const sessionId = sessionByKeyRef.current.get(
        sessionKey(request.taskId, "agent"),
      );
      const tuiOpen = sessionId
        ? isAgentTuiOpen(request.taskId, sessionId)
        : false;

      const action = resolveAgentTerminalAction({
        tuiOpen,
        attachedChatId: previouslyAttached,
        boundChatId:
          boundChatIdRef.current?.trim().toLowerCase() || requested,
        requestedChatId: requested,
        sessionIsNew: request.sessionIsNew,
        destroyed: isAgentChatDestroyed(requested),
        prompt: request.prompt,
      });

      if (action === "abort") {
        attachedChatRef.current.delete(request.taskId);
        return;
      }

      attachedChatRef.current.set(request.taskId, requested);
      if (sessionId) agentMarkedRef.current.add(sessionId);
      const replyParent = request.replyParentCommentId?.trim();
      if (replyParent) {
        liveReplyParentByTask.set(request.taskId, replyParent);
      } else {
        liveReplyParentByTask.delete(request.taskId);
      }
      bumpActivity();

      if (action === "noop") return;

      if (action === "prompt-in-tui" && request.prompt?.trim()) {
        if (sessionId) {
          markLiveSessionWorking(sessionId);
        }
        if (autoMarkInProgressRef.current) {
          void markTaskInProgressForAgent(clientRef.current, request.taskId);
        }
        void submitPtyAgentPrompt({
          taskId: request.taskId,
          prompt: request.prompt.trim(),
        });
        return;
      }

      const resume = cursorAgentResumeCommand(requested, request.prompt);
      if (action === "quit-then-shell-resume") {
        if (sessionId) {
          markLiveSessionWorking(sessionId);
        }
        if (autoMarkInProgressRef.current) {
          void markTaskInProgressForAgent(clientRef.current, request.taskId);
        }
        sendInput(request.taskId, cursorAgentQuitText());
        window.setTimeout(() => sendInput(request.taskId, resume), 600);
        return;
      }

      if (sessionId) {
        markLiveSessionWorking(sessionId);
      }
      if (autoMarkInProgressRef.current) {
        void markTaskInProgressForAgent(clientRef.current, request.taskId);
      }
      sendInput(request.taskId, resume);
    },
    [
      bumpActivity,
      cwd,
      disposeEntry,
      ensureEntry,
      isAgentTuiOpen,
      projectLabel,
      sendInput,
      taskDisplayId,
    ],
  );

  useEffect(() => {
    if (kind !== "agent") return;
    if (!agentAttachRequest) return;
    runAttach(agentAttachRequest);
    onAgentAttachRequestHandled?.();
  }, [agentAttachRequest, kind, onAgentAttachRequestHandled, runAttach]);

  useEffect(() => {
    if (kind !== "agent") return;
    if (!agentEndRequest) return;
    const forTaskId = agentEndRequest.taskId;
    const chatId = agentEndRequest.chatId.trim().toLowerCase();
    if (chatId) markAgentChatDestroyed(chatId);

    const key = sessionKey(forTaskId, "agent");
    const sessionId = sessionByKeyRef.current.get(key) ?? null;

    // Hide the viewport until core clears agentChatId (or a new attach).
    // Always-open without Start-agent UX keeps a shell, so skip suppress there.
    if (!alwaysOpen || onStartAgent) {
      setSuppressedAgentTasks((prev) => {
        const next = new Set(prev);
        next.add(forTaskId);
        return next;
      });
    }

    void (async () => {
      liveViewerReconcile.delete(forTaskId);
      // Clear Working… before/while kill — chat UI also keys off live activity.
      clearLiveAgentWorkingForTask(forTaskId);
      if (sessionId) {
        await killPtySession(sessionId);
        forgetLivePtySession(sessionId);
      }
      markAgentCliLeft(forTaskId, sessionId ?? "");
      if (!sessionId) {
        attachedChatRef.current.delete(forTaskId);
      }
      bumpActivity();
      // Codebase layout with Start-agent UX returns to the start square.
      // Legacy always-open (no onStartAgent) keeps a live shell after Stop.
      if (
        alwaysOpen &&
        !onStartAgent &&
        forTaskId === taskId &&
        !collapsed &&
        layoutReady
      ) {
        const entry = ensureEntry(forTaskId, "agent");
        const host = agentHostRef.current;
        if (entry && host && hostHasLayout(host)) {
          showEntryInHost(host, entry);
        }
      }
    })();

    onAgentEndRequestHandled?.();
  }, [
    agentEndRequest,
    alwaysOpen,
    bumpActivity,
    collapsed,
    ensureEntry,
    kind,
    layoutReady,
    markAgentCliLeft,
    onAgentEndRequestHandled,
    onStartAgent,
    taskId,
  ]);

  useEffect(() => {
    if (!taskId || collapsed || !layoutReady) return;

    // Plain shell or codebase always-open: connect immediately.
    if (kind === "shell" || alwaysOpen) {
      if (alwaysOpen && suppressedAgentTasks.has(taskId)) return;
      // Bound agent: layout owns leave→return via forceReattach. Do not open a
      // competing viewer here — that races reconcile and skips hard recreate.
      if (alwaysOpen && kind === "agent" && boundAgentChatId?.trim()) {
        const live = entriesRef.current.get(sessionKey(taskId, "agent"));
        if (live && !live.disposed) {
          const host = agentHostRef.current;
          if (host && hostHasLayout(host)) {
            // No SIGWINCH dance on every effect re-run — only fit/resize if needed.
            showEntryInHost(host, live);
          }
        }
        return;
      }
      // Start-agent UX: leave the pane empty until the user starts a session.
      if (
        alwaysOpen &&
        kind === "agent" &&
        onStartAgent &&
        !boundAgentChatId?.trim() &&
        !agentAttachRequest
      ) {
        return;
      }
      // Unbound codebase pane (legacy): plain shell until Start Agent creates Herdr.
      const connectKind: PtySessionKind =
        kind === "shell" ||
        (alwaysOpen && kind === "agent" && !boundAgentChatId?.trim())
          ? "shell"
          : "agent";
      const entry = ensureEntry(taskId, connectKind);
      if (!entry) return;
      const host = agentHostRef.current;
      if (!host || !hostHasLayout(host)) return;
      showEntryInHost(host, entry);
      return;
    }

    if (suppressedAgentTasks.has(taskId)) return;
    const key = sessionKey(taskId, "agent");
    const live = entriesRef.current.get(key);
    const hasLive = Boolean(live && !live.disposed);
    const hasBound = Boolean(boundAgentChatId?.trim());
    if (!hasLive && !hasBound && !agentAttachRequest) return;

    const entry = ensureEntry(taskId, "agent");
    if (!entry) return;
    const host = agentHostRef.current;
    if (!host || !hostHasLayout(host)) return;
    showEntryInHost(host, entry);
  }, [
    agentAttachRequest,
    alwaysOpen,
    boundAgentChatId,
    collapsed,
    ensureEntry,
    kind,
    layoutReady,
    onStartAgent,
    suppressedAgentTasks,
    taskId,
  ]);

  useEffect(() => {
    if (!taskId || collapsed || !layoutReady || focusRequest <= 0) return;
    if (kind === "agent" && !alwaysOpen && suppressedAgentTasks.has(taskId)) {
      return;
    }
    const entry = entriesRef.current.get(sessionKey(taskId, kind));
    if (entry && !entry.disposed) entry.term.focus();
  }, [
    alwaysOpen,
    collapsed,
    focusRequest,
    kind,
    layoutReady,
    suppressedAgentTasks,
    taskId,
  ]);

  /**
   * Escape while the terminal has focus → blur only.
   * A second Escape (outside the terminal) is handled by escape-back navigation.
   */
  useEffect(() => {
    if (collapsed) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      const host = agentHostRef.current;
      const target = event.target;
      if (!host || !(target instanceof HTMLElement)) return;
      if (!host.contains(target)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [collapsed]);

  /**
   * Codebase task layout (`alwaysOpen`): Tab toggles terminal focus ↔ unfocused
   * so task shortcuts work, matching the non-codebase agent composer Tab flow.
   * Capture-phase so Tab is not forwarded into the PTY as a literal tab.
   */
  useEffect(() => {
    if (collapsed || !alwaysOpen) return;

    function isInsideTerminal(el: EventTarget | null): boolean {
      const host = agentHostRef.current;
      return Boolean(host && el instanceof Node && host.contains(el));
    }

    function isEditableFocusTarget(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      // xterm's helper textarea counts as editable — handle via isInsideTerminal.
      if (isInsideTerminal(el)) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.isContentEditable) return true;
      if (
        el.closest(
          ".cm-editor, .cm-content, [data-document-editor-root='codemirror']",
        )
      ) {
        return true;
      }
      return false;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key !== "Tab" ||
        event.shiftKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.closest("[data-compose-modal]")) return;
        if (target.closest("[data-command-palette]")) return;
        if (target.closest("[data-searchable-dropdown-panel]")) return;
      }

      const active = document.activeElement;
      if (isInsideTerminal(active) || isInsideTerminal(target)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (active instanceof HTMLElement) {
          active.blur();
        }
        return;
      }

      // Leave other editors / comment composers alone (their own Tab flows).
      if (isEditableFocusTarget(active)) return;

      if (!taskId) return;
      const entry = entriesRef.current.get(sessionKey(taskId, kind));
      if (!entry || entry.disposed) return;
      const host = agentHostRef.current;
      if (!host || host.hidden || !hostHasLayout(host)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      entry.term.focus();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [alwaysOpen, collapsed, kind, taskId]);

  useEffect(() => {
    const id = taskId;
    const ptyKind: PtySessionKind = kind === "shell" ? "shell" : "agent";
    return () => {
      if (!id) return;
      try {
        agentHostRef.current?.replaceChildren();
      } catch {
        /* ignore */
      }
      // Leave = drop the viewer only. Sidecar PTY / agent keep running.
      detachAgentViewport(id, ptyKind);
    };
  }, [kind, taskId]);

  useEffect(() => {
    void activityTick;
    const workingTaskIds: string[] = [];
    const openTaskIds: string[] = [];
    const statusItems: StatusBarAgentItem[] = [];
    const activityBySessionId: Record<string, AgentActivity> = {};

    for (const [key, sessionId] of sessionByKeyRef.current) {
      if (!key.endsWith(":agent")) continue;
      const tid = key.slice(0, -":agent".length);
      const activity = activityRef.current.get(sessionId) ?? null;
      if (activity) activityBySessionId[sessionId] = activity;
      // Explicit idle wins over optimistic liveWorkingTaskIds marks.
      const isWorking =
        activity === "idle"
          ? false
          : activity === "working" || liveWorkingTaskIds.has(tid);
      if (activity === "idle" && liveWorkingTaskIds.has(tid)) {
        liveWorkingTaskIds.delete(tid);
      }
      if (isWorking) {
        workingTaskIds.push(tid);
      }
      const tuiOpen = isAgentTuiOpen(tid, sessionId);
      // Keep Working… agents in the status bar after leave (viewer detached).
      // isAgentTuiOpen requires a live socket, so background turns would
      // otherwise disappear and look Idle.
      if (!tuiOpen && !isWorking && activity !== "attention") continue;
      if (tuiOpen) openTaskIds.push(tid);
      statusItems.push({
        taskId: tid,
        projectId,
        projectLabel: projectLabel || "Task",
        activity: isWorking ? "working" : (activity ?? "present"),
      });
    }

    // Tasks marked working before a session id was known.
    for (const tid of liveWorkingTaskIds) {
      if (!workingTaskIds.includes(tid)) workingTaskIds.push(tid);
    }

    onAgentActivitySummaryChange?.(summarizeAgentActivity(activityBySessionId));
    onWorkingTaskIdsChange?.(workingTaskIds);
    onAgentOpenTaskIdsChange?.(openTaskIds);
    onAgentStatusItemsChange?.(statusItems);
  }, [
    activityTick,
    isAgentTuiOpen,
    kind,
    onAgentActivitySummaryChange,
    onAgentOpenTaskIdsChange,
    onAgentStatusItemsChange,
    onWorkingTaskIdsChange,
    projectId,
    projectLabel,
  ]);

  if (!taskId) {
    return (
      <div className="desktop-terminal-panel desktop-terminal-panel--empty">
        <p>Select a task to open a terminal.</p>
      </div>
    );
  }

  const isShell = kind === "shell";
  const liveAgent = entriesRef.current.get(sessionKey(taskId, "agent"));
  const agentSuppressed = suppressedAgentTasks.has(taskId);
  const hasBoundOrLiveAgent =
    !agentSuppressed &&
    (Boolean(boundAgentChatId?.trim()) ||
      Boolean(liveAgent && !liveAgent.disposed) ||
      Boolean(agentAttachRequest));
  // With Start-agent UX, codebase panes stay empty until a session exists.
  const showAgentViewport =
    isShell ||
    hasBoundOrLiveAgent ||
    (alwaysOpen && !onStartAgent);
  const showAgentPlaceholder =
    !isShell && !collapsed && !showAgentViewport;
  const showStopChrome =
    Boolean(onStopAgent) && showAgentViewport && !collapsed && !isShell;

  return (
    <div
      className={`desktop-terminal-panel${collapsed ? " is-collapsed" : ""}${
        variant === "chat" ? " desktop-terminal-panel--chat" : ""
      }`}
    >
      {showAgentPlaceholder ? (
        onStartAgent ? (
          <button
            type="button"
            className="desktop-terminal-panel__start"
            disabled={startingAgent}
            aria-busy={startingAgent || undefined}
            aria-label={startingAgent ? "Creating agent" : "Start agent"}
            title="Start a new agent session bound to this task"
            onClick={() => onStartAgent()}
          >
            <span className="desktop-terminal-panel__start-label">
              {startingAgent ? "Creating…" : "Start agent"}
            </span>
          </button>
        ) : (
          <div className="desktop-terminal-panel__placeholder">
            <p>
              {variant === "chat"
                ? "Start an agent to open a chat session here."
                : "Start an agent to open a session here."}
            </p>
          </div>
        )
      ) : null}
      {showStopChrome ? (
        <div className="desktop-terminal-panel__chrome">
          <button
            type="button"
            className="desktop-terminal-panel__stop"
            aria-label="Stop agent"
            title="Stop agent — kill the local PTY and clear this task's agent chat"
            onClick={() => onStopAgent?.()}
          >
            Stop
          </button>
        </div>
      ) : null}
      <div
        ref={agentHostRef}
        className={[
          "desktop-terminal-panel__host",
          variant === "chat" ? "desktop-terminal-panel__host--chat" : "",
          kind === "agent" ? "desktop-terminal-panel__host--agent" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        hidden={collapsed || showAgentPlaceholder}
      />
    </div>
  );
}

export { emptyAgentActivitySummary };
