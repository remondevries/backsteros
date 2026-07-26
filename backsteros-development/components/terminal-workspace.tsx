"use client";

import { CanvasAddon } from "@xterm/addon-canvas";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  CURSOR_AI_TAB_TITLE,
  isCursorAgentTitle,
  terminalTabTitleFromOsc,
} from "@/lib/cursor-agent-title";
import {
  CursorAgentIcon,
  TerminalHeaderIcon,
} from "@/components/panel-icons";
import {
  AGENT_CLI_LEAVE_DEBOUNCE_MS,
  isAgentCliOpenFromSignals,
} from "@/lib/agent-cli-open";
import {
  detectAgentActivityFromTitle,
  emptyAgentActivitySummary,
  isAgentActivelyWorking,
  AGENT_WORKING_IDLE_FALLBACK_MS,
  summarizeAgentActivity,
  type AgentActivity,
  type AgentActivitySummary,
  type StatusBarAgentItem,
  pickPreferredAgentActivity,
} from "@/lib/agent-activity";
import {
  parseAgentTurnUsage,
  type AgentTurnCompleteReason,
  type AgentTurnCompletedEvent,
  type AgentTurnUsage,
} from "@/lib/agent-turn";
import {
  CURSOR_AGENT_CLEAR_COMPOSER_DELAY_MS,
  CURSOR_AGENT_OPEN_PROMPT_SUBMIT_DELAY_MS,
  CURSOR_AGENT_QUIT_THEN_RESUME_DELAY_MS,
  cursorAgentClearComposerKeys,
  cursorAgentQuitText,
  cursorAgentResumeCommand,
  cursorAgentSubmitKey,
  resolveAgentTerminalAction,
  shellClearCommand,
  type AgentAttachRequest,
  type AgentEndRequest,
  type AgentTerminalAction,
} from "@/lib/cursor-agent-cli";
import { getPtyWebSocketUrl } from "@/lib/pty";
import {
  readSessionBuckets,
  readWorkingTaskIds,
  writeSessionBuckets,
  writeWorkingTaskIds,
  type PersistedBuckets,
} from "@/lib/session-persistence";
import {
  isAgentChatDestroyed,
  listTaskAgentSessions,
  markAgentChatDestroyed,
  readTaskAgentSessions,
} from "@/lib/task-agent-sessions";

type WorkspaceSession = {
  id: string;
  kind: "terminal";
  title: string;
  defaultTitle: string;
  projectId: string | null;
  projectLabel: string;
  cwd: string | null;
  /** One-shot shell input after the PTY is ready (not persisted). */
  pendingInput?: string;
};

type TaskSessionBucket = {
  /** Always zero or one terminal session per task. */
  sessions: WorkspaceSession[];
  activeId: string | null;
};

type TerminalEntry = {
  term: Terminal;
  fit: FitAddon;
  canvas: CanvasAddon | null;
  socket: WebSocket | null;
  /** Directory the live PTY was spawned with (may differ from session.cwd). */
  spawnedCwd: string | null;
  disposeData: { dispose: () => void } | null;
  disposeResize: { dispose: () => void } | null;
  disposeTitle: { dispose: () => void } | null;
  resizeObserver: ResizeObserver | null;
  /** Set before teardown so async fit/scroll callbacks no-op. */
  disposed: boolean;
};

const TERMINAL_THEME = {
  background: "#111111",
  foreground: "#ededed",
  cursor: "#ee7a47",
  cursorAccent: "#111111",
  selectionBackground: "#ee7a426b",
  selectionForeground: "#ffffff",
  black: "#1c1c1c",
  red: "#ff5f5f",
  green: "#44d18a",
  yellow: "#e5c07b",
  blue: "#61afef",
  magenta: "#c678dd",
  cyan: "#56b6c2",
  white: "#d0d0d0",
  brightBlack: "#7a7a7a",
  brightRed: "#ff7b72",
  brightGreen: "#3dd68c",
  brightYellow: "#f0d48a",
  brightBlue: "#79b8ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#76e3ea",
  brightWhite: "#ffffff",
} as const;

const TERMINAL_FONT_SIZE = 13;

/** One Nerd Font family for text + icons so cell metrics stay consistent. */
const TERMINAL_FONT_FAMILY = [
  '"MesloLGS Nerd Font"',
  '"MesloLGS NF"',
  '"JetBrainsMono Nerd Font"',
  '"Hack Nerd Font"',
  '"Symbols Nerd Font Mono"',
  '"SF Mono"',
  "Menlo",
  "Monaco",
  "monospace",
].join(", ");

const TERMINAL_FONT_LOAD_FAMILIES = [
  "MesloLGS Nerd Font",
  "MesloLGS NF",
  "JetBrainsMono Nerd Font",
  "Hack Nerd Font",
  "Symbols Nerd Font Mono",
  "SF Mono",
  "Menlo",
] as const;

/** Bump when appearance/renderer defaults change so live PTYs recreate. */
const TERMINAL_APPEARANCE_REVISION = "webkit-dom-renderer-nerd-fonts-1";
let appliedTerminalAppearanceRevision: string | null = null;
let xtermRendererErrorGuardInstalled = false;

function isWebKitTerminalHost(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // Tauri macOS uses WKWebView (AppleWebKit without Chrome/).
  return /AppleWebKit/i.test(ua) && !/Chrome\//i.test(ua) && !/Chromium\//i.test(ua);
}

/**
 * xterm 5.x can schedule Viewport.syncScrollArea on a rAF after dispose has
 * already cleared `_renderer`, or while the host is still entering (opacity 0).
 * That throw is async and uncatchable from our dispose path — suppress only
 * this known benign race.
 */
function installXtermRendererErrorGuard() {
  if (typeof window === "undefined" || xtermRendererErrorGuardInstalled) {
    return;
  }
  xtermRendererErrorGuardInstalled = true;

  const isBenignRendererRace = (value: unknown): boolean => {
    const message =
      value instanceof Error
        ? value.message
        : typeof value === "string"
          ? value
          : "";
    if (!message) return false;
    // Chromium: "Cannot read properties of undefined (reading 'dimensions')"
    // Firefox:  "can't access property \"dimensions\", this._renderer.value is undefined"
    return (
      message.includes("_renderer.value") ||
      message.includes("_renderer") ||
      (message.includes("dimensions") &&
        (message.includes("undefined") || message.includes("null")))
    );
  };

  window.addEventListener(
    "error",
    (event) => {
      if (
        isBenignRendererRace(event.error) ||
        isBenignRendererRace(event.message)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  window.addEventListener(
    "unhandledrejection",
    (event) => {
      if (isBenignRendererRace(event.reason)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
}

// Install as soon as this module evaluates in the browser — before any
// useEffect that might open/fit a terminal.
if (typeof window !== "undefined") {
  installXtermRendererErrorGuard();
}

async function ensureTerminalFontsLoaded() {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  await Promise.allSettled([
    document.fonts.ready,
    ...TERMINAL_FONT_LOAD_FAMILIES.map((family) =>
      document.fonts.load(`${TERMINAL_FONT_SIZE}px "${family}"`),
    ),
  ]);
}

function applyTerminalAppearance(term: Terminal) {
  term.options.fontFamily = TERMINAL_FONT_FAMILY;
  term.options.fontSize = TERMINAL_FONT_SIZE;
  term.options.lineHeight = 1;
  term.options.letterSpacing = 0;
  term.options.customGlyphs = true;
}

/** Fit only when the host has a real layout box (hidden panes are 0×0). */
function fitTerminal(entry: TerminalEntry, host?: HTMLElement | null): boolean {
  if (entry.disposed) return false;
  // After dispose(), xterm clears the renderer; fit/scroll must not run.
  if (!entry.term.element) return false;
  const el =
    host ??
    (entry.term.element.parentElement instanceof HTMLElement
      ? entry.term.element.parentElement
      : null);
  if (!el) return false;
  if (el.clientWidth < 24 || el.clientHeight < 24) return false;
  // Entering panels use opacity/aria-hidden — fitting here races the renderer.
  if (el.closest('[aria-hidden="true"]')) return false;
  try {
    entry.fit.fit();
    return true;
  } catch {
    return false;
  }
}

function createSessionId() {
  return `term-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function sendPtyMessage(
  socket: WebSocket | null,
  message: Record<string, unknown>,
) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function createTerminalSession(input: {
  projectId: string | null;
  projectLabel: string;
  cwd: string | null;
  pendingInput?: string;
}): WorkspaceSession {
  const defaultTitle =
    input.projectLabel === "No project" ? "shell" : input.projectLabel;
  return {
    id: createSessionId(),
    kind: "terminal",
    title: defaultTitle,
    defaultTitle,
    projectId: input.projectId,
    projectLabel: input.projectLabel,
    cwd: input.cwd,
    pendingInput: input.pendingInput,
  };
}

/**
 * Resolve the spawn directory for a session. Never use another project's live
 * work-folder for a parked session — that left shells in the wrong tree.
 */
function resolveSessionCwd(
  session: WorkspaceSession,
  liveCwd: string | null,
  liveProjectId: string | null,
): string | null {
  if (session.projectId && liveProjectId && session.projectId === liveProjectId) {
    return liveCwd ?? session.cwd;
  }
  if (session.cwd) return session.cwd;
  return null;
}

function toPersistedBuckets(
  buckets: Record<string, TaskSessionBucket>,
): PersistedBuckets {
  const out: PersistedBuckets = {};
  for (const [taskId, bucket] of Object.entries(buckets)) {
    const session = bucket.sessions[0];
    out[taskId] = {
      activeId: session?.id ?? null,
      sessions: session
        ? [
            {
              id: session.id,
              kind: "terminal" as const,
              title: session.title,
              defaultTitle: session.defaultTitle,
              projectId: session.projectId,
              projectLabel: session.projectLabel,
              cwd: session.cwd,
            },
          ]
        : [],
    };
  }
  return out;
}

function fromPersistedBuckets(
  buckets: PersistedBuckets,
): Record<string, TaskSessionBucket> {
  const out: Record<string, TaskSessionBucket> = {};
  for (const [taskId, bucket] of Object.entries(buckets)) {
    const session = bucket.sessions[0];
    out[taskId] = {
      activeId: session?.id ?? null,
      sessions: session
        ? [
            {
              id: session.id,
              kind: "terminal" as const,
              title: session.title,
              defaultTitle: session.defaultTitle,
              projectId: session.projectId,
              projectLabel: session.projectLabel,
              cwd: session.cwd,
            },
          ]
        : [],
    };
  }
  return out;
}

export function TerminalWorkspace({
  projectId,
  projectLabel,
  taskId = null,
  onActiveTabIdChange,
  onAgentActivitySummaryChange,
  onWorkingTaskIdsChange,
  onWorkingProjectIdsChange,
  onAgentStatusItemsChange,
  onTaskAgentBecameWorking,
  onTaskAgentBecameIdle,
  onTaskAgentBecameAttention,
  onAgentTurnCompleted,
  agentAttachRequest = null,
  onAgentAttachRequestHandled,
  agentEndRequest = null,
  onAgentEndRequestHandled,
  onAgentOpenTaskIdsChange,
  cwd = null,
  collapsed = false,
  layoutReady = true,
  showHeader = true,
  focusRequest = 0,
}: {
  projectId: string | null;
  projectLabel: string;
  taskId?: string | null;
  onActiveTabIdChange?: (tabId: string | null) => void;
  onAgentActivitySummaryChange?: (summary: AgentActivitySummary) => void;
  /** Task ids with at least one agent session currently active (not idle). */
  onWorkingTaskIdsChange?: (taskIds: string[]) => void;
  /** Project ids that currently have at least one working agent task. */
  onWorkingProjectIdsChange?: (projectIds: string[]) => void;
  /** Active agent tasks for the status-bar hover list. */
  onAgentStatusItemsChange?: (items: StatusBarAgentItem[]) => void;
  /** Fired when a task's agent enters a working turn. */
  onTaskAgentBecameWorking?: (taskId: string) => void;
  /** Fired when a task's agent finishes a turn (idle). */
  onTaskAgentBecameIdle?: (taskId: string) => void;
  /** Fired when a task's agent needs user input / approval (attention). */
  onTaskAgentBecameAttention?: (taskId: string) => void;
  /** Fired once per completed working turn with duration + token usage. */
  onAgentTurnCompleted?: (event: AgentTurnCompletedEvent) => void;
  /** Resume a Cursor Agent chat in the task's terminal. */
  agentAttachRequest?: AgentAttachRequest | null;
  onAgentAttachRequestHandled?: () => void;
  /** Run `/quit` when this chat is attached in the task terminal. */
  agentEndRequest?: AgentEndRequest | null;
  onAgentEndRequestHandled?: () => void;
  /**
   * Task ids whose terminal currently has the Cursor Agent TUI open
   * (including idle between turns). Drives View agent vs Stop agent.
   */
  onAgentOpenTaskIdsChange?: (taskIds: readonly string[]) => void;
  cwd?: string | null;
  collapsed?: boolean;
  /**
   * False while the terminal column is still entering (opacity 0) or hidden.
   * Skips fit/remeasure until the host is actually painted.
   */
  layoutReady?: boolean;
  /** When false, host chrome owns the pane header. */
  showHeader?: boolean;
  /**
   * Increment to focus the active xterm (e.g. after Inbox Enter opens
   * the terminal column). Re-runs when layout becomes ready.
   */
  focusRequest?: number;
}) {
  const [bucketsByTaskId, setBucketsByTaskId] = useState<
    Record<string, TaskSessionBucket>
  >(() => fromPersistedBuckets(readSessionBuckets()));
  const [activityBySessionId, setActivityBySessionId] = useState<
    Record<string, AgentActivity>
  >({});
  const bucketsByTaskIdRef = useRef(bucketsByTaskId);
  const layoutReadyRef = useRef(layoutReady);
  const onTaskAgentBecameWorkingRef = useRef(onTaskAgentBecameWorking);
  const onTaskAgentBecameIdleRef = useRef(onTaskAgentBecameIdle);
  const onTaskAgentBecameAttentionRef = useRef(onTaskAgentBecameAttention);
  const onAgentTurnCompletedRef = useRef(onAgentTurnCompleted);
  /** Wall-clock start of the current working turn per session. */
  const turnStartedAtRef = useRef(new Map<string, number>());
  /** Latest stop-hook usage snapshot for the session (cleared when turn ends). */
  const turnUsageBySessionRef = useRef(new Map<string, AgentTurnUsage>());
  /** Last afterAgentResponse text for the current turn (cleared when turn ends). */
  const lastAssistantTextBySessionRef = useRef(new Map<string, string>());
  /**
   * CLI often delivers `stop` before `afterAgentResponse`. Defer turn-complete
   * briefly so the final message can land before we review/hold.
   */
  const pendingStopEmitRef = useRef(
    new Map<
      string,
      {
        timer: ReturnType<typeof setTimeout>;
        taskId: string;
        reason: AgentTurnCompleteReason;
        abrupt: boolean;
      }
    >(),
  );
  /** Why the next working→idle transition should report turn completed. */
  const turnCompleteReasonBySessionRef = useRef(
    new Map<string, AgentTurnCompleteReason>(),
  );
  const hostsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const termsRef = useRef<Map<string, TerminalEntry>>(new Map());
  const previousProjectIdRef = useRef<string | null>(projectId);
  const persistReadyRef = useRef(false);

  useEffect(() => {
    bucketsByTaskIdRef.current = bucketsByTaskId;
  }, [bucketsByTaskId]);

  useEffect(() => {
    layoutReadyRef.current = layoutReady;
  }, [layoutReady]);

  useEffect(() => {
    onTaskAgentBecameWorkingRef.current = onTaskAgentBecameWorking;
  }, [onTaskAgentBecameWorking]);

  useEffect(() => {
    onTaskAgentBecameIdleRef.current = onTaskAgentBecameIdle;
  }, [onTaskAgentBecameIdle]);

  useEffect(() => {
    onTaskAgentBecameAttentionRef.current = onTaskAgentBecameAttention;
  }, [onTaskAgentBecameAttention]);

  useEffect(() => {
    onAgentTurnCompletedRef.current = onAgentTurnCompleted;
  }, [onAgentTurnCompleted]);

  const findTaskIdForSession = useCallback((sessionId: string): string | null => {
    for (const [bucketTaskId, bucket] of Object.entries(
      bucketsByTaskIdRef.current,
    )) {
      if (bucket.sessions.some((session) => session.id === sessionId)) {
        return bucketTaskId;
      }
    }
    return null;
  }, []);

  const emitTurnCompletedRef = useRef<
    | ((
        sessionId: string,
        taskIdForSession: string,
        meta: { reason: AgentTurnCompleteReason; abrupt: boolean },
      ) => void)
    | null
  >(null);

  const notifyActivityTransition = useCallback(
    (
      taskIdForSession: string,
      sessionId: string,
      previous: AgentActivity | null,
      nextActivity: AgentActivity,
    ) => {
      const wasWorking = previous === "working";
      // Working → In Progress is fired from markTurnWorking (armed turn),
      // not here — avoids a double PATCH when setSessionActivity mirrors it.
      if (nextActivity === "attention" && previous !== "attention") {
        onTaskAgentBecameAttentionRef.current?.(taskIdForSession);
        clearIdleWatchRef.current?.(sessionId);
        agentTurnArmedRef.current.delete(sessionId);
      }
      if (wasWorking && nextActivity === "idle") {
        const reason =
          turnCompleteReasonBySessionRef.current.get(sessionId) ?? "stop";
        turnCompleteReasonBySessionRef.current.delete(sessionId);
        emitTurnCompletedRef.current?.(sessionId, taskIdForSession, {
          reason,
          abrupt: reason === "sessionEnd",
        });
        onTaskAgentBecameIdleRef.current?.(taskIdForSession);
        clearIdleWatchRef.current?.(sessionId);
        agentTurnArmedRef.current.delete(sessionId);
      }
      if (nextActivity === "idle") {
        agentTurnArmedRef.current.delete(sessionId);
      }
    },
    [],
  );

  const emitTurnCompleted = useCallback(
    (
      sessionId: string,
      taskIdForSession: string,
      meta: { reason: AgentTurnCompleteReason; abrupt: boolean },
    ) => {
      const startedAt = turnStartedAtRef.current.get(sessionId);
      turnStartedAtRef.current.delete(sessionId);
      const usage = turnUsageBySessionRef.current.get(sessionId) ?? null;
      turnUsageBySessionRef.current.delete(sessionId);
      const assistantText =
        lastAssistantTextBySessionRef.current.get(sessionId) ?? null;
      lastAssistantTextBySessionRef.current.delete(sessionId);
      const durationMs = Math.max(
        0,
        usage?.durationMs != null && usage.durationMs > 0
          ? usage.durationMs
          : startedAt
            ? Date.now() - startedAt
            : 0,
      );
      // Ignore flicker / accidental working blips — but always emit on real
      // Cursor stop/sessionEnd (hold/review) and abrupt exits.
      if (
        meta.abrupt ||
        meta.reason === "stop" ||
        meta.reason === "sessionEnd" ||
        durationMs >= 1000 ||
        (usage?.totalTokens ?? 0) > 0
      ) {
        onAgentTurnCompletedRef.current?.({
          taskId: taskIdForSession,
          durationMs,
          inputTokens: usage?.inputTokens ?? null,
          outputTokens: usage?.outputTokens ?? null,
          cacheReadTokens: usage?.cacheReadTokens ?? null,
          cacheWriteTokens: usage?.cacheWriteTokens ?? null,
          totalTokens: usage?.totalTokens ?? null,
          chatId:
            usage?.conversationId ??
            attachedChatByTaskIdRef.current.get(taskIdForSession) ??
            null,
          status: usage?.status ?? null,
          assistantText,
          reason: meta.reason,
          abrupt: meta.abrupt,
        });
      }
    },
    [],
  );
  emitTurnCompletedRef.current = emitTurnCompleted;

  const clearIdleWatchRef = useRef<((sessionId: string) => void) | null>(null);
  /** Sessions where the user (or auto-launch) submitted a turn and we expect work. */
  const agentTurnArmedRef = useRef(new Set<string>());
  /**
   * Sticky busy until definitive turn end (`stop` / sessionEnd / long fallback).
   * Stops OSC "ready" titles and short quiet gaps from flickering list dots.
   */
  const stickyWorkingSessionsRef = useRef(new Set<string>());
  const stickyWorkingTaskIdsRef = useRef(new Set(readWorkingTaskIds()));
  const [stickyWorkingTaskIds, setStickyWorkingTaskIds] = useState<string[]>(
    () => [...stickyWorkingTaskIdsRef.current].sort(),
  );
  const activityBySessionIdRef = useRef(activityBySessionId);
  activityBySessionIdRef.current = activityBySessionId;

  const setSessionActivity = useCallback(
    (sessionId: string, nextActivity: AgentActivity) => {
      let previous: AgentActivity | null = null;
      let changed = false;
      setActivityBySessionId((current) => {
        previous = current[sessionId] ?? null;
        if (previous === nextActivity) return current;
        changed = true;
        const next = { ...current, [sessionId]: nextActivity };
        // Keep ref in sync immediately so stream/idle logic isn't stale
        // until the next render.
        activityBySessionIdRef.current = next;
        return next;
      });
      if (!changed) return;
      const taskIdForSession = findTaskIdForSession(sessionId);
      if (!taskIdForSession) return;
      // Run status callbacks outside the setState updater.
      queueMicrotask(() => {
        notifyActivityTransition(
          taskIdForSession,
          sessionId,
          previous,
          nextActivity,
        );
      });
    },
    [findTaskIdForSession, notifyActivityTransition],
  );

  const publishStickyWorkingTasks = useCallback(() => {
    const next = [...stickyWorkingTaskIdsRef.current].sort();
    writeWorkingTaskIds(next);
    setStickyWorkingTaskIds((current) => {
      if (
        current.length === next.length &&
        current.every((id, index) => id === next[index])
      ) {
        return current;
      }
      return next;
    });
  }, []);

  const markTurnWorking = useCallback(
    (sessionId: string) => {
      const previous = activityBySessionIdRef.current[sessionId] ?? null;
      const startingFreshTurn = previous !== "working";
      stickyWorkingSessionsRef.current.add(sessionId);
      agentTurnArmedRef.current.add(sessionId);
      const taskIdForSession = findTaskIdForSession(sessionId);
      if (taskIdForSession) {
        stickyWorkingTaskIdsRef.current.add(taskIdForSession);
        publishStickyWorkingTasks();
        // Every fresh turn (including the 2nd+ after In Review / On Hold)
        // moves the task back to In Progress and clears prior assistant text.
        if (startingFreshTurn) {
          turnStartedAtRef.current.set(sessionId, Date.now());
          lastAssistantTextBySessionRef.current.delete(sessionId);
          onTaskAgentBecameWorkingRef.current?.(taskIdForSession);
        }
      }
      setSessionActivity(sessionId, "working");
    },
    [findTaskIdForSession, publishStickyWorkingTasks, setSessionActivity],
  );

  const clearTurnWorking = useCallback(
    (sessionId: string) => {
      stickyWorkingSessionsRef.current.delete(sessionId);
      agentTurnArmedRef.current.delete(sessionId);
      const taskIdForSession = findTaskIdForSession(sessionId);
      if (taskIdForSession) {
        let stillWorking = false;
        for (const otherId of stickyWorkingSessionsRef.current) {
          if (findTaskIdForSession(otherId) === taskIdForSession) {
            stillWorking = true;
            break;
          }
        }
        if (!stillWorking) {
          stickyWorkingTaskIdsRef.current.delete(taskIdForSession);
          publishStickyWorkingTasks();
        }
      }
    },
    [findTaskIdForSession, publishStickyWorkingTasks],
  );

  const lastOutputAtRef = useRef<Map<string, number>>(new Map());
  const outputBytesWhileWorkingRef = useRef<Map<string, number>>(new Map());
  const idleWatchTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(
    new Map(),
  );
  /** Sessions known to be Cursor Agent (launched or OSC-renamed). */
  const cursorAgentSessionIdsRef = useRef(new Set<string>());
  /**
   * Sessions that have shown a real Cursor Agent OSC title at least once.
   * Used so a shell title right after `agent --resume` doesn't clear "open".
   */
  const agentTitleConfirmedRef = useRef(new Set<string>());
  /**
   * Sessions that have received a live agent-hook this PTY lifetime (cleared
   * on sessionEnd). Stronger than markAsAgent-from-resume alone.
   */
  const agentHookLiveSessionsRef = useRef(new Set<string>());
  /** Last chat id we resumed into each task terminal (for End matching + open UI). */
  const attachedChatByTaskIdRef = useRef(new Map<string, string>());
  const [agentOpenTaskIds, setAgentOpenTaskIds] = useState<string[]>([]);
  const onAgentOpenTaskIdsChangeRef = useRef(onAgentOpenTaskIdsChange);
  useEffect(() => {
    onAgentOpenTaskIdsChangeRef.current = onAgentOpenTaskIdsChange;
  }, [onAgentOpenTaskIdsChange]);

  /**
   * Agent TUI present in this task's PTY (idle between turns still counts).
   * Drives talk/quit gates and the Stop vs View button.
   */
  const isAgentCliOpenForTask = useCallback((forTaskId: string): boolean => {
    const session =
      bucketsByTaskIdRef.current[forTaskId]?.sessions[0] ?? null;
    if (!session) return false;
    const sessionId = session.id;
    const entry = termsRef.current.get(sessionId);
    const uiConnected = Boolean(
      entry &&
        !entry.disposed &&
        entry.socket &&
        entry.socket.readyState === WebSocket.OPEN,
    );
    return isAgentCliOpenFromSignals({
      uiConnected,
      hasAgentTitle:
        session.title === CURSOR_AI_TAB_TITLE ||
        isCursorAgentTitle(session.title),
      titleConfirmed: agentTitleConfirmedRef.current.has(sessionId),
      hookLive: agentHookLiveSessionsRef.current.has(sessionId),
      activity: activityBySessionIdRef.current[sessionId] ?? null,
      attached: attachedChatByTaskIdRef.current.has(forTaskId),
      markedAsAgent: cursorAgentSessionIdsRef.current.has(sessionId),
    });
  }, []);

  /** Debounced clear when OSC flips to a shell title but sessionEnd is missed. */
  const agentLeaveTimersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );

  const clearAgentLeaveTimer = useCallback((sessionId: string) => {
    const timer = agentLeaveTimersRef.current.get(sessionId);
    if (!timer) return;
    clearTimeout(timer);
    agentLeaveTimersRef.current.delete(sessionId);
  }, []);

  const publishAgentOpenTaskIds = useCallback(() => {
    const openIds = new Set<string>();
    for (const forTaskId of Object.keys(bucketsByTaskIdRef.current)) {
      if (isAgentCliOpenForTask(forTaskId)) openIds.add(forTaskId);
    }
    const sortedOpen = [...openIds].sort();
    setAgentOpenTaskIds((prev) => {
      if (
        prev.length === sortedOpen.length &&
        prev.every((id, index) => id === sortedOpen[index])
      ) {
        return prev;
      }
      return sortedOpen;
    });

    onAgentOpenTaskIdsChangeRef.current?.(sortedOpen);
  }, [isAgentCliOpenForTask]);

  // Re-evaluate whenever buckets or activity change so Stop vs View tracks
  // TUI open/close continuously.
  useEffect(() => {
    publishAgentOpenTaskIds();
  }, [activityBySessionId, bucketsByTaskId, publishAgentOpenTaskIds]);

  const setAttachedChatForTask = useCallback(
    (forTaskId: string, chatId: string | null) => {
      const normalized = chatId?.trim().toLowerCase() || null;
      const current = attachedChatByTaskIdRef.current.get(forTaskId) ?? null;
      if (current === normalized) return;
      if (normalized) {
        attachedChatByTaskIdRef.current.set(forTaskId, normalized);
      } else {
        attachedChatByTaskIdRef.current.delete(forTaskId);
      }
      publishAgentOpenTaskIds();
    },
    [publishAgentOpenTaskIds],
  );

  /**
   * Task ids that should run shell `clear` after the agent TUI exits
   * (sessionEnd). Set by End; cleared when clear is sent or timed out.
   */
  const pendingShellClearByTaskIdRef = useRef(new Set<string>());
  const pendingShellClearTimersRef = useRef(new Map<string, number>());
  const sendShellClearRef = useRef<(forTaskId: string) => void>(() => {});
  const flushPendingShellClearRef = useRef<(forTaskId: string) => void>(
    () => {},
  );
  const armIdleWatchRef = useRef<(sessionId: string) => void>(() => {});
  const setSessionActivityRef = useRef(setSessionActivity);
  setSessionActivityRef.current = setSessionActivity;
  const markTurnWorkingRef = useRef(markTurnWorking);
  markTurnWorkingRef.current = markTurnWorking;
  const clearTurnWorkingRef = useRef(clearTurnWorking);
  clearTurnWorkingRef.current = clearTurnWorking;

  const markCursorAgentSession = useCallback(
    (sessionId: string) => {
      clearAgentLeaveTimer(sessionId);
      const already = cursorAgentSessionIdsRef.current.has(sessionId);
      cursorAgentSessionIdsRef.current.add(sessionId);
      if (!already) publishAgentOpenTaskIds();
    },
    [clearAgentLeaveTimer, publishAgentOpenTaskIds],
  );

  const clearCursorAgentSession = useCallback(
    (sessionId: string) => {
      clearAgentLeaveTimer(sessionId);
      agentTitleConfirmedRef.current.delete(sessionId);
      agentHookLiveSessionsRef.current.delete(sessionId);
      cursorAgentSessionIdsRef.current.delete(sessionId);
      publishAgentOpenTaskIds();
    },
    [clearAgentLeaveTimer, publishAgentOpenTaskIds],
  );

  /** Agent TUI left this PTY — drop open marks so the button returns to View. */
  const markAgentCliLeftSession = useCallback(
    (sessionId: string) => {
      clearAgentLeaveTimer(sessionId);
      const forTaskId = findTaskIdForSession(sessionId);
      clearCursorAgentSession(sessionId);
      if (forTaskId) {
        setAttachedChatForTask(forTaskId, null);
        flushPendingShellClearRef.current(forTaskId);
      }
      setBucketsByTaskId((current) => {
        for (const [bucketTaskId, bucket] of Object.entries(current)) {
          const index = bucket.sessions.findIndex(
            (entry) => entry.id === sessionId,
          );
          if (index < 0) continue;
          const session = bucket.sessions[index];
          if (!session || session.title === session.defaultTitle) {
            return current;
          }
          const sessions = [...bucket.sessions];
          sessions[index] = { ...session, title: session.defaultTitle };
          return {
            ...current,
            [bucketTaskId]: { ...bucket, sessions },
          };
        }
        return current;
      });
    },
    [
      clearAgentLeaveTimer,
      clearCursorAgentSession,
      findTaskIdForSession,
      setAttachedChatForTask,
    ],
  );

  const scheduleAgentCliLeave = useCallback(
    (sessionId: string) => {
      clearAgentLeaveTimer(sessionId);
      const timer = setTimeout(() => {
        agentLeaveTimersRef.current.delete(sessionId);
        markAgentCliLeftSession(sessionId);
      }, AGENT_CLI_LEAVE_DEBOUNCE_MS);
      agentLeaveTimersRef.current.set(sessionId, timer);
    },
    [clearAgentLeaveTimer, markAgentCliLeftSession],
  );

  const isCursorAgentSession = useCallback(
    (sessionId: string): boolean => {
      if (cursorAgentSessionIdsRef.current.has(sessionId)) return true;
      for (const bucket of Object.values(bucketsByTaskIdRef.current)) {
        const session = bucket.sessions.find((entry) => entry.id === sessionId);
        if (!session) continue;
        if (
          session.title === CURSOR_AI_TAB_TITLE ||
          isCursorAgentTitle(session.title)
        ) {
          cursorAgentSessionIdsRef.current.add(sessionId);
          publishAgentOpenTaskIds();
          return true;
        }
      }
      return false;
    },
    [publishAgentOpenTaskIds],
  );

  const clearIdleWatch = useCallback((sessionId: string) => {
    const timer = idleWatchTimersRef.current.get(sessionId);
    if (timer) {
      clearInterval(timer);
      idleWatchTimersRef.current.delete(sessionId);
    }
    lastOutputAtRef.current.delete(sessionId);
    outputBytesWhileWorkingRef.current.delete(sessionId);
  }, []);

  clearIdleWatchRef.current = clearIdleWatch;

  const armIdleWatch = useCallback(
    (sessionId: string) => {
      clearIdleWatch(sessionId);
      lastOutputAtRef.current.set(sessionId, Date.now());
      outputBytesWhileWorkingRef.current.set(sessionId, 0);
      // Quiet after last meaningful output — fallback when Cursor hooks miss.
      // Primary idle signal is the `stop` hook. Keep this long so thinking /
      // tool gaps don't flicker the busy indicator.
      const timer = setInterval(() => {
        const lastAt = lastOutputAtRef.current.get(sessionId) ?? 0;
        if (Date.now() - lastAt < AGENT_WORKING_IDLE_FALLBACK_MS) return;
        clearIdleWatch(sessionId);
        turnCompleteReasonBySessionRef.current.set(sessionId, "fallback");
        clearTurnWorkingRef.current(sessionId);
        setSessionActivityRef.current(sessionId, "idle");
      }, 1_000);
      idleWatchTimersRef.current.set(sessionId, timer);
    },
    [clearIdleWatch],
  );
  armIdleWatchRef.current = armIdleWatch;

  /** Start/refresh an active agent turn (submit or clear OSC "working"). */
  const markAgentWorking = useCallback(
    (sessionId: string) => {
      if (!isCursorAgentSession(sessionId)) return;
      const current = activityBySessionIdRef.current[sessionId] ?? null;
      if (
        current === "working" &&
        stickyWorkingSessionsRef.current.has(sessionId)
      ) {
        // Already in a sticky turn — only bump activity time.
        lastOutputAtRef.current.set(sessionId, Date.now());
        return;
      }
      markTurnWorking(sessionId);
      armIdleWatchRef.current(sessionId);
    },
    [isCursorAgentSession, markTurnWorking],
  );

  const markAgentWorkingRef = useRef(markAgentWorking);
  markAgentWorkingRef.current = markAgentWorking;

  const noteSessionOutput = useCallback(
    (sessionId: string, chunk: string) => {
      if (!chunk) return;

      const current = activityBySessionIdRef.current[sessionId] ?? null;
      const turnArmed = agentTurnArmedRef.current.has(sessionId);
      // Ignore idle agent UI redraws entirely (they used to keep lastAt fresh).
      if (current !== "working" && !turnArmed) return;

      // Tiny cursor/spinner frames shouldn't postpone idle forever.
      if (chunk.length >= 16) {
        lastOutputAtRef.current.set(sessionId, Date.now());
      }
      if (idleWatchTimersRef.current.has(sessionId)) {
        outputBytesWhileWorkingRef.current.set(
          sessionId,
          (outputBytesWhileWorkingRef.current.get(sessionId) ?? 0) +
            chunk.length,
        );
      }
    },
    [],
  );

  const activeBucket = taskId ? (bucketsByTaskId[taskId] ?? null) : null;
  const activeId = activeBucket?.activeId ?? null;

  const allTerminalSessions = useMemo(() => {
    const list: WorkspaceSession[] = [];
    for (const bucket of Object.values(bucketsByTaskId)) {
      for (const session of bucket.sessions) {
        list.push(session);
      }
    }
    return list;
  }, [bucketsByTaskId]);

  const disposeEntry = useCallback((
    id: string,
    options?: { kill?: boolean },
  ) => {
    clearIdleWatch(id);
    clearAgentLeaveTimer(id);
    // Detach keeps sticky task busy ids (persisted) so the list indicator
    // stays on while the agent continues in the background. Kill clears them.
    stickyWorkingSessionsRef.current.delete(id);
    agentTurnArmedRef.current.delete(id);
    const pendingStop = pendingStopEmitRef.current.get(id);
    if (pendingStop) {
      clearTimeout(pendingStop.timer);
      pendingStopEmitRef.current.delete(id);
    }
    if (options?.kill) {
      const taskIdForSession = findTaskIdForSession(id);
      if (taskIdForSession) {
        stickyWorkingTaskIdsRef.current.delete(taskIdForSession);
        publishStickyWorkingTasks();
      }
    }
    clearCursorAgentSession(id);
    turnStartedAtRef.current.delete(id);
    turnUsageBySessionRef.current.delete(id);
    lastAssistantTextBySessionRef.current.delete(id);
    // Drop stale agent tab labels so Stop agent cannot linger on a detached
    // bucket title after the user navigates away.
    setBucketsByTaskId((current) => {
      for (const [bucketTaskId, bucket] of Object.entries(current)) {
        const index = bucket.sessions.findIndex((session) => session.id === id);
        if (index < 0) continue;
        const session = bucket.sessions[index];
        if (!session || session.title === session.defaultTitle) return current;
        const sessions = [...bucket.sessions];
        sessions[index] = { ...session, title: session.defaultTitle };
        return {
          ...current,
          [bucketTaskId]: { ...bucket, sessions },
        };
      }
      return current;
    });
    const entry = termsRef.current.get(id);
    if (!entry || entry.disposed) {
      publishAgentOpenTaskIds();
      return;
    }
    entry.disposed = true;
    termsRef.current.delete(id);

    entry.resizeObserver?.disconnect();
    entry.resizeObserver = null;
    entry.disposeData?.dispose();
    entry.disposeData = null;
    entry.disposeResize?.dispose();
    entry.disposeResize = null;
    entry.disposeTitle?.dispose();
    entry.disposeTitle = null;

    try {
      // kill = destroy the shell/agent process. Default is detach-only so
      // navigating away keeps background agents alive on the PTY server.
      if (options?.kill) {
        sendPtyMessage(entry.socket, { type: "kill" });
      }
      entry.socket?.close();
    } catch {
      /* ignore */
    }
    entry.socket = null;

    // Dispose addons, then the terminal. Remove the element first so Viewport
    // scroll handlers cannot run after the renderer is torn down (xterm can
    // still schedule syncScrollArea on a rAF outside our try/catch).
    try {
      entry.fit.dispose();
    } catch {
      /* ignore */
    }
    try {
      entry.canvas?.dispose();
    } catch {
      /* ignore */
    }
    entry.canvas = null;
    try {
      entry.term.element?.remove();
    } catch {
      /* ignore */
    }
    try {
      entry.term.dispose();
    } catch {
      /* ignore */
    }

    setActivityBySessionId((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    // UI socket is gone — republish so Stop agent clears even if attach remains.
    publishAgentOpenTaskIds();
  }, [
    clearAgentLeaveTimer,
    clearCursorAgentSession,
    clearIdleWatch,
    findTaskIdForSession,
    publishAgentOpenTaskIds,
    publishStickyWorkingTasks,
  ]);

  const applyOscTitle = useCallback(
    (sessionId: string, oscTitle: string) => {
      const stillAgent =
        isCursorAgentTitle(oscTitle) || /cursor agent/i.test(oscTitle);
      const wasAgent = cursorAgentSessionIdsRef.current.has(sessionId);
      const titleConfirmed = agentTitleConfirmedRef.current.has(sessionId);
      const hookLive = agentHookLiveSessionsRef.current.has(sessionId);
      const leaveArmed = agentLeaveTimersRef.current.has(sessionId);

      if (stillAgent) {
        clearAgentLeaveTimer(sessionId);
        markCursorAgentSession(sessionId);
        const alreadyConfirmed = titleConfirmed;
        agentTitleConfirmedRef.current.add(sessionId);
        if (!alreadyConfirmed) publishAgentOpenTaskIds();
      } else if (wasAgent || titleConfirmed || hookLive) {
        const forTaskId = findTaskIdForSession(sessionId);
        const attachPending =
          Boolean(forTaskId) &&
          attachedChatByTaskIdRef.current.has(forTaskId!);
        // Cursor blips non-agent OSC titles while the TUI is still up. Debounce
        // the leave so Stop→View only flips after a sustained shell title (or
        // sessionEnd / End clears immediately).
        if (titleConfirmed || hookLive || attachPending) {
          if (!leaveArmed) scheduleAgentCliLeave(sessionId);
        } else {
          markAgentCliLeftSession(sessionId);
        }
      }

      const activity = detectAgentActivityFromTitle(oscTitle);
      if (activity === "working") {
        markAgentWorking(sessionId);
      } else if (activity === "attention") {
        // Waiting on the user — not an active busy turn.
        clearIdleWatch(sessionId);
        clearTurnWorking(sessionId);
        setSessionActivity(sessionId, "attention");
      } else if (activity != null) {
        // Don't let OSC ready/idle/present wipe a sticky in-progress turn.
        if (stickyWorkingSessionsRef.current.has(sessionId)) {
          lastOutputAtRef.current.set(sessionId, Date.now());
        } else {
          setSessionActivity(sessionId, activity);
        }
      }

      setBucketsByTaskId((current) => {
        const next: Record<string, TaskSessionBucket> = { ...current };
        for (const [bucketTaskId, bucket] of Object.entries(current)) {
          const index = bucket.sessions.findIndex(
            (session) => session.id === sessionId,
          );
          if (index < 0) continue;
          const session = bucket.sessions[index];
          if (!session) continue;

          let nextTitle = terminalTabTitleFromOsc(
            oscTitle,
            session.title,
            session.defaultTitle,
          );
          // Keep the agent tab label while the TUI is still considered open,
          // but not once a leave debounce is armed (shell title is winning).
          if (
            !agentLeaveTimersRef.current.has(sessionId) &&
            (agentTitleConfirmedRef.current.has(sessionId) ||
              agentHookLiveSessionsRef.current.has(sessionId)) &&
            session.title === CURSOR_AI_TAB_TITLE &&
            nextTitle !== CURSOR_AI_TAB_TITLE
          ) {
            nextTitle = CURSOR_AI_TAB_TITLE;
          }
          if (nextTitle === session.title) return current;
          const sessions = [...bucket.sessions];
          sessions[index] = { ...session, title: nextTitle };
          next[bucketTaskId] = { ...bucket, sessions };
          return next;
        }
        return current;
      });
    },
    [
      clearAgentLeaveTimer,
      clearIdleWatch,
      clearTurnWorking,
      findTaskIdForSession,
      markAgentCliLeftSession,
      markAgentWorking,
      markCursorAgentSession,
      publishAgentOpenTaskIds,
      scheduleAgentCliLeave,
      setSessionActivity,
    ],
  );

  const disposeAllEntries = useCallback(() => {
    for (const id of [...termsRef.current.keys()]) {
      disposeEntry(id);
    }
    hostsRef.current.clear();
  }, [disposeEntry]);
  const disposeAllEntriesRef = useRef(disposeAllEntries);
  disposeAllEntriesRef.current = disposeAllEntries;

  const connectPty = useCallback((
    sessionId: string,
    entry: TerminalEntry,
    sessionCwd: string | null,
    pendingInput?: string,
  ) => {
    fitTerminal(entry);
    const cols = Math.max(2, entry.term.cols || 80);
    const rows = Math.max(1, entry.term.rows || 24);
    entry.spawnedCwd = sessionCwd;
    const url = getPtyWebSocketUrl({
      cols,
      rows,
      cwd: sessionCwd,
      sessionId,
    });

    const socket = new WebSocket(url);
    entry.socket = socket;
    let startupCommand = pendingInput?.trim()
      ? pendingInput.endsWith("\n")
        ? pendingInput
        : `${pendingInput}\n`
      : null;
    let startupTimer: ReturnType<typeof setTimeout> | null = null;

    const flushStartupCommand = () => {
      if (!startupCommand) return;
      const command = startupCommand;
      startupCommand = null;
      sendPtyMessage(socket, { type: "input", data: command });
      // Pending attach/resume never went through the live-socket markWorking
      // path — arm the turn now so In Progress + busy fire without waiting
      // for OSC/hooks (which can lag or miss on a fresh session).
      if (cursorAgentSessionIdsRef.current.has(sessionId)) {
        markAgentWorkingRef.current(sessionId);
      }
    };

    const scheduleStartupCommand = () => {
      if (!startupCommand || startupTimer) return;
      // Wait for the login shell to finish init before sending resume.
      startupTimer = setTimeout(() => {
        startupTimer = null;
        flushStartupCommand();
      }, 350);
    };

    socket.addEventListener("open", () => {
      if (entry.disposed) return;
      // Re-fit once the pane may be visible, then sync PTY size.
      fitTerminal(entry);
      sendPtyMessage(socket, {
        type: "resize",
        cols: entry.term.cols,
        rows: entry.term.rows,
      });
    });

    socket.addEventListener("message", (event) => {
      if (entry.disposed) return;
      let message: {
        type?: string;
        data?: string;
        message?: string;
        code?: number | null;
        shell?: string;
        event?: string;
        activity?: string | null;
        usage?: unknown;
        text?: string;
        reattached?: boolean;
        lastActivity?: "working" | "idle" | null;
        agentSessionEnded?: boolean;
      };
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }

      if (message.type === "output" && typeof message.data === "string") {
        try {
          entry.term.write(message.data);
        } catch {
          return;
        }
        noteSessionOutput(sessionId, message.data);
        scheduleStartupCommand();
        return;
      }

      if (message.type === "agent-hook") {
        // sessionEnd: TUI left. If a turn was still armed/working, complete it
        // as an abrupt exit (shell → On Hold). If already idle after `stop`,
        // only clean up — do not fire a second turn-completed.
        if (message.event === "sessionEnd") {
          const forTaskId = findTaskIdForSession(sessionId);
          const previous =
            activityBySessionIdRef.current[sessionId] ?? null;
          const turnStillActive =
            previous === "working" ||
            stickyWorkingSessionsRef.current.has(sessionId) ||
            agentTurnArmedRef.current.has(sessionId);

          clearIdleWatch(sessionId);
          markAgentCliLeftSession(sessionId);

          if (turnStillActive && forTaskId) {
            emitTurnCompletedRef.current?.(sessionId, forTaskId, {
              reason: "sessionEnd",
              abrupt: true,
            });
            onTaskAgentBecameIdleRef.current?.(forTaskId);
          }
          clearTurnWorking(sessionId);
          agentTurnArmedRef.current.delete(sessionId);
          turnCompleteReasonBySessionRef.current.delete(sessionId);
          turnStartedAtRef.current.delete(sessionId);
          // Drop to idle without a second turn-completed (already emitted).
          setActivityBySessionId((current) => {
            if (current[sessionId] === "idle") return current;
            const next = { ...current, [sessionId]: "idle" as const };
            activityBySessionIdRef.current = next;
            return next;
          });
          return;
        }

        markCursorAgentSession(sessionId);
        // Any hook except sessionEnd means the agent CLI is in the TUI.
        const alreadyLive = agentHookLiveSessionsRef.current.has(sessionId);
        agentHookLiveSessionsRef.current.add(sessionId);
        if (!alreadyLive) publishAgentOpenTaskIds();
        const usage = parseAgentTurnUsage(message.usage);
        if (usage) {
          turnUsageBySessionRef.current.set(sessionId, usage);
        }
        // Prefer stop/sessionEnd text (transcript final message). Fall back to
        // the latest afterAgentResponse — stop often arrives with no text in CLI.
        if (
          (message.event === "afterAgentResponse" ||
            message.event === "stop" ||
            message.event === "sessionEnd") &&
          typeof message.text === "string" &&
          message.text.trim()
        ) {
          lastAssistantTextBySessionRef.current.set(
            sessionId,
            message.text.trim(),
          );
        }

        // afterAgentResponse is text-only. Never mark working — CLI often sends
        // it after stop; that used to restart In Progress and clear the text.
        if (message.event === "afterAgentResponse") {
          const pending = pendingStopEmitRef.current.get(sessionId);
          if (pending) {
            clearTimeout(pending.timer);
            pendingStopEmitRef.current.delete(sessionId);
            emitTurnCompletedRef.current?.(sessionId, pending.taskId, {
              reason: pending.reason,
              abrupt: pending.abrupt,
            });
            onTaskAgentBecameIdleRef.current?.(pending.taskId);
          }
          return;
        }

        const activity =
          message.activity === "working" || message.activity === "idle"
            ? message.activity
            : null;
        if (activity === "working") {
          markAgentWorking(sessionId);
        } else if (activity === "idle") {
          clearIdleWatch(sessionId);
          const forTaskId = findTaskIdForSession(sessionId);
          const previous =
            activityBySessionIdRef.current[sessionId] ?? null;
          const wasArmed =
            previous === "working" ||
            stickyWorkingSessionsRef.current.has(sessionId) ||
            agentTurnArmedRef.current.has(sessionId);
          const reason: AgentTurnCompleteReason =
            message.event === "sessionEnd" ? "sessionEnd" : "stop";
          turnCompleteReasonBySessionRef.current.set(sessionId, reason);

          // Always complete an armed turn here. Don't rely on working→idle
          // notify alone — sticky-only busy can miss that transition.
          // Defer briefly: CLI often sends afterAgentResponse *after* stop.
          if (wasArmed && forTaskId) {
            const existing = pendingStopEmitRef.current.get(sessionId);
            if (existing) clearTimeout(existing.timer);
            const abrupt = false;
            const timer = setTimeout(() => {
              pendingStopEmitRef.current.delete(sessionId);
              emitTurnCompletedRef.current?.(sessionId, forTaskId, {
                reason,
                abrupt,
              });
              onTaskAgentBecameIdleRef.current?.(forTaskId);
            }, 250);
            pendingStopEmitRef.current.set(sessionId, {
              timer,
              taskId: forTaskId,
              reason,
              abrupt,
            });
          }

          clearTurnWorking(sessionId);
          agentTurnArmedRef.current.delete(sessionId);
          turnCompleteReasonBySessionRef.current.delete(sessionId);
          // Set idle without a second turn-completed via notifyActivityTransition.
          setActivityBySessionId((current) => {
            if (current[sessionId] === "idle") return current;
            const next = { ...current, [sessionId]: "idle" as const };
            activityBySessionIdRef.current = next;
            return next;
          });
        }
        return;
      }

      if (message.type === "ready") {
        if (message.reattached) {
          // Process kept running while UI was away — don't re-send pending
          // bootstrap commands (would interrupt the live agent turn).
          startupCommand = null;
          if (startupTimer) {
            clearTimeout(startupTimer);
            startupTimer = null;
          }
          const forTaskId = findTaskIdForSession(sessionId);
          // sessionEnd while detached — TUI is gone; flip to View agent.
          if (message.agentSessionEnded) {
            markAgentCliLeftSession(sessionId);
            clearTurnWorking(sessionId);
            if (forTaskId) {
              stickyWorkingTaskIdsRef.current.delete(forTaskId);
              publishStickyWorkingTasks();
            }
            setSessionActivity(sessionId, "idle");
            publishAgentOpenTaskIds();
            return;
          }
          try {
            entry.term.writeln(
              "\r\n\x1b[90m[reattached — agent kept running in the background]\x1b[0m\r\n",
            );
          } catch {
            /* disposed */
          }
          // Sync open/busy from hooks that fired while we were detached.
          // Idle after `stop` still means the Agent TUI is up — restore marks
          // so Stop agent stays correct until the user exits.
          if (message.lastActivity === "idle") {
            markCursorAgentSession(sessionId);
            agentTitleConfirmedRef.current.add(sessionId);
            agentHookLiveSessionsRef.current.add(sessionId);
            clearTurnWorking(sessionId);
            if (forTaskId) {
              stickyWorkingTaskIdsRef.current.delete(forTaskId);
              publishStickyWorkingTasks();
            }
            turnCompleteReasonBySessionRef.current.set(sessionId, "stop");
            setSessionActivity(sessionId, "idle");
            publishAgentOpenTaskIds();
          } else if (
            message.lastActivity === "working" ||
            (forTaskId && stickyWorkingTaskIdsRef.current.has(forTaskId))
          ) {
            markCursorAgentSession(sessionId);
            agentTitleConfirmedRef.current.add(sessionId);
            agentHookLiveSessionsRef.current.add(sessionId);
            markTurnWorking(sessionId);
            armIdleWatchRef.current(sessionId);
            publishAgentOpenTaskIds();
          } else {
            publishAgentOpenTaskIds();
          }
          return;
        }
        scheduleStartupCommand();
        publishAgentOpenTaskIds();
        return;
      }

      if (message.type === "error") {
        try {
          entry.term.writeln(
            `\r\n\x1b[31mPTY error:\x1b[0m ${message.message ?? "unknown"}\r\n`,
          );
        } catch {
          /* disposed */
        }
        return;
      }

      if (message.type === "exit") {
        try {
          entry.term.writeln(
            `\r\n\x1b[90m[shell exited${
              message.code == null ? "" : ` with code ${message.code}`
            }]\x1b[0m\r\n`,
          );
        } catch {
          /* disposed */
        }
      }
    });

    socket.addEventListener("close", () => {
      if (startupTimer) {
        clearTimeout(startupTimer);
        startupTimer = null;
      }
      if (entry.socket === socket) {
        entry.socket = null;
      }
      // Detached UI ⇒ Stop agent must clear (open requires a live socket).
      publishAgentOpenTaskIds();
    });

    socket.addEventListener("error", () => {
      if (entry.disposed) return;
      try {
        entry.term.writeln(
          "\r\n\x1b[31mCould not connect to local PTY bridge.\x1b[0m",
        );
        entry.term.writeln(
          "Start it with \x1b[1mpnpm --filter @backsteros/development pty\x1b[0m",
        );
        entry.term.writeln(
          "or use \x1b[1mpnpm --filter @backsteros/development dev\x1b[0m (runs Next + PTY).\r\n",
        );
      } catch {
        /* disposed */
      }
    });

    entry.disposeData?.dispose();
    entry.disposeData = entry.term.onData((data) => {
      sendPtyMessage(socket, { type: "input", data });
      // Enter in a Cursor Agent session starts a turn (OSC rarely signals this).
      if (
        isCursorAgentSession(sessionId) &&
        (data === "\r" || data === "\n" || data.includes("\r"))
      ) {
        markAgentWorking(sessionId);
      }
    });

    entry.disposeResize?.dispose();
    entry.disposeResize = entry.term.onResize(({ cols: nextCols, rows: nextRows }) => {
      sendPtyMessage(socket, {
        type: "resize",
        cols: nextCols,
        rows: nextRows,
      });
    });
  }, [
    clearIdleWatch,
    clearTurnWorking,
    findTaskIdForSession,
    isCursorAgentSession,
    markAgentCliLeftSession,
    markAgentWorking,
    markCursorAgentSession,
    markTurnWorking,
    noteSessionOutput,
    publishAgentOpenTaskIds,
    publishStickyWorkingTasks,
    setSessionActivity,
  ]);

  const ensureTerminal = useCallback(
    (session: WorkspaceSession) => {
      const host = hostsRef.current.get(session.id);
      if (!host || termsRef.current.has(session.id)) return;

      const term = new Terminal({
        cursorBlink: true,
        convertEol: false,
        fontFamily: TERMINAL_FONT_FAMILY,
        fontSize: TERMINAL_FONT_SIZE,
        // Keep cells flush so TUI box-drawing / filled backgrounds stay solid.
        lineHeight: 1,
        letterSpacing: 0,
        customGlyphs: true,
        scrollback: 10_000,
        theme: TERMINAL_THEME,
        allowTransparency: false,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      // Canvas paints solid cell backgrounds + customGlyphs well in Chromium.
      // WKWebView/Tauri often drops Nerd Font / box-drawing glyphs with Canvas —
      // prefer the DOM renderer there.
      let canvas: CanvasAddon | null = null;
      if (!isWebKitTerminalHost()) {
        try {
          canvas = new CanvasAddon();
          term.loadAddon(canvas);
        } catch {
          canvas = null;
        }
      }

      const entry: TerminalEntry = {
        term,
        fit,
        canvas,
        socket: null,
        spawnedCwd: null,
        disposeData: null,
        disposeResize: null,
        disposeTitle: null,
        resizeObserver: null,
        disposed: false,
      };
      // Fonts may resolve after open; remeasure once they're ready.
      void ensureTerminalFontsLoaded().then(() => {
        const live = termsRef.current.get(session.id);
        if (!live || live.disposed || live.term !== term) return;
        if (!layoutReadyRef.current) return;
        applyTerminalAppearance(term);
        try {
          term.refresh(0, Math.max(0, term.rows - 1));
        } catch {
          /* ignore — disposed mid-flight */
        }
        fitTerminal(live, host);
      });
      if (layoutReadyRef.current) {
        fitTerminal(entry, host);
      }
      entry.resizeObserver = new ResizeObserver(() => {
        if (entry.disposed) return;
        if (!layoutReadyRef.current) return;
        fitTerminal(entry, host);
      });
      entry.resizeObserver.observe(host);

      entry.disposeTitle = term.onTitleChange((oscTitle) => {
        applyOscTitle(session.id, oscTitle);
      });
      if (
        session.title === CURSOR_AI_TAB_TITLE ||
        isCursorAgentTitle(session.title)
      ) {
        markCursorAgentSession(session.id);
      }
      termsRef.current.set(session.id, entry);
      const pendingInput = session.pendingInput;
      // Spawn in this session's project folder — never another project's live cwd.
      connectPty(
        session.id,
        entry,
        resolveSessionCwd(session, cwd, projectId),
        pendingInput,
      );
      if (pendingInput) {
        setBucketsByTaskId((current) => {
          let changed = false;
          const next: Record<string, TaskSessionBucket> = { ...current };
          for (const [bucketTaskId, bucket] of Object.entries(current)) {
            const index = bucket.sessions.findIndex(
              (item) => item.id === session.id,
            );
            if (index < 0) continue;
            const item = bucket.sessions[index];
            if (!item?.pendingInput) break;
            const sessions = [...bucket.sessions];
            sessions[index] = { ...item, pendingInput: undefined };
            next[bucketTaskId] = { ...bucket, sessions };
            changed = true;
            break;
          }
          return changed ? next : current;
        });
      }
    },
    [applyOscTitle, connectPty, cwd, markCursorAgentSession, projectId],
  );

  const sendInputToTaskTerminal = useCallback(
    (
      forTaskId: string,
      input: string,
      options?: { markAgentWorking?: boolean; markAsAgent?: boolean },
    ): boolean => {
      const markWorking = options?.markAgentWorking !== false;
      const markAsAgent = options?.markAsAgent !== false;
      const bucket = bucketsByTaskIdRef.current[forTaskId];
      const session = bucket?.sessions[0];
      if (!session) {
        const created = createTerminalSession({
          projectId,
          projectLabel,
          cwd,
          pendingInput: input,
        });
        const nextBucket = { sessions: [created], activeId: created.id };
        // Keep the ref in sync immediately so markAgentWorking can resolve
        // the task id before React commits setState.
        bucketsByTaskIdRef.current = {
          ...bucketsByTaskIdRef.current,
          [forTaskId]: nextBucket,
        };
        setBucketsByTaskId((current) => ({
          ...current,
          [forTaskId]: nextBucket,
        }));
        if (markAsAgent) {
          markCursorAgentSession(created.id);
        }
        if (markWorking && markAsAgent) {
          markAgentWorking(created.id);
        }
        return false;
      }

      const entry = termsRef.current.get(session.id);
      if (entry?.socket && entry.socket.readyState === WebSocket.OPEN) {
        sendPtyMessage(entry.socket, { type: "input", data: input });
        if (markAsAgent) {
          markCursorAgentSession(session.id);
        }
        if (markWorking) {
          markAgentWorking(session.id);
        }
        return true;
      }

      // Recreate the PTY with a one-shot resume command.
      disposeEntry(session.id);
      hostsRef.current.delete(session.id);
      const nextSession: WorkspaceSession = {
        ...session,
        pendingInput: input,
      };
      const nextBucket = {
        sessions: [nextSession],
        activeId: nextSession.id,
      };
      bucketsByTaskIdRef.current = {
        ...bucketsByTaskIdRef.current,
        [forTaskId]: nextBucket,
      };
      setBucketsByTaskId((current) => ({
        ...current,
        [forTaskId]: nextBucket,
      }));
      if (markAsAgent) {
        markCursorAgentSession(session.id);
      }
      if (markWorking && markAsAgent) {
        markAgentWorking(session.id);
      }
      return false;
    },
    [
      cwd,
      disposeEntry,
      markAgentWorking,
      markCursorAgentSession,
      projectId,
      projectLabel,
    ],
  );

  /** Run shell `clear` after the agent has left (must not target the agent TUI). */
  const sendShellClearToTaskTerminal = useCallback(
    (forTaskId: string) => {
      sendInputToTaskTerminal(forTaskId, shellClearCommand(), {
        markAgentWorking: false,
        markAsAgent: false,
      });
    },
    [sendInputToTaskTerminal],
  );
  sendShellClearRef.current = sendShellClearToTaskTerminal;

  /** If End requested a wipe and the agent has left, run shell `clear` once. */
  const flushPendingShellClear = useCallback((forTaskId: string) => {
    if (!pendingShellClearByTaskIdRef.current.delete(forTaskId)) return;
    const fallback = pendingShellClearTimersRef.current.get(forTaskId);
    if (fallback) {
      clearTimeout(fallback);
      pendingShellClearTimersRef.current.delete(forTaskId);
    }
    // Brief delay so the shell prompt is ready after the TUI teardown.
    window.setTimeout(() => {
      sendShellClearRef.current(forTaskId);
    }, 150);
  }, []);
  flushPendingShellClearRef.current = flushPendingShellClear;

  /** Type `/quit` and submit; shell `clear` runs after the agent TUI exits. */
  const sendAgentQuitToTaskTerminal = useCallback(
    (forTaskId: string) => {
      pendingShellClearByTaskIdRef.current.add(forTaskId);
      const existingTimer = pendingShellClearTimersRef.current.get(forTaskId);
      if (existingTimer) clearTimeout(existingTimer);
      // Fallback if we never see OSC title / sessionEnd leave the agent.
      pendingShellClearTimersRef.current.set(
        forTaskId,
        window.setTimeout(() => {
          pendingShellClearTimersRef.current.delete(forTaskId);
          flushPendingShellClearRef.current(forTaskId);
        }, 4000),
      );

      const live = sendInputToTaskTerminal(forTaskId, cursorAgentQuitText(), {
        markAgentWorking: false,
        markAsAgent: true,
      });
      if (!live) return;
      window.setTimeout(() => {
        sendInputToTaskTerminal(forTaskId, cursorAgentSubmitKey(), {
          markAgentWorking: false,
          markAsAgent: true,
        });
      }, CURSOR_AGENT_OPEN_PROMPT_SUBMIT_DELAY_MS);
    },
    [sendInputToTaskTerminal],
  );

  /** Type a prompt into an already-open Agent TUI and submit (never shell resume). */
  const sendPromptToOpenAgent = useCallback(
    (forTaskId: string, prompt: string) => {
      const text = prompt.trim();
      if (!text) return;
      // Clear any leftover composer draft first so the new prompt is clean.
      const cleared = sendInputToTaskTerminal(
        forTaskId,
        cursorAgentClearComposerKeys(),
        {
          markAgentWorking: true,
          markAsAgent: true,
        },
      );
      if (!cleared) return;
      window.setTimeout(() => {
        const live = sendInputToTaskTerminal(forTaskId, text, {
          markAgentWorking: true,
          markAsAgent: true,
        });
        if (!live) return;
        window.setTimeout(() => {
          sendInputToTaskTerminal(forTaskId, cursorAgentSubmitKey(), {
            markAgentWorking: true,
            markAsAgent: true,
          });
        }, CURSOR_AGENT_OPEN_PROMPT_SUBMIT_DELAY_MS);
      }, CURSOR_AGENT_CLEAR_COMPOSER_DELAY_MS);
    },
    [sendInputToTaskTerminal],
  );

  /**
   * Execute the pure talk action table: abort / noop / prompt-in-tui /
   * shell-resume / quit-then-shell-resume.
   */
  const runWithAgentSession = useCallback(
    (input: {
      taskId: string;
      chatId: string;
      prompt?: string | null;
      sessionIsNew?: boolean;
      forceReattach?: boolean;
      /** Override working mark for shell-resume (default: Boolean(prompt)). */
      markAgentWorking?: boolean;
    }): AgentTerminalAction => {
      const prompt = input.prompt?.trim() || null;
      const requested = input.chatId.trim().toLowerCase();
      const bound =
        listTaskAgentSessions(readTaskAgentSessions(), input.taskId)[0]
          ?.chatId.trim()
          .toLowerCase() || null;
      const previouslyAttached =
        attachedChatByTaskIdRef.current.get(input.taskId) ?? null;
      const tuiOpen = isAgentCliOpenForTask(input.taskId);

      const sendResume = () => {
        sendInputToTaskTerminal(
          input.taskId,
          cursorAgentResumeCommand(input.chatId, prompt),
          {
            markAgentWorking:
              input.markAgentWorking ?? Boolean(prompt),
          },
        );
      };

      // View agent: if the TUI is already up (including idle after `stop`),
      // only re-bind attach — never shell-resume into a live Agent session.
      // Stale attach alone must not noop forever after the TUI has left.
      if (input.forceReattach) {
        if (tuiOpen) {
          setAttachedChatForTask(input.taskId, input.chatId);
          return "noop";
        }
        const sessionId =
          bucketsByTaskIdRef.current[input.taskId]?.sessions[0]?.id ?? null;
        if (sessionId) {
          clearCursorAgentSession(sessionId);
        }
        setAttachedChatForTask(input.taskId, input.chatId);
        sendResume();
        return "shell-resume";
      }

      // Start Agent (new chat): sticky "open" without a confirmed TUI is a
      // false positive — clear marks and shell-resume. Only quit when the
      // Agent TUI is hard-confirmed (OSC title / hooks).
      if (input.sessionIsNew) {
        const sessionId =
          bucketsByTaskIdRef.current[input.taskId]?.sessions[0]?.id ?? null;
        const hardOpen =
          Boolean(sessionId) &&
          (agentTitleConfirmedRef.current.has(sessionId!) ||
            agentHookLiveSessionsRef.current.has(sessionId!));
        if (!hardOpen) {
          if (sessionId) clearCursorAgentSession(sessionId);
          setAttachedChatForTask(input.taskId, input.chatId);
          sendResume();
          return "shell-resume";
        }
      }

      const action = resolveAgentTerminalAction({
        tuiOpen,
        attachedChatId: previouslyAttached,
        boundChatId: bound,
        requestedChatId: requested,
        sessionIsNew: input.sessionIsNew,
        destroyed: isAgentChatDestroyed(requested),
        prompt,
      });

      if (action === "abort") {
        setAttachedChatForTask(input.taskId, null);
        return action;
      }

      setAttachedChatForTask(input.taskId, input.chatId);

      if (action === "prompt-in-tui" && prompt) {
        sendPromptToOpenAgent(input.taskId, prompt);
        return action;
      }
      if (action === "noop") {
        return action;
      }

      if (action === "quit-then-shell-resume") {
        sendAgentQuitToTaskTerminal(input.taskId);
        window.setTimeout(
          sendResume,
          CURSOR_AGENT_QUIT_THEN_RESUME_DELAY_MS,
        );
        return action;
      }

      sendResume();
      return action;
    },
    [
      clearCursorAgentSession,
      isAgentCliOpenForTask,
      sendAgentQuitToTaskTerminal,
      sendInputToTaskTerminal,
      sendPromptToOpenAgent,
      setAttachedChatForTask,
    ],
  );

  const runWithAgentSessionRef = useRef(runWithAgentSession);
  runWithAgentSessionRef.current = runWithAgentSession;

  useEffect(() => {
    if (!agentAttachRequest) return;
    runWithAgentSessionRef.current({
      taskId: agentAttachRequest.taskId,
      chatId: agentAttachRequest.chatId,
      prompt: agentAttachRequest.prompt,
      sessionIsNew: agentAttachRequest.sessionIsNew,
      forceReattach: agentAttachRequest.forceReattach,
    });
    onAgentAttachRequestHandled?.();
    // Only re-run when the request identity changes — not when the runner
    // callback is recreated (that was re-entering Start Agent mid-turn and
    // typing /quit into the live TUI).
  }, [agentAttachRequest, onAgentAttachRequestHandled]);

  useEffect(() => {
    if (!agentEndRequest) return;
    const taskKey = agentEndRequest.taskId;
    const chatId = agentEndRequest.chatId.trim().toLowerCase();
    // Belt-and-suspenders: UI also marks destroyed; never resume this chat.
    markAgentChatDestroyed(chatId);
    const attached = attachedChatByTaskIdRef.current.get(taskKey);
    const sessionId =
      bucketsByTaskIdRef.current[taskKey]?.sessions[0]?.id ?? null;
    const open = isAgentCliOpenForTask(taskKey);
    // Destroying this chat: clear attach when it matches, or when tracking
    // was already lost. Never touch a different live attached chat.
    const clearsThisAttach = attached === chatId || attached == null;

    // Only type `/quit` when the Agent TUI is actually open for this end.
    if (open && clearsThisAttach) {
      sendAgentQuitToTaskTerminal(taskKey);
    }

    if (clearsThisAttach) {
      setAttachedChatForTask(taskKey, null);
      if (sessionId) {
        clearIdleWatchRef.current?.(sessionId);
        // Drop busy + open marks so Stop agent immediately clears list
        // robot badge / working dots / Cursor Agent header.
        clearTurnWorkingRef.current(sessionId);
        clearCursorAgentSession(sessionId);
        setActivityBySessionId((current) => {
          if (!(sessionId in current)) return current;
          const next = { ...current };
          delete next[sessionId];
          activityBySessionIdRef.current = next;
          return next;
        });
        setBucketsByTaskId((current) => {
          const bucket = current[taskKey];
          const session = bucket?.sessions[0];
          if (!session || session.id !== sessionId) return current;
          if (session.title === session.defaultTitle) return current;
          return {
            ...current,
            [taskKey]: {
              ...bucket,
              sessions: [{ ...session, title: session.defaultTitle }],
              activeId: session.id,
            },
          };
        });
      }
    }
    onAgentEndRequestHandled?.();
  }, [
    agentEndRequest,
    clearCursorAgentSession,
    isAgentCliOpenForTask,
    onAgentEndRequestHandled,
    sendAgentQuitToTaskTerminal,
    setAttachedChatForTask,
  ]);

  // Ensure exactly one terminal exists for the selected task.
  useEffect(() => {
    if (!taskId) return;
    setBucketsByTaskId((current) => {
      const existing = current[taskId];
      const session = existing?.sessions[0];
      if (session) {
        const nextSession: WorkspaceSession = {
          ...session,
          projectId: projectId ?? session.projectId,
          projectLabel: projectLabel || session.projectLabel,
          // Keep this task's shell pinned to the live project work-folder.
          cwd: cwd ?? session.cwd,
        };
        const unchanged =
          existing.sessions.length === 1 &&
          existing.activeId === session.id &&
          nextSession.projectId === session.projectId &&
          nextSession.projectLabel === session.projectLabel &&
          nextSession.cwd === session.cwd;
        if (unchanged) return current;
        return {
          ...current,
          [taskId]: { sessions: [nextSession], activeId: nextSession.id },
        };
      }
      const created = createTerminalSession({ projectId, projectLabel, cwd });
      return {
        ...current,
        [taskId]: { sessions: [created], activeId: created.id },
      };
    });
  }, [cwd, projectId, projectLabel, taskId]);

  /**
   * When opening a task, pin the shell to the project work folder if the live
   * PTY was spawned elsewhere. Do **not** depend on agent-open state — when
   * the user types `/quit`/`/exit`, agent-open clears and re-running this
   * effect used to dispose+respawn the PTY (looked like a full page reload).
   */
  useEffect(() => {
    if (!taskId || !cwd) return;
    if (isAgentCliOpenForTask(taskId)) return;

    const bucket = bucketsByTaskIdRef.current[taskId];
    const session = bucket?.sessions[0];
    if (!session) return;
    if (isCursorAgentSession(session.id)) return;

    const entry = termsRef.current.get(session.id);
    const metaMatches = session.cwd === cwd;
    const spawnedMatches = entry ? entry.spawnedCwd === cwd : false;
    if (metaMatches && spawnedMatches) return;
    if (metaMatches && !entry) {
      // No live PTY yet — ensureTerminal will spawn with the resolved cwd.
      return;
    }

    // Live PTY already connected: never tear it down from this effect.
    // Agent exit often leaves spawnedCwd ≠ project cwd; respawning felt like
    // a page reload. Metadata can still catch up; user can cd if needed.
    if (entry?.socket && entry.socket.readyState === WebSocket.OPEN) {
      if (!metaMatches) {
        setBucketsByTaskId((current) => {
          const currentBucket = current[taskId];
          const currentSession = currentBucket?.sessions[0];
          if (!currentSession || currentSession.cwd === cwd) return current;
          return {
            ...current,
            [taskId]: {
              ...currentBucket,
              sessions: [{ ...currentSession, cwd, projectId }],
              activeId: currentSession.id,
            },
          };
        });
      }
      return;
    }

    if (!metaMatches) {
      setBucketsByTaskId((current) => {
        const currentBucket = current[taskId];
        const currentSession = currentBucket?.sessions[0];
        if (!currentSession || currentSession.cwd === cwd) return current;
        return {
          ...current,
          [taskId]: {
            ...currentBucket,
            sessions: [{ ...currentSession, cwd, projectId }],
            activeId: currentSession.id,
          },
        };
      });
    }

    if (entry) {
      disposeEntry(session.id);
    }

    // Re-open in the work folder (only when there was no live socket).
    const frame = requestAnimationFrame(() => {
      const latest = bucketsByTaskIdRef.current[taskId]?.sessions[0];
      if (!latest) return;
      if (isAgentCliOpenForTask(taskId)) return;
      if (isCursorAgentSession(latest.id)) return;
      ensureTerminal({ ...latest, cwd, projectId });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    cwd,
    disposeEntry,
    ensureTerminal,
    isAgentCliOpenForTask,
    isCursorAgentSession,
    projectId,
    taskId,
  ]);

  // Detach UI terminals when the focused project changes — do not kill PTYs
  // so agents on other tasks keep running and reattach later.
  useEffect(() => {
    if (previousProjectIdRef.current === projectId) return;
    previousProjectIdRef.current = projectId;
    disposeAllEntriesRef.current();
  }, [projectId]);

  useEffect(() => {
    if (!persistReadyRef.current) {
      persistReadyRef.current = true;
      return;
    }
    writeSessionBuckets(toPersistedBuckets(bucketsByTaskId));
  }, [bucketsByTaskId]);

  useEffect(() => {
    onActiveTabIdChange?.(activeId);
  }, [activeId, onActiveTabIdChange]);

  const agentSummary = useMemo(
    () => summarizeAgentActivity(activityBySessionId),
    [activityBySessionId],
  );

  useEffect(() => {
    onAgentActivitySummaryChange?.(agentSummary);
  }, [agentSummary, onAgentActivitySummaryChange]);

  const workingTaskIds = useMemo(() => {
    const ids = new Set<string>(stickyWorkingTaskIds);
    for (const [bucketTaskId, bucket] of Object.entries(bucketsByTaskId)) {
      for (const session of bucket.sessions) {
        if (isAgentActivelyWorking(activityBySessionId[session.id])) {
          ids.add(bucketTaskId);
          break;
        }
      }
    }
    return [...ids].sort();
  }, [activityBySessionId, bucketsByTaskId, stickyWorkingTaskIds]);

  const workingProjectIds = useMemo(() => {
    const ids = new Set<string>();
    const workingTasks = new Set(workingTaskIds);
    for (const [bucketTaskId, bucket] of Object.entries(bucketsByTaskId)) {
      if (!workingTasks.has(bucketTaskId)) continue;
      for (const session of bucket.sessions) {
        const forProjectId = session.projectId ?? projectId;
        if (forProjectId) ids.add(forProjectId);
        break;
      }
    }
    return [...ids].sort();
  }, [bucketsByTaskId, projectId, workingTaskIds]);

  const workingTaskIdsKey = workingTaskIds.join("|");
  useEffect(() => {
    onWorkingTaskIdsChange?.(workingTaskIds);
  }, [onWorkingTaskIdsChange, workingTaskIds, workingTaskIdsKey]);

  const workingProjectIdsKey = workingProjectIds.join("|");
  useEffect(() => {
    onWorkingProjectIdsChange?.(workingProjectIds);
  }, [onWorkingProjectIdsChange, workingProjectIds, workingProjectIdsKey]);

  const agentStatusItems = useMemo((): StatusBarAgentItem[] => {
    const open = new Set(agentOpenTaskIds);
    const items: StatusBarAgentItem[] = [];
    for (const [bucketTaskId, bucket] of Object.entries(bucketsByTaskId)) {
      if (!open.has(bucketTaskId)) continue;
      const activities = bucket.sessions.map(
        (session) => activityBySessionId[session.id] ?? null,
      );
      const preferred = pickPreferredAgentActivity(activities) ?? "present";
      const session = bucket.sessions[0];
      items.push({
        taskId: bucketTaskId,
        projectId: session?.projectId ?? projectId,
        projectLabel: session?.projectLabel || projectLabel || "Project",
        activity: preferred,
      });
    }
    items.sort((a, b) => {
      const byActivity =
        (a.activity === "working" ? 0 : a.activity === "attention" ? 1 : 2) -
        (b.activity === "working" ? 0 : b.activity === "attention" ? 1 : 2);
      if (byActivity !== 0) return byActivity;
      return a.taskId.localeCompare(b.taskId);
    });
    return items;
  }, [
    activityBySessionId,
    agentOpenTaskIds,
    bucketsByTaskId,
    projectId,
    projectLabel,
  ]);

  const agentStatusItemsKey = agentStatusItems
    .map((item) => `${item.taskId}:${item.activity}:${item.projectId ?? ""}`)
    .join("|");
  useEffect(() => {
    onAgentStatusItemsChange?.(agentStatusItems);
  }, [agentStatusItems, agentStatusItemsKey, onAgentStatusItemsChange]);

  useEffect(() => {
    return () => {
      onAgentActivitySummaryChange?.(emptyAgentActivitySummary());
      onWorkingTaskIdsChange?.([]);
      onWorkingProjectIdsChange?.([]);
      onAgentStatusItemsChange?.([]);
    };
  }, [
    onAgentActivitySummaryChange,
    onAgentStatusItemsChange,
    onWorkingProjectIdsChange,
    onWorkingTaskIdsChange,
  ]);

  // Ensure PTY for every terminal session (including parked tasks).
  useEffect(() => {
    // Hot reload keeps Terminal instances in a ref; recreate when appearance
    // defaults change so font/WebGL updates are not stuck on the old options.
    if (appliedTerminalAppearanceRevision !== TERMINAL_APPEARANCE_REVISION) {
      appliedTerminalAppearanceRevision = TERMINAL_APPEARANCE_REVISION;
      for (const id of [...termsRef.current.keys()]) {
        disposeEntry(id);
      }
    }

    const liveIds = new Set(allTerminalSessions.map((session) => session.id));
    for (const id of [...termsRef.current.keys()]) {
      if (!liveIds.has(id)) disposeEntry(id, { kill: true });
    }

    const frame = requestAnimationFrame(() => {
      for (const session of allTerminalSessions) {
        ensureTerminal(session);
      }
      // Parked hosts keep layout size via CSS; only fit the visible session on
      // tab/task switches. Window resize still refits every live entry below.
      if (activeId) {
        const entry = termsRef.current.get(activeId);
        if (entry) {
          fitTerminal(entry, hostsRef.current.get(activeId));
        }
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [activeId, allTerminalSessions, disposeEntry, ensureTerminal]);

  useEffect(() => {
    const onResize = () => {
      if (!layoutReadyRef.current) return;
      for (const [sessionId, entry] of termsRef.current) {
        fitTerminal(entry, hostsRef.current.get(sessionId));
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (collapsed || !layoutReady || !activeId) return;
    const sessionId = activeId;
    const frame = requestAnimationFrame(() => {
      const entry = termsRef.current.get(sessionId);
      if (entry) {
        fitTerminal(entry, hostsRef.current.get(sessionId));
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [activeId, collapsed, layoutReady]);

  // External focus request (Inbox Enter / strip click) — wait until the
  // column is painted and the task PTY exists so xterm can take input.
  useEffect(() => {
    if (!focusRequest || collapsed || !layoutReady || !taskId) return;

    function focusActiveTerminal() {
      const bucket = bucketsByTaskIdRef.current[taskId!];
      const sessionId = bucket?.activeId;
      if (!sessionId) return false;
      const session =
        bucket.sessions.find((entry) => entry.id === sessionId) ?? null;
      // Session row can exist a frame before the host ref + Terminal attach.
      if (session && !termsRef.current.has(sessionId)) {
        ensureTerminal(session);
      }
      const entry = termsRef.current.get(sessionId);
      if (!entry || entry.disposed) return false;
      try {
        entry.term.focus();
        return true;
      } catch {
        return false;
      }
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 45;
    function tryFocus() {
      if (cancelled) return;
      if (focusActiveTerminal()) return;
      attempts += 1;
      if (attempts < maxAttempts) {
        requestAnimationFrame(tryFocus);
      }
    }
    const frame = requestAnimationFrame(tryFocus);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [
    activeId,
    collapsed,
    ensureTerminal,
    focusRequest,
    layoutReady,
    taskId,
  ]);

  useEffect(() => {
    installXtermRendererErrorGuard();
  }, []);

  // Unmount only — do not depend on disposeAllEntries identity or every
  // callback change will dispose+respawn all PTYs (looks like a page reload).
  useEffect(() => {
    return () => {
      disposeAllEntriesRef.current();
    };
  }, []);

  const hasTask = Boolean(taskId);
  const agentSessionOpen = Boolean(
    taskId && agentOpenTaskIds.includes(taskId),
  );

  return (
    <section
      className={`console-pane console-pane--terminal${
        collapsed ? " is-collapsed" : ""
      }`}
      aria-hidden={collapsed}
    >
      {showHeader ? (
        <div className="console-pane-header console-pane-header--terminal">
          <div className="console-pane-header-title">
            {agentSessionOpen ? (
              <CursorAgentIcon size={14} />
            ) : (
              <TerminalHeaderIcon size={14} />
            )}
            <span>{agentSessionOpen ? "Cursor Agent" : "Terminal"}</span>
          </div>
        </div>
      ) : null}
      <div className="terminal-frame">
        <div className="terminal-stage">
          {!hasTask ? (
            <div className="console-empty">
              Select a task to open a terminal.
            </div>
          ) : null}
          {Object.entries(bucketsByTaskId).map(([bucketTaskId, bucket]) => {
            const bucketActive = bucketTaskId === taskId;
            return (
              <div
                key={bucketTaskId}
                className={`session-bucket${bucketActive ? " is-active" : ""}`}
                aria-hidden={!bucketActive}
              >
                {bucket.sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`terminal-host${
                      bucketActive && bucket.activeId === session.id
                        ? " is-active"
                        : ""
                    }`}
                    ref={(node) => {
                      if (node) hostsRef.current.set(session.id, node);
                      else hostsRef.current.delete(session.id);
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
