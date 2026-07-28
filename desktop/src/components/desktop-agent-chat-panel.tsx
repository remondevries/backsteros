import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Check } from "lucide-react";

import {
  applyAcpSessionUpdateToTurn,
  applyAssistantTextToTurn,
  applyCursorCreatePlanToTurn,
  applyCursorUpdateTodosToTurn,
  createOptimisticTurnUiState,
  emptyAgentChatTurnUiState,
  finalizeTurnActivities,
  finalizeTurnSegments,
  sealTurnUiState,
  segmentsFromActivitiesAndText,
  type AgentChatTurnUiState,
} from "../lib/agent/agent-acp-activity";
import {
  agentHookEventAffectsTurnUi,
  applyAgentHookEventToTurn,
} from "../lib/agent/agent-hook-activity";
import type {
  AgentActivitySummary,
  StatusBarAgentItem,
} from "../lib/agent/agent-activity";
import { isTaskAgentWorkingForUi } from "../lib/agent/agent-list-indicators";
import {
  clearAgentChatComposerDraft,
  readAgentChatComposerDraft,
  writeAgentChatComposerDraft,
} from "../lib/agent/agent-chat-composer-draft";
import {
  createAgentChatMessage,
  clearAgentChatTranscript,
  loadAgentChatTranscript,
  mergeAgentChatTranscripts,
  publishAgentChatTranscriptMessage,
  publishAgentChatTranscriptTimeline,
  readAgentChatViewMode,
  saveAgentChatTranscript,
  syncAgentChatTranscript,
  writeAgentChatViewMode,
  type AgentChatImageAttachment,
  type AgentChatMessage,
  type AgentChatViewMode,
  type AgentChatViewScope,
} from "../lib/agent/agent-chat-transcript";
import {
  applyLiveTurnTimelineToMessages,
  findRehydratableLiveAssistant,
  foldAssistantTextIntoLastMessage,
  liveTurnToTimelinePatch,
  rehydrateTurnUiFromMessage,
} from "../lib/agent/agent-chat-live-timeline";
import {
  mergeDisplayMessagesWithOptimisticUsers,
  pruneOptimisticUserMessages,
} from "../lib/agent/agent-chat-optimistic-user";
import {
  planStepsEqual,
  preferPlanSteps,
} from "../lib/agent/t3-port/cursor-todos";
import {
  buildCheckpointPatchesFromActivities,
  collectPathsFromPatches,
} from "../lib/agent/agent-chat-checkpoint";
import {
  readAgentChatMode,
  writeAgentChatMode,
  type AgentChatMode,
} from "../lib/agent/agent-chat-mode";
import { useDesktopAgentStatus } from "../lib/agent/agent-status-context";
import {
  type AgentAttachRequest,
  type AgentEndRequest,
} from "../lib/agent/cursor-agent-cli";
import {
  AGENT_CHAT_COMPOSER_FOCUS_ATTR,
  DesktopAgentChatComposer,
  type DesktopAgentChatComposerHandle,
} from "./desktop-agent-chat-composer";
import { DesktopAgentChatTranscript } from "./desktop-agent-chat-transcript";
import { DesktopAgentChatDiffPanel } from "./desktop-agent-chat-diff-panel";
import { useAgentDiffPanelLayout } from "../lib/agent/agent-chat-diff-panel-layout";
import {
  clearLiveAgentWorkingForTask,
  markLiveAgentWorkingForTask,
} from "../lib/agent/clear-live-agent-working";
import { useAgentAcpEvents } from "../lib/agent/use-agent-acp-events";
import { useDraftHeroLayoutTransition } from "../lib/agent/use-draft-hero-layout-transition";
import { markTaskInProgressForAgent } from "../lib/agent/agent-task-mutations";
import { useDesktopApi } from "../lib/api-context";
import {
  cancelPtyAcpTurn,
  ensurePtyAcpSession,
  fetchPtyGitHead,
  respondPtyAcpUiRequest,
  revertPtyGitCheckpoint,
  setPtyAgentMode,
  submitPtyAgentPrompt,
} from "../lib/pty";
import {
  buildAskAnswersPayload,
  deriveAskProgress,
  normalizeAskQuestions,
  setAskCustomAnswer,
  toggleAskOption,
  type AskQuestionDraft,
  type AskQuestionItem,
} from "../lib/agent/agent-chat-ask";
import {
  resolveTurnDiffFiles,
  type AgentChatTurnDiffSelection,
} from "../lib/agent/agent-chat-timeline";
import {
  addAgentSurfaceTab,
  closeAgentSurfaceTab,
  readAgentSurfaceTabs,
  updateAgentSurfaceTab,
  writeAgentSurfaceTabs,
  type AgentSurfaceAddableKind,
} from "../lib/agent/agent-surface-tabs";
import { DesktopAgentSurfaceTabBar } from "./desktop-agent-surface-tab-bar";
import { AgentSurfaceBrowserPane } from "./agent-surface/agent-surface-browser-pane";
import { AgentSurfaceTerminalPane } from "./agent-surface/agent-surface-terminal-pane";
import { AgentSurfaceFilesPane } from "./agent-surface/agent-surface-files-pane";
import { AgentSurfacePlanPane } from "./agent-surface/agent-surface-plan-pane";
import { AgentSurfaceDiffPane } from "./agent-surface/agent-surface-diff-pane";

type AgentChatUiRequest = {
  kind: "permission" | "ask_question";
  requestId: string;
  title: string;
  detail: string | null;
  options: { id: string; label: string }[];
  questions?: AskQuestionItem[];
};

type AgentChatFollowUpDraft = {
  id: string;
  text: string;
  images: AgentChatImageAttachment[];
};

/** T3 ComposerPendingApprovalPanel summary labels. */
function permissionApprovalCopy(
  title: string,
  detail: string | null,
): { summary: string; detailLabel: string } {
  const hay = `${title} ${detail ?? ""}`.toLowerCase();
  if (
    /\bmcp\b|moneybird_|1password|dynamic.?tool|external.?tool|plugin-|project-0-/i.test(
      hay,
    )
  ) {
    return {
      summary: "MCP tool approval requested",
      detailLabel: "MCP tool",
    };
  }
  if (/\b(exec|shell|command|bash|terminal|run)\b/.test(hay)) {
    return {
      summary: "Command approval requested",
      detailLabel: "Command",
    };
  }
  if (/\b(read|search|grep|glob|list_dir|list.?files)\b/.test(hay)) {
    return {
      summary: "File-read approval requested",
      detailLabel: "File to read",
    };
  }
  return {
    summary: "File-change approval requested",
    detailLabel: "File change",
  };
}

function permissionOptionLabel(label: string): string {
  const normalized = label.trim().toLowerCase();
  if (normalized === "allow once" || normalized === "approve once") {
    return "Approve once";
  }
  if (
    normalized === "always allow" ||
    normalized === "always allow this session" ||
    normalized === "allow for session"
  ) {
    return "Always allow this session";
  }
  if (normalized === "reject" || normalized === "decline" || normalized === "deny") {
    return "Decline";
  }
  if (normalized === "cancel" || normalized === "cancel turn") {
    return "Cancel turn";
  }
  return label;
}

function newFollowUpId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `followup-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isEditableFocusTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  if (
    target.closest(
      ".cm-editor, .cm-content, [data-document-editor-root='codemirror']",
    )
  ) {
    return true;
  }
  return false;
}

function isAgentChatComposer(el: EventTarget | null): boolean {
  return (
    el instanceof HTMLElement &&
    el.getAttribute(AGENT_CHAT_COMPOSER_FOCUS_ATTR) === "composer"
  );
}

function isInsideAgentChatComposer(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (isAgentChatComposer(el)) return true;
  return Boolean(el.closest(".desktop-agent-chat__composer"));
}

export type DesktopAgentChatPanelProps = {
  taskId: string;
  projectId?: string | null;
  projectLabel?: string;
  /** Human-facing task id (e.g. BACK-12) for empty-state chrome. */
  taskDisplayId?: string | null;
  cwd?: string | null;
  agentChatId?: string | null;
  /** Task status — suppresses Working… when On Hold. */
  taskStatus?: string | null;
  collapsed?: boolean;
  layoutReady?: boolean;
  /**
   * Persists Chat/Terminal preference. `"codebase"` defaults to Terminal;
   * `"rail"` (default) defaults to Chat.
   */
  viewScope?: AgentChatViewScope;
  agentAttachRequest?: AgentAttachRequest | null;
  onAgentAttachRequestHandled?: () => void;
  agentEndRequest?: AgentEndRequest | null;
  onAgentEndRequestHandled?: () => void;
  onAgentActivitySummaryChange?: (summary: AgentActivitySummary) => void;
  onWorkingTaskIdsChange?: (taskIds: string[]) => void;
  onAgentStatusItemsChange?: (items: StatusBarAgentItem[]) => void;
  onAgentOpenTaskIdsChange?: (taskIds: readonly string[]) => void;
  /** Unused — composer focus is Tab-only (never auto-focus on attach/open). */
  focusRequest?: number;
  onHide?: () => void;
  /** Start a new agent session; optional prompt overrides the default ticket brief. */
  onStartAgent?: (options?: { prompt?: string }) => void;
  startingAgent?: boolean;
  onStopAgent?: () => void;
  agentError?: string | null;
  /** Persist task fields (used by /clear to bind a fresh agentChatId). */
  patchTaskValues?: (values: Record<string, unknown>) => Promise<void>;
};

/**
 * Agent Chat surface (T3-style ACP only). Live turns project server-side so
 * switching tasks does not stop background sessions. Use
 * `viewScope="codebase"` on codebase tasks; `"rail"` for the side rail.
 */
export function DesktopAgentChatPanel({
  taskId,
  projectId = null,
  projectLabel = "Task",
  taskDisplayId = null,
  cwd = null,
  agentChatId = null,
  taskStatus = null,
  collapsed = false,
  layoutReady = true,
  viewScope = "rail",
  agentAttachRequest = null,
  onAgentAttachRequestHandled,
  agentEndRequest = null,
  onAgentEndRequestHandled,
  onAgentActivitySummaryChange,
  onWorkingTaskIdsChange,
  onAgentStatusItemsChange,
  onAgentOpenTaskIdsChange,
  focusRequest: _focusRequest = 0,
  onHide,
  onStartAgent,
  startingAgent = false,
  onStopAgent,
  agentError = null,
  patchTaskValues,
}: DesktopAgentChatPanelProps) {
  const { client } = useDesktopApi();
  const agentStatus = useDesktopAgentStatus();
  const { requestAttach, setTaskResearchWorking } =
    agentStatus;
  const autoMarkInProgress = viewScope === "codebase";
  const [draft, setDraft] = useState(
    () => readAgentChatComposerDraft(taskId).text,
  );
  const [draftImages, setDraftImages] = useState<AgentChatImageAttachment[]>(
    () => readAgentChatComposerDraft(taskId).images,
  );
  /** Remount LegendList after expand so row width matches the restored pane. */
  const [transcriptLayoutKey, setTranscriptLayoutKey] = useState(0);
  const wasCollapsedRef = useRef(collapsed);
  const [sendError, setSendError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<AgentChatViewMode>(() =>
    readAgentChatViewMode(viewScope),
  );
  const [surfaceTabState, setSurfaceTabState] = useState(() =>
    readAgentSurfaceTabs(taskId),
  );
  const { tabs: surfaceTabs, activeId: activeSurfaceTabId } = surfaceTabState;
  const [messages, setMessages] = useState<AgentChatMessage[]>(() =>
    loadAgentChatTranscript(agentChatId),
  );
  /** T3: keep outgoing user rows visible until the persisted transcript acks them. */
  const [optimisticUserMessages, setOptimisticUserMessages] = useState<
    AgentChatMessage[]
  >([]);
  const optimisticUserMessagesRef = useRef(optimisticUserMessages);
  optimisticUserMessagesRef.current = optimisticUserMessages;
  const [turnUi, setTurnUi] = useState<AgentChatTurnUiState>(() =>
    emptyAgentChatTurnUiState(),
  );
  /** Local optimistic working — do not wait for PTY/status round-trip. */
  const [turnPending, setTurnPending] = useState(false);
  const [uiRequest, setUiRequest] = useState<AgentChatUiRequest | null>(null);
  const [uiRequestBusy, setUiRequestBusy] = useState(false);
  /** Cursor-style follow-ups — shown above composer until the live turn settles. */
  const [queuedFollowUps, setQueuedFollowUps] = useState<
    AgentChatFollowUpDraft[]
  >([]);
  const queuedFollowUpsRef = useRef(queuedFollowUps);
  queuedFollowUpsRef.current = queuedFollowUps;
  const flushingFollowUpRef = useRef(false);
  const flushQueuedFollowUpRef = useRef<(() => void) | null>(null);
  /** Prevent double Enter / double-click from submitting the same draft twice. */
  const sendInFlightRef = useRef(false);
  const [askDrafts, setAskDrafts] = useState<Record<string, AskQuestionDraft>>(
    {},
  );
  const [askQuestionIndex, setAskQuestionIndex] = useState(0);
  const [diffSelection, setDiffSelection] =
    useState<AgentChatTurnDiffSelection | null>(null);
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
  const turnStartedAtRef = useRef<number | null>(null);
  turnStartedAtRef.current = turnStartedAt;
  const [composerOverlayHeight, setComposerOverlayHeight] = useState(0);
  const [agentMode, setAgentMode] = useState<AgentChatMode>(() =>
    readAgentChatMode(),
  );
  const footerRef = useRef<HTMLDivElement | null>(null);
  const bootstrapPromptKeyRef = useRef<string | null>(null);
  const chatIdRef = useRef(agentChatId);
  const composerRef = useRef<DesktopAgentChatComposerHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const previousTaskIdRef = useRef(taskId);
  /** Stable id for the in-progress assistant message (T3 durable timeline). */
  const liveTurnMessageIdRef = useRef<string | null>(null);
  const [liveTurnMessageId, setLiveTurnMessageId] = useState<string | null>(
    null,
  );
  const persistLiveTurnTimerRef = useRef<number | null>(null);

  const localTurnWorking =
    turnPending || turnUi.phase !== "idle";
  const localTurnWorkingRef = useRef(localTurnWorking);
  localTurnWorkingRef.current = localTurnWorking;
  /** True between user/bootstrap send and settle — ignores late ACP frames. */
  const turnActiveRef = useRef(false);

  const turnUiRef = useRef(turnUi);
  turnUiRef.current = turnUi;

  const persistLiveTurnTimelineNow = useCallback(
    (turn: AgentChatTurnUiState, options?: { seal?: boolean; retry?: boolean }) => {
      const patch = liveTurnToTimelinePatch(turn, {
        messageId: liveTurnMessageIdRef.current,
        workedStartedAt: turnStartedAtRef.current,
        seal: options?.seal === true,
      });
      if (!patch) return;
      setMessages((prev) => {
        // Persist against display order: include optimistic users that have not
        // committed into `messages` yet so we never publish assistant-only.
        const withOptimistic = mergeDisplayMessagesWithOptimisticUsers(
          prev,
          optimisticUserMessagesRef.current,
        );
        const applied = applyLiveTurnTimelineToMessages(withOptimistic, patch);
        const unchanged =
          applied.messages.length === prev.length &&
          applied.messages.every((message, index) => message === prev[index]);
        if (unchanged) {
          // User row may still be committing — retry once shortly.
          if (options?.seal !== true && options?.retry !== false) {
            window.setTimeout(() => {
              persistLiveTurnTimelineNow(turnUiRef.current, { retry: false });
            }, 50);
          }
          return prev;
        }
        if (liveTurnMessageIdRef.current !== applied.messageId) {
          liveTurnMessageIdRef.current = applied.messageId;
          setLiveTurnMessageId(applied.messageId);
        }
        saveAgentChatTranscript(chatIdRef.current, applied.messages);
        publishAgentChatTranscriptTimeline(chatIdRef.current, {
          id: applied.messageId,
          text: patch.text,
          createdAt: patch.createdAt,
          activities: patch.activities,
          segments: patch.segments,
          planSteps: patch.planSteps,
          proposedPlanMarkdown: patch.proposedPlanMarkdown,
          workedStartedAt: patch.workedStartedAt,
        });
        return applied.messages;
      });
    },
    [],
  );

  const schedulePersistLiveTurnTimeline = useCallback(() => {
    if (persistLiveTurnTimerRef.current != null) {
      window.clearTimeout(persistLiveTurnTimerRef.current);
    }
    persistLiveTurnTimerRef.current = window.setTimeout(() => {
      persistLiveTurnTimerRef.current = null;
      persistLiveTurnTimelineNow(turnUiRef.current);
    }, 120);
  }, [persistLiveTurnTimelineNow]);

  useEffect(() => {
    return () => {
      if (persistLiveTurnTimerRef.current != null) {
        window.clearTimeout(persistLiveTurnTimerRef.current);
      }
    };
  }, []);

  const patchTurnUi = useCallback(
    (recipe: (prev: AgentChatTurnUiState) => AgentChatTurnUiState) => {
      setTurnUi((prev) => {
        const next = recipe(prev);
        // Keep the ref in sync inside the updater so finalize/afterAgentResponse
        // in the same tick sees tools that just arrived via hooks/ACP.
        turnUiRef.current = next;
        return next;
      });
      schedulePersistLiveTurnTimeline();
    },
    [schedulePersistLiveTurnTimeline],
  );

  // Chat "Working…" follows the live turn only. List/board still use
  // agentStatus / PTY marks — OR'ing them here flashed bare "Working…" on an
  // empty chat before the user sent anything.
  const working = localTurnWorking;
  const sessionReady =
    Boolean(agentChatId?.trim()) || Boolean(agentAttachRequest);

  // Publish Chat ACP turn state into list/board/activity working indicators.
  // Promote while the local turn is active; drop the Chat research mark when
  // idle so a raced bump re-assert cannot leave "Working…" stuck after settle.
  // PTY hooks still publish via setWorkingTaskIds (not this research set).
  useEffect(() => {
    if (localTurnWorking) {
      turnActiveRef.current = true;
      setTaskResearchWorking(taskId, true);
      markLiveAgentWorkingForTask(taskId);
      return;
    }
    turnActiveRef.current = false;
    setTaskResearchWorking(taskId, false);
  }, [localTurnWorking, setTaskResearchWorking, taskId]);

  // PTY activity bumps refresh open/working ids in the terminal panel. Do not
  // re-assert research working here — clearLiveAgentWorkingForTask notifies
  // bumps while localTurnWorkingRef is still true for one frame, which used to
  // undo the settle clear and leave Working… stuck.

  // Load shared transcript from the laptop sidecar (falls back to local cache).
  // Preserve in-memory messages (bootstrap) if storage is still empty.
  useEffect(() => {
    const taskChanged = previousTaskIdRef.current !== taskId;
    previousTaskIdRef.current = taskId;
      if (taskChanged) {
      // Do not clear the previous task's working mark — its agent may still
      // be running and list/board pulses should keep reflecting that.
      bootstrapPromptKeyRef.current = null;
      turnActiveRef.current = false;
      liveTurnMessageIdRef.current = null;
      setLiveTurnMessageId(null);
      setTurnUi(emptyAgentChatTurnUiState());
      setTurnPending(false);
      setTurnStartedAt(null);
      setUiRequest(null);
      setUiRequestBusy(false);
      setQueuedFollowUps([]);
      setAskDrafts({});
      setAskQuestionIndex(0);
      setDiffSelection(null);
      setOptimisticUserMessages([]);
    }

    const id = agentChatId?.trim() || null;
    chatIdRef.current = id;

    if (!id) {
      // Session ended (Stop) or never bound — drop in-flight Working… chrome.
      // Working marks for list/board are cleared by Stop / turn-complete via
      // clearLiveAgentWorkingForTask — not here (avoids racing Start-agent).
      liveTurnMessageIdRef.current = null;
      setLiveTurnMessageId(null);
      setTurnUi(emptyAgentChatTurnUiState());
      setTurnPending(false);
      setTurnStartedAt(null);
      setUiRequest(null);
      setUiRequestBusy(false);
      setMessages([]);
      setOptimisticUserMessages([]);
      // Keep the unsent composer draft — navigating away / idle session must not
      // wipe what the user was typing (restored via agent-chat-composer-draft).
      setQueuedFollowUps([]);
      return;
    }

    // Show local cache immediately, then pull the shared sidecar copy.
    const maybeRehydrateLiveTurn = (list: AgentChatMessage[]) => {
      // Never resurrect Working… over an in-flight or just-settled local turn.
      if (localTurnWorkingRef.current || turnActiveRef.current) return;
      if (
        !isTaskAgentWorkingForUi(
          { id: taskId, status: taskStatus },
          agentStatus,
        )
      ) {
        return;
      }
      const open = findRehydratableLiveAssistant(list);
      if (!open) return;
      const restored = rehydrateTurnUiFromMessage(open);
      turnUiRef.current = restored;
      liveTurnMessageIdRef.current = open.id;
      setLiveTurnMessageId(open.id);
      setTurnUi(restored);
      setTurnPending(true);
      turnActiveRef.current = true;
      if (open.workedStartedAt != null) {
        setTurnStartedAt(open.workedStartedAt);
      }
    };

    setMessages((prev) => {
      const loaded = loadAgentChatTranscript(id);
      if (loaded.length === 0 && prev.length > 0) {
        saveAgentChatTranscript(id, prev);
        maybeRehydrateLiveTurn(prev);
        return prev;
      }
      if (loaded.length === 0) return [];
      const merged = mergeAgentChatTranscripts(loaded, prev);
      maybeRehydrateLiveTurn(merged);
      return merged;
    });

    let cancelled = false;
    const applyRemote = (loaded: AgentChatMessage[]) => {
      if (cancelled) return;
      setMessages((prev) => {
        if (loaded.length === 0) {
          if (prev.length > 0) {
            saveAgentChatTranscript(id, prev);
            return prev;
          }
          return [];
        }
        // During a live turn, merge remote in but keep local as the authority
        // for the open tail (T3: one writer for the unsettled turn).
        return mergeAgentChatTranscripts(loaded, prev);
      });
      if (!cancelled && !localTurnWorkingRef.current && !turnActiveRef.current) {
        const merged =
          loaded.length === 0
            ? loadAgentChatTranscript(id)
            : mergeAgentChatTranscripts(loaded, loadAgentChatTranscript(id));
        maybeRehydrateLiveTurn(merged);
      }
    };

    void syncAgentChatTranscript(id).then(applyRemote);

    // Keep Chat in sync when the other device (or hooks) appends turns.
    const timer = window.setInterval(() => {
      void syncAgentChatTranscript(id).then((loaded) => {
        if (cancelled || loaded.length === 0) return;
        // Don't let periodic sync fight an in-flight local turn.
        if (localTurnWorkingRef.current || turnActiveRef.current) return;
        setMessages((prev) => {
          const next = mergeAgentChatTranscripts(loaded, prev);
          if (
            next.length === prev.length &&
            next.every((message, index) => {
              const prior = prev[index];
              return (
                prior != null &&
                prior.id === message.id &&
                prior.text === message.text &&
                (prior.activities?.length ?? 0) ===
                  (message.activities?.length ?? 0)
              );
            })
          ) {
            return prev;
          }
          return next;
        });
      });
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [agentChatId, agentStatus, taskId, taskStatus]);

  useEffect(() => {
    // Local cache only — shared store is updated via publish / hooks.
    saveAgentChatTranscript(chatIdRef.current, messages);
  }, [messages]);

  useEffect(() => {
    setOptimisticUserMessages((existing) =>
      pruneOptimisticUserMessages(existing, messages),
    );
  }, [messages]);

  const displayMessages = useMemo(
    () =>
      mergeDisplayMessagesWithOptimisticUsers(
        messages,
        optimisticUserMessages,
      ),
    [messages, optimisticUserMessages],
  );

  useEffect(() => {
    writeAgentSurfaceTabs(taskId, surfaceTabState);
  }, [surfaceTabState, taskId]);

  useEffect(() => {
    writeAgentChatComposerDraft(taskId, { text: draft, images: draftImages });
  }, [draft, draftImages, taskId]);

  useLayoutEffect(() => {
    if (wasCollapsedRef.current && !collapsed) {
      setTranscriptLayoutKey((key) => key + 1);
    }
    wasCollapsedRef.current = collapsed;
  }, [collapsed]);

  // Tab focuses the agent composer; Escape unfocuses so task shortcuts (e.g. S) work.
  // Never auto-focus — only Tab (or an explicit click) should enter the message box.
  // Only while Chat is the active tab — Terminal keeps its own focus behavior.
  useEffect(() => {
    if (collapsed || viewMode !== "chat") return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.closest("[data-compose-modal]")) return;
        if (target.closest("[data-command-palette]")) return;
        if (target.closest("[data-searchable-dropdown-panel]")) return;
      }

      const active = document.activeElement;

      if (event.key === "Escape") {
        if (event.defaultPrevented) return;
        if (!isInsideAgentChatComposer(active)) return;
        event.preventDefault();
        event.stopPropagation();
        composerRef.current?.blur();
        if (active instanceof HTMLElement) {
          active.blur();
        }
        return;
      }

      if (event.key !== "Tab" || event.shiftKey) return;

      // Focused: leave Tab to the Lexical composer (slash/@ menus). Escape exits.
      if (isInsideAgentChatComposer(active)) return;

      // Leave other editors / comment composers alone (their own Tab flows).
      if (isEditableFocusTarget(active)) return;

      // Do not bail on defaultPrevented — app-shell useBlockBrowserTabFocus
      // preventDefaults Tab first (capture) to stop browser focus cycling.
      // We still need to move focus into the composer.
      const composer = rootRef.current?.querySelector<HTMLElement>(
        `[${AGENT_CHAT_COMPOSER_FOCUS_ATTR}="composer"]`,
      );
      if (
        !composer ||
        composer.getAttribute("contenteditable") === "false" ||
        (composer instanceof HTMLTextAreaElement && composer.disabled)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      composerRef.current?.focus();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [collapsed, viewMode]);

  // Record the Start-agent bootstrap prompt as the first user message once.
  // sessionIsNew means a bootstrap turn is already in flight (Start agent) —
  // not merely a fresh chat id (/clear).
  useEffect(() => {
    const request = agentAttachRequest;
    if (!request || request.taskId !== taskId) return;
    if (request.sessionIsNew) {
      // Bootstrap ACP turn is already in flight — light up Chat Working…
      // before the first session/update frame arrives.
      turnActiveRef.current = true;
      setTurnPending(true);
      setTurnStartedAt((prev) => prev ?? Date.now());
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

    const message = createAgentChatMessage("user", prompt);
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
    // Persist live timeline only after the user row is queued (T3 order).
    if (request.sessionIsNew) {
      window.setTimeout(() => {
        schedulePersistLiveTurnTimeline();
      }, 0);
    }
  }, [agentAttachRequest, schedulePersistLiveTurnTimeline, taskId]);

  const appendMessage = useCallback(
    (
      role: "user" | "assistant",
      text: string,
      activities?: AgentChatTurnUiState["activities"],
      extras?: {
        images?: readonly AgentChatImageAttachment[];
        gitHeadSha?: string | null;
        checkpointPatches?: readonly string[];
        planSteps?: AgentChatTurnUiState["planSteps"];
        proposedPlanMarkdown?: string | null;
        workedStartedAt?: number | null;
        segments?: AgentChatTurnUiState["segments"];
      },
    ) => {
    const trimmed = text.trim();
    if (!trimmed && !(extras?.images && extras.images.length > 0)) return;
    const finalizedActivities =
      role === "assistant" && activities && activities.length > 0
        ? finalizeTurnActivities(activities)
        : undefined;
    const finalizedSegments =
      role === "assistant"
        ? finalizeTurnSegments(
            extras?.segments && extras.segments.length > 0
              ? extras.segments
              : segmentsFromActivitiesAndText(finalizedActivities, trimmed),
          )
        : undefined;
    const message = createAgentChatMessage(role, trimmed || "(image)", {
      activities: finalizedActivities,
      segments:
        finalizedSegments && finalizedSegments.length > 0
          ? finalizedSegments
          : undefined,
      planSteps:
        role === "assistant" && extras?.planSteps && extras.planSteps.length > 0
          ? extras.planSteps
          : undefined,
      proposedPlanMarkdown:
        role === "assistant" ? extras?.proposedPlanMarkdown : undefined,
      workedStartedAt:
        role === "assistant" ? extras?.workedStartedAt : undefined,
      images: role === "user" ? extras?.images : undefined,
      gitHeadSha: role === "user" ? extras?.gitHeadSha : undefined,
      checkpointPatches:
        role === "assistant" ? extras?.checkpointPatches : undefined,
    });
    // T3: park the user row in optimistic state immediately so sync/persist
    // races cannot hide the prompt before it lands in `messages`.
    if (role === "user") {
      setOptimisticUserMessages((prev) => {
        if (prev.some((entry) => entry.id === message.id)) return prev;
        return [...prev, message];
      });
    }
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (
        role === "assistant" &&
        last?.role === "assistant" &&
        last.text === trimmed
      ) {
        // Same answer already recorded — attach timeline if the first write
        // arrived without activities (streaming race).
        if (
          (message.activities?.length &&
            (message.activities.length > (last.activities?.length ?? 0) ||
              !(last.activities && last.activities.length > 0))) ||
          (message.segments?.length &&
            (message.segments.length > (last.segments?.length ?? 0) ||
              !(last.segments && last.segments.length > 0))) ||
          (message.planSteps?.length &&
            (message.planSteps.length > (last.planSteps?.length ?? 0) ||
              !(last.planSteps && last.planSteps.length > 0) ||
              !planStepsEqual(message.planSteps, last.planSteps))) ||
          (message.workedStartedAt != null && last.workedStartedAt == null)
        ) {
          const upgraded = {
            ...last,
            activities:
              (message.activities?.length ?? 0) >= (last.activities?.length ?? 0)
                ? message.activities ?? last.activities
                : last.activities ?? message.activities,
            segments:
              (message.segments?.length ?? 0) >= (last.segments?.length ?? 0)
                ? message.segments ?? last.segments
                : last.segments ?? message.segments,
            planSteps: preferPlanSteps(last.planSteps, message.planSteps),
            proposedPlanMarkdown:
              message.proposedPlanMarkdown ?? last.proposedPlanMarkdown,
            workedStartedAt:
              last.workedStartedAt ?? message.workedStartedAt ?? null,
          };
          publishAgentChatTranscriptMessage(chatIdRef.current, upgraded);
          return [...prev.slice(0, -1), upgraded];
        }
        return prev;
      }
      if (
        role === "user" &&
        last?.role === "user" &&
        last.text === trimmed
      ) {
        return prev;
      }
      publishAgentChatTranscriptMessage(chatIdRef.current, message);
      return [...prev, message];
    });
  },
  []);

  const upgradeLastAssistantWithHook = useCallback(
    (message: {
      event?: string;
      activity?: string | null;
      text?: string | null;
      toolName?: string | null;
      toolUseId?: string | null;
      toolInput?: unknown;
      toolOutput?: string | null;
      errorMessage?: string | null;
      durationMs?: number | null;
    }) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== "assistant") return prev;
        const asTurn: AgentChatTurnUiState = {
          activities: last.activities ? [...last.activities] : [],
          segments: last.segments
            ? last.segments.map((segment) =>
                segment.kind === "text"
                  ? { ...segment }
                  : {
                      ...segment,
                      activities: segment.activities.map((item) => ({
                        ...item,
                      })),
                    },
              )
            : segmentsFromActivitiesAndText(last.activities, last.text),
          assistantDraft: "",
          phase: "idle",
          planSteps: last.planSteps ? [...last.planSteps] : [],
          proposedPlanMarkdown: last.proposedPlanMarkdown ?? null,
          pendingTools: {},
          toolCallPayloads: {},
        };
        const upgraded = applyAgentHookEventToTurn(asTurn, message);
        const activitiesChanged =
          JSON.stringify(upgraded.activities) !==
          JSON.stringify(last.activities ?? []);
        const segmentsChanged =
          JSON.stringify(upgraded.segments) !==
          JSON.stringify(last.segments ?? []);
        const plansChanged = !planStepsEqual(
          upgraded.planSteps,
          last.planSteps,
        );
        const planMdChanged =
          (upgraded.proposedPlanMarkdown ?? null) !==
          (last.proposedPlanMarkdown ?? null);
        if (
          !activitiesChanged &&
          !segmentsChanged &&
          !plansChanged &&
          !planMdChanged
        ) {
          return prev;
        }
        const nextMessage: AgentChatMessage = {
          ...last,
          activities: activitiesChanged
            ? upgraded.activities
            : last.activities,
          segments: segmentsChanged ? upgraded.segments : last.segments,
          planSteps: plansChanged ? upgraded.planSteps : last.planSteps,
          proposedPlanMarkdown:
            upgraded.proposedPlanMarkdown ?? last.proposedPlanMarkdown,
        };
        publishAgentChatTranscriptTimeline(chatIdRef.current, {
          id: nextMessage.id,
          text: nextMessage.text,
          createdAt: nextMessage.createdAt,
          activities: nextMessage.activities,
          segments: nextMessage.segments,
          planSteps: nextMessage.planSteps,
          proposedPlanMarkdown: nextMessage.proposedPlanMarkdown,
          workedStartedAt: nextMessage.workedStartedAt,
        });
        return [...prev.slice(0, -1), nextMessage];
      });
    },
    [],
  );

  const upgradeLastAssistantWithTodos = useCallback((params: unknown) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== "assistant") return prev;
      const asTurn: AgentChatTurnUiState = {
        activities: last.activities ? [...last.activities] : [],
        segments: last.segments
          ? last.segments.map((segment) =>
              segment.kind === "text"
                ? { ...segment }
                : {
                    ...segment,
                    activities: segment.activities.map((item) => ({
                      ...item,
                    })),
                  },
            )
          : segmentsFromActivitiesAndText(last.activities, last.text),
        assistantDraft: "",
        phase: "idle",
        planSteps: last.planSteps ? [...last.planSteps] : [],
        proposedPlanMarkdown: last.proposedPlanMarkdown ?? null,
        pendingTools: {},
        toolCallPayloads: {},
      };
      const upgraded = applyCursorUpdateTodosToTurn(asTurn, params);
      if (planStepsEqual(upgraded.planSteps, last.planSteps)) return prev;
      const nextMessage: AgentChatMessage = {
        ...last,
        planSteps: upgraded.planSteps,
      };
      publishAgentChatTranscriptTimeline(chatIdRef.current, {
        id: nextMessage.id,
        text: nextMessage.text,
        createdAt: nextMessage.createdAt,
        activities: nextMessage.activities,
        segments: nextMessage.segments,
        planSteps: nextMessage.planSteps,
        proposedPlanMarkdown: nextMessage.proposedPlanMarkdown,
        workedStartedAt: nextMessage.workedStartedAt,
      });
      saveAgentChatTranscript(chatIdRef.current, [
        ...prev.slice(0, -1),
        nextMessage,
      ]);
      return [...prev.slice(0, -1), nextMessage];
    });
  }, []);

  const finalizeAssistantTurn = useCallback(
    (text: string) => {
      const turn = turnUiRef.current;
      const trimmed = text.trim() || turn.assistantDraft.trim();
      let sealed = sealTurnUiState(turn);
      if (sealed.segments.length === 0 && sealed.activities.length > 0) {
        const sealedActivities = finalizeTurnActivities(sealed.activities);
        sealed = {
          ...sealed,
          activities: sealedActivities,
          segments: finalizeTurnSegments(
            segmentsFromActivitiesAndText(sealedActivities, trimmed),
          ),
        };
      }
      sealed = {
        ...sealed,
        assistantDraft: trimmed,
        phase: "idle",
      };
      turnUiRef.current = sealed;

      if (persistLiveTurnTimerRef.current != null) {
        window.clearTimeout(persistLiveTurnTimerRef.current);
        persistLiveTurnTimerRef.current = null;
      }

      const checkpointPatches = buildCheckpointPatchesFromActivities(
        sealed.activities,
      );
      const patch = liveTurnToTimelinePatch(sealed, {
        messageId: liveTurnMessageIdRef.current,
        workedStartedAt: turnStartedAtRef.current,
        seal: true,
      });
      if (patch) {
        setMessages((prev) => {
          const applied = applyLiveTurnTimelineToMessages(prev, patch);
          const last = applied.messages[applied.messages.length - 1];
          const withCheckpoint =
            last?.role === "assistant" && checkpointPatches.length > 0
              ? {
                  ...last,
                  checkpointPatches: [...checkpointPatches],
                }
              : last;
          const nextMessages =
            withCheckpoint && last
              ? [...applied.messages.slice(0, -1), withCheckpoint]
              : applied.messages;
          liveTurnMessageIdRef.current = applied.messageId;
          setLiveTurnMessageId(applied.messageId);
          saveAgentChatTranscript(chatIdRef.current, nextMessages);
          if (withCheckpoint) {
            publishAgentChatTranscriptTimeline(chatIdRef.current, {
              id: withCheckpoint.id,
              text: withCheckpoint.text,
              createdAt: withCheckpoint.createdAt,
              activities: withCheckpoint.activities,
              segments: withCheckpoint.segments,
              planSteps: withCheckpoint.planSteps,
              proposedPlanMarkdown: withCheckpoint.proposedPlanMarkdown,
              workedStartedAt: withCheckpoint.workedStartedAt,
            });
          }
          return nextMessages;
        });
      }

      turnActiveRef.current = false;
      turnUiRef.current = emptyAgentChatTurnUiState();
      setTurnUi(emptyAgentChatTurnUiState());
      setTurnPending(false);
      setTurnStartedAt(null);
      // Keep liveTurnMessageId until working clears so transcript can suppress
      // duplicate settled+live rows for one frame; clear on next send.
      // Clear before React re-renders: bump listeners still see the old
      // localTurnWorkingRef for this tick if we leave it true.
      localTurnWorkingRef.current = false;
      clearLiveAgentWorkingForTask(taskId);
      // Flush Cursor-style follow-ups after the live turn settles.
      window.setTimeout(() => {
        liveTurnMessageIdRef.current = null;
        setLiveTurnMessageId(null);
        flushQueuedFollowUpRef.current?.();
      }, 350);
    },
    [taskId],
  );

  const upgradeLastAssistantWithText = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => {
      const next = foldAssistantTextIntoLastMessage(prev, trimmed);
      if (next === prev) return prev;
      const last = next[next.length - 1];
      if (!last || last.role !== "assistant") return prev;
      saveAgentChatTranscript(chatIdRef.current, next);
      publishAgentChatTranscriptTimeline(chatIdRef.current, {
        id: last.id,
        text: last.text,
        createdAt: last.createdAt,
        activities: last.activities,
        segments: last.segments,
        planSteps: last.planSteps,
        proposedPlanMarkdown: last.proposedPlanMarkdown,
        workedStartedAt: last.workedStartedAt,
      });
      return next;
    });
  }, []);

  const handleAssistantMessage = useCallback(
    (forTaskId: string, text: string) => {
      if (forTaskId !== taskId) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      // T3: working follows turn/session lifecycle, not assistant text events.
      // pty-server: afterAgentResponse is text-only and often arrives *after*
      // stop — must not revive Working… (see WORKING_HOOK_EVENTS comment).
      if (!turnActiveRef.current && !localTurnWorkingRef.current) {
        upgradeLastAssistantWithText(trimmed);
        return;
      }
      // Mid-turn: stream text into the live timeline. Do not bump turnPending —
      // text alone is not a working signal (settle still owns clear).
      const next = applyAssistantTextToTurn(turnUiRef.current, trimmed);
      turnUiRef.current = next;
      setTurnUi(next);
      schedulePersistLiveTurnTimeline();
    },
    [schedulePersistLiveTurnTimeline, taskId, upgradeLastAssistantWithText],
  );

  const handleAcpSessionUpdate = useCallback(
    (forTaskId: string, update: unknown) => {
      if (forTaskId !== taskId) return;
      // Ignore frames that arrive after settle (or before the next send).
      if (!turnActiveRef.current && !localTurnWorkingRef.current) return;
      turnActiveRef.current = true;
      setTurnPending(true);
      setTurnStartedAt((prev) => prev ?? Date.now());
      patchTurnUi((prev) => applyAcpSessionUpdateToTurn(prev, update));
    },
    [patchTurnUi, taskId],
  );

  const handleCursorUpdateTodos = useCallback(
    (forTaskId: string, params: unknown) => {
      if (forTaskId !== taskId) return;
      // Late todo frames after settle — fold into the last assistant turn so
      // final "all completed" updates are not lost to the finalize race.
      if (!turnActiveRef.current && !localTurnWorkingRef.current) {
        upgradeLastAssistantWithTodos(params);
        return;
      }
      turnActiveRef.current = true;
      setTurnPending(true);
      setTurnStartedAt((prev) => prev ?? Date.now());
      patchTurnUi((prev) => applyCursorUpdateTodosToTurn(prev, params));
    },
    [patchTurnUi, taskId, upgradeLastAssistantWithTodos],
  );

  const handleCursorCreatePlan = useCallback(
    (forTaskId: string, params: unknown) => {
      if (forTaskId !== taskId) return;
      if (!turnActiveRef.current && !localTurnWorkingRef.current) return;
      turnActiveRef.current = true;
      setTurnPending(true);
      setTurnStartedAt((prev) => prev ?? Date.now());
      patchTurnUi((prev) => applyCursorCreatePlanToTurn(prev, params));
    },
    [patchTurnUi, taskId],
  );

  const handleAgentHookTurnUpdate = useCallback(
    (
      forTaskId: string,
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
    ) => {
      if (forTaskId !== taskId) return;
      if (!agentHookEventAffectsTurnUi(message)) return;
      // Late tool/todo frames after settle — fold into the last assistant turn
      // so Read/Edit/diff chrome is not lost to the finalize race.
      if (!turnActiveRef.current && !localTurnWorkingRef.current) {
        upgradeLastAssistantWithHook(message);
        return;
      }
      turnActiveRef.current = true;
      setTurnPending(true);
      setTurnStartedAt((prev) => prev ?? Date.now());
      patchTurnUi((prev) => applyAgentHookEventToTurn(prev, message));
    },
    [patchTurnUi, taskId, upgradeLastAssistantWithHook],
  );

  const handleAcpTurnSettled = useCallback(
    (forTaskId: string) => {
      if (forTaskId !== taskId) return;
      // If afterAgentResponse already finalized, this is a no-op (empty turn).
      finalizeAssistantTurn("");
    },
    [finalizeAssistantTurn, taskId],
  );

  const handleAcpUiRequest = useCallback(
    (forTaskId: string, request: AgentChatUiRequest) => {
      if (forTaskId !== taskId) return;
      setUiRequest(request);
      setUiRequestBusy(false);
      setAskDrafts({});
      setAskQuestionIndex(0);
    },
    [taskId],
  );

  const handleAcpUiRequestCleared = useCallback(
    (forTaskId: string, requestId: string | null) => {
      if (forTaskId !== taskId) return;
      setUiRequest((prev) => {
        if (!prev) return null;
        if (requestId && prev.requestId !== requestId) return prev;
        return null;
      });
      setUiRequestBusy(false);
      setAskDrafts({});
      setAskQuestionIndex(0);
    },
    [taskId],
  );

  useAgentAcpEvents({
    taskId,
    projectId,
    projectLabel,
    chatId: agentChatId,
    cwd,
    enabled: Boolean(taskId) && layoutReady,
    agentAttachRequest,
    onAgentAttachRequestHandled,
    agentEndRequest,
    onAgentEndRequestHandled,
    onAssistantMessage: handleAssistantMessage,
    onAcpSessionUpdate: handleAcpSessionUpdate,
    onCursorUpdateTodos: handleCursorUpdateTodos,
    onCursorCreatePlan: handleCursorCreatePlan,
    onAcpTurnSettled: handleAcpTurnSettled,
    onAcpUiRequest: handleAcpUiRequest,
    onAcpUiRequestCleared: handleAcpUiRequestCleared,
    onAgentHookTurnUpdate: handleAgentHookTurnUpdate,
    onAgentActivitySummaryChange,
    onWorkingTaskIdsChange,
    onAgentStatusItemsChange,
    onAgentOpenTaskIdsChange,
  });

  const askQuestions = useMemo(() => {
    if (!uiRequest || uiRequest.kind !== "ask_question") return [];
    const fromPayload = normalizeAskQuestions(uiRequest.questions);
    if (fromPayload.length > 0) return fromPayload;
    if (uiRequest.options.length === 0) return [];
    return [
      {
        id: "q-0",
        prompt: uiRequest.title,
        options: uiRequest.options,
        multiSelect: false,
      },
    ];
  }, [uiRequest]);

  const askProgress = useMemo(
    () => deriveAskProgress(askQuestions, askDrafts, askQuestionIndex),
    [askDrafts, askQuestionIndex, askQuestions],
  );

  const answerUiRequest = useCallback(
    async (options: {
      optionId?: string | null;
      preference?: "once" | "always" | "reject" | null;
      skipped?: boolean;
      answers?: Record<string, string | string[]> | null;
    }) => {
      const pending = uiRequest;
      if (!pending || uiRequestBusy) return;
      setUiRequestBusy(true);
      const result = await respondPtyAcpUiRequest({
        requestId: pending.requestId,
        optionId: options.optionId,
        preference: options.preference,
        skipped: options.skipped,
        answers: options.answers,
      });
      if (!result.ok) {
        setSendError(result.error);
        setUiRequestBusy(false);
        return;
      }
      setUiRequest(null);
      setUiRequestBusy(false);
      setAskDrafts({});
      setAskQuestionIndex(0);
    },
    [uiRequest, uiRequestBusy],
  );

  const handleAskAdvance = useCallback(() => {
    if (!askProgress.canAdvance) return;
    if (!askProgress.isLastQuestion) {
      setAskQuestionIndex((index) => index + 1);
      return;
    }
    const answers = buildAskAnswersPayload(askQuestions, askDrafts);
    if (!answers) return;
    void answerUiRequest({ answers });
  }, [answerUiRequest, askDrafts, askProgress, askQuestions]);

  const handleAskAdvanceRef = useRef(handleAskAdvance);
  handleAskAdvanceRef.current = handleAskAdvance;
  const askAutoAdvanceTimerRef = useRef<number | null>(null);

  const handleAskOptionToggle = useCallback(
    (optionLabel: string) => {
      const question = askProgress.activeQuestion;
      if (!question || uiRequestBusy) return;
      setAskDrafts((prev) => ({
        ...prev,
        [question.id]: toggleAskOption(
          question,
          prev[question.id],
          optionLabel,
        ),
      }));
      if (question.multiSelect) return;
      if (askAutoAdvanceTimerRef.current != null) {
        window.clearTimeout(askAutoAdvanceTimerRef.current);
      }
      askAutoAdvanceTimerRef.current = window.setTimeout(() => {
        askAutoAdvanceTimerRef.current = null;
        handleAskAdvanceRef.current();
      }, 200);
    },
    [askProgress.activeQuestion, uiRequestBusy],
  );

  useEffect(() => {
    return () => {
      if (askAutoAdvanceTimerRef.current != null) {
        window.clearTimeout(askAutoAdvanceTimerRef.current);
      }
    };
  }, []);

  // T3 digit shortcuts 1–9 for option selection.
  useEffect(() => {
    if (!uiRequest || uiRequest.kind !== "ask_question" || uiRequestBusy) {
      return;
    }
    const question = askProgress.activeQuestion;
    if (!question) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableFocusTarget(event.target)) return;
      const digit = Number.parseInt(event.key, 10);
      if (Number.isNaN(digit) || digit < 1 || digit > 9) return;
      const option = question.options[digit - 1];
      if (!option) return;
      event.preventDefault();
      event.stopPropagation();
      handleAskOptionToggle(option.label);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    askProgress.activeQuestion,
    handleAskOptionToggle,
    uiRequest,
    uiRequestBusy,
  ]);

  const handleRevertToMessage = useCallback(
    (messageId: string) => {
      const index = messages.findIndex((message) => message.id === messageId);
      if (index < 0) return;
      const anchor = messages[index];
      if (!anchor || anchor.role !== "user") return;
      if (
        !window.confirm(
          "Revert workspace files changed after this message and remove later turns?",
        )
      ) {
        return;
      }
      if (working) {
        clearLiveAgentWorkingForTask(taskId);
        void cancelPtyAcpTurn(taskId);
      }
      const later = messages.slice(index + 1);
      const patches = later.flatMap(
        (message) => message.checkpointPatches ?? [],
      );
      const paths = collectPathsFromPatches(patches);
      void revertPtyGitCheckpoint({
        cwd,
        headSha: anchor.gitHeadSha ?? null,
        paths,
        patches,
      }).then((result) => {
        if (!result.ok) {
          setSendError(result.error);
        }
      });
      setTurnPending(false);
      setTurnStartedAt(null);
      setTurnUi(emptyAgentChatTurnUiState());
      setDiffSelection(null);
      setMessages((prev) => prev.slice(0, index + 1));
    },
    [cwd, messages, taskId, working],
  );
  const handleOpenTurnDiff = useCallback(
    (turnId: string, filePath?: string) => {
      setDiffSelection({
        turnId,
        path: filePath?.trim() || null,
      });
      if (viewMode !== "chat") {
        setViewMode("chat");
        writeAgentChatViewMode("chat", viewScope);
      }
    },
    [viewMode, viewScope],
  );

  const diffFiles = diffSelection
    ? resolveTurnDiffFiles({
        turnId: diffSelection.turnId,
        messages: displayMessages,
        liveActivities: turnUi.activities,
      })
    : [];

  const {
    bodyRef,
    layoutMode: diffLayoutMode,
    panelWidth: diffPanelWidth,
    beginResize: beginDiffResize,
  } = useAgentDiffPanelLayout(Boolean(diffSelection));

  const dispatchPrompt = useCallback(
    (text: string, images: readonly AgentChatImageAttachment[]) => {
      if (!sessionReady) {
        setSendError("Start an agent from Activities first.");
        sendInFlightRef.current = false;
        return;
      }
      setSendError(null);
      turnActiveRef.current = true;
      // Stable live assistant id for the whole unsettled window (T3 turn id).
      const liveId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `live-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      liveTurnMessageIdRef.current = liveId;
      setLiveTurnMessageId(liveId);
      setTurnPending(true);
      setTurnStartedAt(Date.now());
      const optimistic = createOptimisticTurnUiState();
      turnUiRef.current = optimistic;
      setTurnUi(optimistic);
      // T3: optimistic user message first, then live/working chrome. Persisting
      // the assistant timeline before the user row races the reply above the prompt.
      appendMessage("user", text || "(image)", undefined, { images });
      schedulePersistLiveTurnTimeline();
      if (autoMarkInProgress) {
        void markTaskInProgressForAgent(client, taskId);
      }
      const imagePayload = images
        .filter((image) => image.dataBase64)
        .map((image) => ({
          mimeType: image.mimeType,
          data: image.dataBase64!,
        }));
      void (async () => {
        try {
          const gitHeadSha = await fetchPtyGitHead(cwd);
          if (gitHeadSha) {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (!last || last.role !== "user" || last.gitHeadSha === gitHeadSha) {
                return prev;
              }
              const nextMessage = { ...last, gitHeadSha };
              const next = [...prev.slice(0, -1), nextMessage];
              saveAgentChatTranscript(chatIdRef.current, next);
              publishAgentChatTranscriptMessage(chatIdRef.current, nextMessage);
              return next;
            });
          }
          markLiveAgentWorkingForTask(taskId);
          const result = await submitPtyAgentPrompt({
            taskId,
            prompt: text || " ",
            chatId: agentChatId,
            cwd,
            mode: agentMode,
            images: imagePayload,
          });
          if (!result.ok) {
            setSendError(result.error);
            turnActiveRef.current = false;
            liveTurnMessageIdRef.current = null;
            setLiveTurnMessageId(null);
            setTurnPending(false);
            setTurnStartedAt(null);
            setTurnUi(emptyAgentChatTurnUiState());
            clearLiveAgentWorkingForTask(taskId);
            flushingFollowUpRef.current = false;
          }
        } finally {
          sendInFlightRef.current = false;
        }
      })();
    },
    [
      agentChatId,
      agentMode,
      appendMessage,
      autoMarkInProgress,
      client,
      cwd,
      schedulePersistLiveTurnTimeline,
      sessionReady,
      taskId,
    ],
  );

  const flushQueuedFollowUp = useCallback(() => {
    if (flushingFollowUpRef.current || sendInFlightRef.current) return;
    if (localTurnWorkingRef.current || turnActiveRef.current) return;
    const next = queuedFollowUpsRef.current[0];
    if (!next) return;
    flushingFollowUpRef.current = true;
    setQueuedFollowUps((prev) => prev.slice(1));
    sendInFlightRef.current = true;
    dispatchPrompt(next.text, next.images);
    flushingFollowUpRef.current = false;
  }, [dispatchPrompt]);
  flushQueuedFollowUpRef.current = flushQueuedFollowUp;

  const clearComposerDraft = useCallback(() => {
    clearAgentChatComposerDraft(taskId);
    setDraft("");
    setDraftImages([]);
  }, [taskId]);

  const handleSend = useCallback(() => {
    const text = draft.trim();
    const images = draftImages;
    if (!text && images.length === 0) return;
    if (sendInFlightRef.current || startingAgent) return;
    if (!sessionReady) {
      if (!onStartAgent) {
        setSendError("Start an agent from Activities first.");
        return;
      }
      if (!text) {
        setSendError("Type a message to start the agent, or use Implement this task.");
        return;
      }
      clearComposerDraft();
      setSendError(null);
      onStartAgent({ prompt: text });
      return;
    }
    // Queue only while THIS panel has an in-flight turn — sticky list
    // Working… must not turn a fresh send into a follow-up.
    if (localTurnWorking || turnActiveRef.current) {
      setQueuedFollowUps((prev) => [
        ...prev,
        {
          id: newFollowUpId(),
          text: text || "(image)",
          images: [...images],
        },
      ]);
      clearComposerDraft();
      setSendError(null);
      return;
    }
    sendInFlightRef.current = true;
    clearComposerDraft();
    dispatchPrompt(text, images);
  }, [
    clearComposerDraft,
    dispatchPrompt,
    draft,
    draftImages,
    localTurnWorking,
    onStartAgent,
    sessionReady,
    startingAgent,
  ]);

  const handleStartOnTicket = useCallback(() => {
    if (startingAgent || sendInFlightRef.current) return;
    if (!onStartAgent) {
      setSendError("Start an agent from Activities first.");
      return;
    }
    clearComposerDraft();
    setSendError(null);
    onStartAgent();
  }, [clearComposerDraft, onStartAgent, startingAgent]);

  const removeQueuedFollowUp = useCallback((id: string) => {
    setQueuedFollowUps((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearLocalTurnWorking = useCallback(() => {
    turnActiveRef.current = false;
    setTurnPending(false);
    setTurnStartedAt(null);
    setTurnUi(emptyAgentChatTurnUiState());
    setUiRequest(null);
    setUiRequestBusy(false);
    setAskDrafts({});
    setAskQuestionIndex(0);
    localTurnWorkingRef.current = false;
    clearLiveAgentWorkingForTask(taskId);
  }, [taskId]);

  const handleCancel = useCallback(() => {
    clearLiveAgentWorkingForTask(taskId);
    void cancelPtyAcpTurn(taskId);
    // T3 blocks mid-turn send — we queue; cancel must not auto-flush the queue.
    setQueuedFollowUps([]);
    clearLocalTurnWorking();
  }, [clearLocalTurnWorking, taskId]);

  // Ctrl+C cancels the in-flight turn (Cursor TUI-style). Cmd+C stays copy on macOS.
  useEffect(() => {
    if (collapsed || viewMode !== "chat" || !working) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.key !== "c" && event.key !== "C") return;
      // Prefer ctrl (not meta): matches TUI interrupt; leaves ⌘C for copy.
      if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
        return;
      }

      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.closest("[data-compose-modal]")) return;
        if (target.closest("[data-command-palette]")) return;
        if (target.closest("[data-searchable-dropdown-panel]")) return;
      }

      const root = rootRef.current;
      const active = document.activeElement;
      // Don't steal Ctrl+C from other editors (task title, docs, etc.).
      if (
        active instanceof Node &&
        root &&
        !root.contains(active) &&
        isEditableFocusTarget(active)
      ) {
        return;
      }

      // Preserve copy when the user has an explicit selection.
      const selection = window.getSelection();
      if (
        selection &&
        !selection.isCollapsed &&
        (selection.toString()?.length ?? 0) > 0
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      handleCancel();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [collapsed, handleCancel, viewMode, working]);

  const handleClearChat = useCallback(() => {
    const previousChatId = agentChatId?.trim() || chatIdRef.current;
    clearLiveAgentWorkingForTask(taskId);
    void cancelPtyAcpTurn(taskId);
    clearLocalTurnWorking();
    setMessages([]);
    setOptimisticUserMessages([]);
    clearComposerDraft();
    setQueuedFollowUps([]);
    setDiffSelection(null);
    setSendError(null);
    if (previousChatId) {
      void clearAgentChatTranscript(previousChatId);
    }

    const workingDirectory = cwd?.trim();
    if (!workingDirectory || !sessionReady) {
      return;
    }

    void (async () => {
      const ensured = await ensurePtyAcpSession({
        taskId,
        cwd: workingDirectory,
        forceNew: true,
      });
      if (!ensured.ok) {
        setSendError(ensured.error);
        return;
      }
      const nextChatId = ensured.chatId;
      chatIdRef.current = nextChatId;
      saveAgentChatTranscript(nextChatId, []);
      void clearAgentChatTranscript(nextChatId);

      clearLiveAgentWorkingForTask(taskId);
      clearLocalTurnWorking();

      if (patchTaskValues) {
        try {
          await patchTaskValues({
            agentChatId: nextChatId,
            activityActor: "agent",
          });
        } catch (error) {
          setSendError(
            error instanceof Error
              ? error.message
              : "Could not bind the cleared agent session.",
          );
        }
      }

      // Fresh session only — no bootstrap prompt. Do not set sessionIsNew:
      // that flag means "Start agent turn already in flight" and would flash
      // Thinking / Working for… chrome on an empty cleared chat.
      requestAttach({
        taskId,
        chatId: nextChatId,
        forceReattach: true,
        focusUi: true,
      });
    })();
  }, [
    agentChatId,
    clearComposerDraft,
    clearLocalTurnWorking,
    cwd,
    patchTaskValues,
    requestAttach,
    sessionReady,
    taskId,
  ]);

  const handleStopAgent = useCallback(() => {
    clearLiveAgentWorkingForTask(taskId);
    void cancelPtyAcpTurn(taskId);
    clearLocalTurnWorking();
    onStopAgent?.();
  }, [clearLocalTurnWorking, onStopAgent, taskId]);

  const handleActivateSurfaceTab = useCallback((id: string) => {
    setSurfaceTabState((current) =>
      current.activeId === id ? current : { ...current, activeId: id },
    );
  }, []);

  const handleAddSurface = useCallback((kind: AgentSurfaceAddableKind) => {
    setSurfaceTabState((current) => addAgentSurfaceTab(current.tabs, kind));
  }, []);

  const handleCloseSurfaceTab = useCallback((id: string) => {
    setSurfaceTabState((current) =>
      closeAgentSurfaceTab(current.tabs, id, current.activeId),
    );
  }, []);

  const handleBrowserUrlChange = useCallback(
    (tabId: string, url: string, title: string) => {
      setSurfaceTabState((current) => ({
        ...current,
        tabs: updateAgentSurfaceTab(current.tabs, tabId, {
          resourceId: url,
          title,
        }),
      }));
    },
    [],
  );

  const activeSurfaceTab =
    surfaceTabs.find((tab) => tab.id === activeSurfaceTabId) ?? surfaceTabs[0];
  const activeSurfaceKind = activeSurfaceTab?.kind ?? "chat";
  const cwdAvailable = Boolean(cwd?.trim());
  const planMarkdownForSurface =
    turnUi.proposedPlanMarkdown?.trim() ||
    [...messages]
      .reverse()
      .find((message) => message.proposedPlanMarkdown?.trim())
      ?.proposedPlanMarkdown ||
    null;
  const planStepsForSurface =
    turnUi.planSteps.length > 0
      ? turnUi.planSteps
      : [...messages]
          .reverse()
          .find((message) => message.planSteps && message.planSteps.length > 0)
          ?.planSteps ?? [];

  const handleModelChange = useCallback((_modelId: string) => {
      // Model is applied on the next ACP prompt via readAgentChatModelId().
    }, []);

  const handleModeChange = useCallback(
    (mode: AgentChatMode) => {
      const previous = agentMode;
      writeAgentChatMode(mode);
      setAgentMode(mode);
      if (!sessionReady) return;
      // ACP-only mode switch (T3-style). Roll back the chip if set_mode fails.
      void setPtyAgentMode({
        taskId,
        mode,
        chatId: agentChatId,
        cwd,
      }).then((result) => {
        if (result.ok) return;
        writeAgentChatMode(previous);
        setAgentMode(previous);
        setSendError(result.error || "Could not set agent mode.");
      });
    },
    [agentChatId, agentMode, cwd, sessionReady, taskId],
  );

  // Apply preferred mode when a session becomes available (ACP).
  useEffect(() => {
    if (!sessionReady) return;
    void setPtyAgentMode({
      taskId,
      mode: readAgentChatMode(),
      chatId: agentChatId,
      cwd,
    });
  }, [agentChatId, cwd, sessionReady, taskId]);

  // After a natural settle (not cancel), flush one queued follow-up.
  useEffect(() => {
    if (working || queuedFollowUps.length === 0) return;
    const timer = window.setTimeout(() => {
      flushQueuedFollowUpRef.current?.();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [queuedFollowUps.length, working]);

  // Keep preference in sync if the same panel instance is reused across scopes.
  useEffect(() => {
    setViewMode(readAgentChatViewMode(viewScope));
  }, [viewScope]);

  // T3 ChatView: draft hero vertically centers the composer; timeline inset is 0.
  // Also used when no agent is bound yet (same empty UI as after /clear).
  const isDraftHeroState =
    displayMessages.length === 0 && !working && !uiRequest;
  const showTicketStart =
    isDraftHeroState && !sessionReady && Boolean(onStartAgent);
  const [
    attachDraftHeroTransitionGroupRef,
    attachDraftHeroComposerAnchorRef,
  ] = useDraftHeroLayoutTransition(isDraftHeroState);

  useEffect(() => {
    const footer = footerRef.current;
    if (!footer || typeof ResizeObserver === "undefined") return;
    const update = () => {
      if (isDraftHeroState) {
        setComposerOverlayHeight(0);
        return;
      }
      setComposerOverlayHeight(Math.ceil(footer.getBoundingClientRect().height));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(footer);
    return () => observer.disconnect();
  }, [
    isDraftHeroState,
    uiRequest,
    sendError,
    viewMode,
    queuedFollowUps.length,
    showTicketStart,
    startingAgent,
  ]);

  // Keep viewMode forced to chat (ACP-only — ADR-025).
  useEffect(() => {
    if (viewMode === "chat") return;
    setViewMode("chat");
    writeAgentChatViewMode("chat", viewScope);
  }, [viewMode, viewScope]);

  return (
    <div ref={rootRef} className="desktop-agent-chat" data-agent-chat>
      {agentError ? (
        <p className="desktop-agent-chat__error" role="alert">
          {agentError}
        </p>
      ) : null}

      <div
        ref={bodyRef}
        className={`desktop-agent-chat__body${
          diffSelection ? " is-diff-open" : ""
        }${
          diffSelection && diffLayoutMode === "sheet" ? " is-diff-sheet" : ""
        }${
          diffSelection && diffLayoutMode === "docked" ? " is-diff-docked" : ""
        }`}
        style={
          diffSelection && diffLayoutMode === "docked"
            ? ({
                ["--desktop-agent-diff-panel-width" as string]: `${diffPanelWidth}px`,
              } as CSSProperties)
            : undefined
        }
      >
        <div className="desktop-agent-chat__body-main">
          <DesktopAgentSurfaceTabBar
            tabs={surfaceTabs}
            activeId={activeSurfaceTabId}
            cwdAvailable={cwdAvailable}
            onActivate={handleActivateSurfaceTab}
            onClose={handleCloseSurfaceTab}
            onAddSurface={handleAddSurface}
            onStopAgent={
              onStopAgent && sessionReady ? handleStopAgent : undefined
            }
            onHide={onHide}
          />

          <div className="desktop-agent-chat__body-main-content">
            <div
              className={`desktop-agent-chat__pane desktop-agent-chat__pane--chat${
                activeSurfaceKind === "chat" ? " is-active" : " is-inactive"
              }`}
              aria-label="Chat"
              aria-hidden={activeSurfaceKind !== "chat"}
            >
            <DesktopAgentChatTranscript
              key={transcriptLayoutKey}
              messages={displayMessages}
              activities={turnUi.activities}
              segments={turnUi.segments}
              planSteps={turnUi.planSteps}
              proposedPlanMarkdown={turnUi.proposedPlanMarkdown}
              assistantDraft={turnUi.assistantDraft}
              working={working}
              liveTurnMessageId={liveTurnMessageId}
              turnStartedAt={turnStartedAt}
              composerOverlayHeight={
                isDraftHeroState ? 0 : composerOverlayHeight
              }
              onOpenTurnDiff={handleOpenTurnDiff}
              onRevertToMessage={handleRevertToMessage}
            />
            </div>

            {/* T3 ChatView: composer overlays the timeline so the scrollbar
                fills the full column; height is measured for end inset.
                Draft hero centers the composer + headline (T3 isDraftHeroState). */}
            <div
              ref={footerRef}
              className={`desktop-agent-chat__footer${
                isDraftHeroState ? " is-draft-hero" : ""
              }${
                activeSurfaceKind !== "chat" ? " is-surface-hidden" : ""
              }`}
              data-chat-composer-overlay="true"
              aria-hidden={activeSurfaceKind !== "chat"}
            >
              <div
                ref={attachDraftHeroTransitionGroupRef}
                className="desktop-agent-chat__footer-inner"
              >
            {isDraftHeroState ? (
              <div className="desktop-agent-chat__draft-hero-slot">
                {taskDisplayId?.trim() ? (
                  <p className="desktop-agent-chat__draft-hero-eyebrow">
                    {taskDisplayId.trim()}
                  </p>
                ) : null}
                <h1 className="desktop-agent-chat__draft-hero-headline">
                  What should we build in{" "}
                  <span className="desktop-agent-chat__draft-hero-project">
                    {projectLabel.trim() || "this project"}
                  </span>
                  ?
                </h1>
              </div>
            ) : null}
            {sendError ? (
              <p className="desktop-agent-chat__error" role="alert">
                {sendError}
              </p>
            ) : null}
            {queuedFollowUps.length > 0 ? (
              <div
                className="desktop-agent-chat__followups"
                aria-label="Queued follow-ups"
              >
                {queuedFollowUps.map((item, index) => (
                  <div
                    key={item.id}
                    className="desktop-agent-chat__followup"
                    role="status"
                  >
                    <div className="desktop-agent-chat__followup-header">
                      <span className="desktop-agent-chat__followup-label">
                        {index === 0 ? "Send next" : `Queued · ${index + 1}`}
                      </span>
                      <button
                        type="button"
                        className="desktop-agent-chat__followup-remove"
                        aria-label="Remove follow-up"
                        title="Remove"
                        onClick={() => removeQueuedFollowUp(item.id)}
                      >
                        ×
                      </button>
                    </div>
                    {item.images.length > 0 ? (
                      <div className="desktop-agent-chat__followup-images">
                        {item.images.map((image) =>
                          image.dataBase64 ? (
                            <img
                              key={image.id}
                              src={`data:${image.mimeType};base64,${image.dataBase64}`}
                              alt={image.name}
                            />
                          ) : null,
                        )}
                      </div>
                    ) : null}
                    <p className="desktop-agent-chat__followup-text">
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
            <div
              ref={attachDraftHeroComposerAnchorRef}
              className="desktop-agent-chat__composer-anchor"
            >
            <DesktopAgentChatComposer
              ref={composerRef}
              value={draft}
              cwd={cwd}
              mode={agentMode}
              images={draftImages}
              onImagesChange={setDraftImages}
              onChange={(next) => {
                setDraft(next);
                if (sendError) setSendError(null);
              }}
              onSend={handleSend}
              onCancel={handleCancel}
              onClearChat={handleClearChat}
              onModelChange={handleModelChange}
              onModeChange={handleModeChange}
              running={working}
              disabled={
                startingAgent || (!sessionReady && !onStartAgent && !working)
              }
              placeholder={
                uiRequest
                  ? uiRequest.kind === "ask_question"
                    ? "Type your own answer, or leave this blank to use the selected option"
                    : (uiRequest.detail ??
                      "Resolve this approval request to continue")
                  : startingAgent
                    ? "Starting agent…"
                    : !sessionReady
                      ? "Message the agent to start…"
                      : working
                        ? "Add a follow-up to send next…"
                        : "Message the agent… (@ files, / commands, paste images)"
              }
              pendingBanner={
                uiRequest ? (
                  <div
                    className={`desktop-agent-chat__approval${
                      uiRequest.kind === "ask_question"
                        ? " desktop-agent-chat__approval--ask"
                        : " desktop-agent-chat__approval--permission"
                    }`}
                    role="alertdialog"
                    aria-label={uiRequest.title}
                  >
                    {uiRequest.kind === "ask_question" &&
                    askProgress.activeQuestion ? (
                      <>
                        <div className="desktop-agent-chat__ask-header">
                          <span className="desktop-agent-chat__ask-eyebrow">
                            {askProgress.activeQuestion.header?.trim() ||
                              "Question"}
                          </span>
                          {askQuestions.length > 1 ? (
                            <span className="desktop-agent-chat__ask-count">
                              {askProgress.questionIndex + 1}/
                              {askQuestions.length}
                            </span>
                          ) : null}
                        </div>
                        <p className="desktop-agent-chat__approval-prompt">
                          {askProgress.activeQuestion.prompt}
                        </p>
                        {askProgress.activeQuestion.multiSelect ? (
                          <p className="desktop-agent-chat__approval-progress">
                            Select one or more options.
                          </p>
                        ) : null}
                        <div className="desktop-agent-chat__ask-options">
                          {askProgress.activeQuestion.options.map(
                            (option, index) => {
                              const customActive =
                                askProgress.customAnswer.trim().length > 0;
                              const selected =
                                !customActive &&
                                askProgress.selectedOptionLabels.includes(
                                  option.label,
                                );
                              const shortcutKey = index < 9 ? index + 1 : null;
                              return (
                                <button
                                  key={`${askProgress.activeQuestion?.id}:${option.label}`}
                                  type="button"
                                  className={`desktop-agent-chat__ask-option${
                                    selected ? " is-selected" : ""
                                  }`}
                                  disabled={uiRequestBusy}
                                  aria-pressed={selected}
                                  onClick={() =>
                                    handleAskOptionToggle(option.label)
                                  }
                                >
                                  <span className="desktop-agent-chat__ask-option-label">
                                    {option.label}
                                  </span>
                                  {selected ? (
                                    <Check
                                      className="desktop-agent-chat__ask-check"
                                      size={14}
                                      strokeWidth={2.2}
                                      aria-hidden
                                    />
                                  ) : shortcutKey != null ? (
                                    <kbd className="desktop-agent-chat__ask-kbd">
                                      {shortcutKey}
                                    </kbd>
                                  ) : null}
                                </button>
                              );
                            },
                          )}
                        </div>
                        <label className="desktop-agent-chat__ask-custom">
                          <span className="desktop-agent-chat__ask-custom-label">
                            Or type an answer
                          </span>
                          <input
                            type="text"
                            className="desktop-agent-chat__ask-custom-input"
                            value={askProgress.customAnswer}
                            disabled={uiRequestBusy}
                            placeholder="Custom answer…"
                            onChange={(event) => {
                              const question = askProgress.activeQuestion;
                              if (!question) return;
                              if (askAutoAdvanceTimerRef.current != null) {
                                window.clearTimeout(
                                  askAutoAdvanceTimerRef.current,
                                );
                                askAutoAdvanceTimerRef.current = null;
                              }
                              const value = event.target.value;
                              setAskDrafts((prev) => ({
                                ...prev,
                                [question.id]: setAskCustomAnswer(
                                  prev[question.id],
                                  value,
                                ),
                              }));
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter") return;
                              event.preventDefault();
                              if (askProgress.canAdvance) handleAskAdvance();
                            }}
                          />
                        </label>
                        <div className="desktop-agent-chat__approval-options">
                          {askProgress.questionIndex > 0 ? (
                            <button
                              type="button"
                              className="desktop-agent-chat__approval-option"
                              disabled={uiRequestBusy}
                              onClick={() => {
                                if (askAutoAdvanceTimerRef.current != null) {
                                  window.clearTimeout(
                                    askAutoAdvanceTimerRef.current,
                                  );
                                  askAutoAdvanceTimerRef.current = null;
                                }
                                setAskQuestionIndex((index) =>
                                  Math.max(0, index - 1),
                                );
                              }}
                            >
                              Back
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="desktop-agent-chat__approval-option is-primary"
                            disabled={uiRequestBusy || !askProgress.canAdvance}
                            onClick={() => {
                              if (askAutoAdvanceTimerRef.current != null) {
                                window.clearTimeout(
                                  askAutoAdvanceTimerRef.current,
                                );
                                askAutoAdvanceTimerRef.current = null;
                              }
                              handleAskAdvance();
                            }}
                          >
                            {askProgress.isLastQuestion ? "Submit" : "Next"}
                          </button>
                          <button
                            type="button"
                            className="desktop-agent-chat__approval-option"
                            disabled={uiRequestBusy}
                            onClick={() =>
                              void answerUiRequest({ skipped: true })
                            }
                          >
                            Skip
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        {(() => {
                          const copy = permissionApprovalCopy(
                            uiRequest.title,
                            uiRequest.detail,
                          );
                          return (
                            <>
                              <div className="desktop-agent-chat__approval-header">
                                <span className="desktop-agent-chat__approval-eyebrow">
                                  Pending approval
                                </span>
                                <span className="desktop-agent-chat__approval-summary">
                                  {copy.summary}
                                </span>
                              </div>
                              {uiRequest.detail ? (
                                <div className="desktop-agent-chat__approval-detail-card">
                                  <p className="desktop-agent-chat__approval-detail-label">
                                    {copy.detailLabel}
                                  </p>
                                  <pre className="desktop-agent-chat__approval-detail">
                                    {uiRequest.detail}
                                  </pre>
                                </div>
                              ) : uiRequest.title ? (
                                <div className="desktop-agent-chat__approval-detail-card">
                                  <p className="desktop-agent-chat__approval-detail-label">
                                    {copy.detailLabel}
                                  </p>
                                  <pre className="desktop-agent-chat__approval-detail">
                                    {uiRequest.title}
                                  </pre>
                                </div>
                              ) : null}
                            </>
                          );
                        })()}
                        <div className="desktop-agent-chat__approval-options">
                          {uiRequest.options.length > 0 ? (
                            uiRequest.options.map((option, index) => (
                              <button
                                key={option.id}
                                type="button"
                                className={`desktop-agent-chat__approval-option${
                                  index === 0 ? " is-primary" : ""
                                }`}
                                disabled={uiRequestBusy}
                                onClick={() =>
                                  void answerUiRequest({ optionId: option.id })
                                }
                              >
                                {permissionOptionLabel(option.label)}
                              </button>
                            ))
                          ) : (
                            <>
                              <button
                                type="button"
                                className="desktop-agent-chat__approval-option"
                                disabled={uiRequestBusy}
                                onClick={() =>
                                  void answerUiRequest({ preference: "reject" })
                                }
                              >
                                Decline
                              </button>
                              <button
                                type="button"
                                className="desktop-agent-chat__approval-option"
                                disabled={uiRequestBusy}
                                onClick={() =>
                                  void answerUiRequest({
                                    preference: "always",
                                  })
                                }
                              >
                                Always allow this session
                              </button>
                              <button
                                type="button"
                                className="desktop-agent-chat__approval-option is-primary"
                                disabled={uiRequestBusy}
                                onClick={() =>
                                  void answerUiRequest({ preference: "once" })
                                }
                              >
                                Approve once
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ) : null
              }
            />
            {showTicketStart ? (
              <div className="desktop-agent-chat__draft-hero-actions">
                <button
                  type="button"
                  className="desktop-agent-chat__draft-hero-ticket"
                  disabled={startingAgent}
                  aria-busy={startingAgent || undefined}
                  aria-label={
                    startingAgent
                      ? "Starting agent on ticket"
                      : taskDisplayId?.trim()
                        ? `Implement ${taskDisplayId.trim()}`
                        : "Implement this task"
                  }
                  title="Start the agent with the predefined ticket brief"
                  onClick={handleStartOnTicket}
                >
                  {startingAgent
                    ? "Starting…"
                    : taskDisplayId?.trim()
                      ? `Implement ${taskDisplayId.trim()}`
                      : "Implement this task"}
                </button>
              </div>
            ) : null}
            </div>
              </div>
            </div>

            {surfaceTabs.map((tab) => {
              if (tab.kind === "chat") return null;
              const active = tab.id === activeSurfaceTabId;
              return (
                <div
                  key={tab.id}
                  className={`desktop-agent-chat__pane desktop-agent-chat__pane--${tab.kind}${
                    active ? " is-active" : " is-inactive"
                  }`}
                  aria-label={tab.title}
                  aria-hidden={!active}
                >
                  {tab.kind === "browser" ? (
                    <AgentSurfaceBrowserPane
                      tabId={tab.id}
                      active={active && !collapsed}
                      initialUrl={tab.resourceId}
                      onUrlChange={(url, title) =>
                        handleBrowserUrlChange(tab.id, url, title)
                      }
                    />
                  ) : null}
                  {tab.kind === "terminal" && cwdAvailable && cwd ? (
                    <AgentSurfaceTerminalPane
                      cwd={cwd}
                      sessionKey={tab.id}
                      label={tab.title}
                    />
                  ) : null}
                  {tab.kind === "terminal" && !cwdAvailable ? (
                    <p className="agent-surface-empty">
                      Set a project working directory to open a terminal.
                    </p>
                  ) : null}
                  {tab.kind === "files" && cwdAvailable && cwd ? (
                    <AgentSurfaceFilesPane cwd={cwd} />
                  ) : null}
                  {tab.kind === "files" && !cwdAvailable ? (
                    <p className="agent-surface-empty">
                      Set a project working directory to browse files.
                    </p>
                  ) : null}
                  {tab.kind === "plan" ? (
                    <AgentSurfacePlanPane
                      proposedPlanMarkdown={planMarkdownForSurface}
                      planSteps={planStepsForSurface}
                    />
                  ) : null}
                  {tab.kind === "diff" ? (
                    <AgentSurfaceDiffPane
                      messages={messages}
                      liveActivities={turnUi.activities}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {diffSelection ? (
          <div
            className={`desktop-agent-chat__body-diff desktop-agent-chat__body-diff--${diffLayoutMode}`}
          >
            {diffLayoutMode === "docked" ? (
              <button
                type="button"
                className="desktop-agent-chat__diff-resize"
                aria-label="Resize diff panel"
                title="Drag to resize"
                onPointerDown={(event) => {
                  event.preventDefault();
                  beginDiffResize(event.clientX);
                }}
              />
            ) : null}
            <DesktopAgentChatDiffPanel
              files={diffFiles}
              initialPath={diffSelection.path}
              variant={diffLayoutMode}
              onClose={() => setDiffSelection(null)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
