import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import {
  applyAcpSessionUpdateToTurn,
  applyAssistantTextToTurn,
  applyCursorCreatePlanToTurn,
  applyCursorUpdateTodosToTurn,
  createOptimisticTurnUiState,
  emptyAgentChatTurnUiState,
  finalizeTurnActivities,
  finalizeTurnSegments,
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
  liveTurnToTimelinePatch,
  rehydrateTurnUiFromMessage,
} from "../lib/agent/agent-chat-live-timeline";
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
  toggleAskOption,
  type AskQuestionDraft,
  type AskQuestionItem,
} from "../lib/agent/agent-chat-ask";
import {
  resolveTurnDiffFiles,
  type AgentChatTurnDiffSelection,
} from "../lib/agent/agent-chat-timeline";

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
  focusRequest?: number;
  onHide?: () => void;
  onStartAgent?: () => void;
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
  const [draft, setDraft] = useState("");
  const [draftImages, setDraftImages] = useState<AgentChatImageAttachment[]>(
    [],
  );
  const [sendError, setSendError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<AgentChatViewMode>(() =>
    readAgentChatViewMode(viewScope),
  );
  const [messages, setMessages] = useState<AgentChatMessage[]>(() =>
    loadAgentChatTranscript(agentChatId),
  );
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
    turnPending ||
    turnUi.phase !== "idle" ||
    turnUi.assistantDraft.length > 0;
  const localTurnWorkingRef = useRef(localTurnWorking);
  localTurnWorkingRef.current = localTurnWorking;
  /** True between user/bootstrap send and settle — ignores late ACP frames. */
  const turnActiveRef = useRef(false);

  const turnUiRef = useRef(turnUi);
  turnUiRef.current = turnUi;

  const persistLiveTurnTimelineNow = useCallback(
    (turn: AgentChatTurnUiState, options?: { seal?: boolean }) => {
      const patch = liveTurnToTimelinePatch(turn, {
        messageId: liveTurnMessageIdRef.current,
        workedStartedAt: turnStartedAtRef.current,
        seal: options?.seal === true,
      });
      if (!patch) return;
      setMessages((prev) => {
        const applied = applyLiveTurnTimelineToMessages(prev, patch);
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

  const statusWorking = isTaskAgentWorkingForUi(
    { id: taskId, status: taskStatus },
    agentStatus,
  );
  // Chat "Working…" follows the live turn. List/board still use statusWorking
  // via agentStatus; OR keeps the row lit for ACP turns with no local UI.
  const working = localTurnWorking || statusWorking;
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
      if (taskChanged) setMessages([]);
      return;
    }

    // Show local cache immediately, then pull the shared sidecar copy.
    const maybeRehydrateLiveTurn = (list: AgentChatMessage[]) => {
      if (localTurnWorkingRef.current) return;
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
        return mergeAgentChatTranscripts(loaded, prev);
      });
      if (!cancelled) {
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

  // Tab toggles agent composer focus ↔ unfocused so task shortcuts (e.g. S) work.
  // Only while Chat is the active tab — Terminal keeps its own focus behavior.
  useEffect(() => {
    if (collapsed || viewMode !== "chat") return;

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
      if (event.defaultPrevented) return;

      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.closest("[data-compose-modal]")) return;
        if (target.closest("[data-command-palette]")) return;
        if (target.closest("[data-searchable-dropdown-panel]")) return;
      }

      const active = document.activeElement;

      if (isInsideAgentChatComposer(active)) {
        event.preventDefault();
        event.stopPropagation();
        composerRef.current?.blur();
        if (active instanceof HTMLElement) {
          active.blur();
        }
        return;
      }

      // Leave other editors / comment composers alone (their own Tab flows).
      if (isEditableFocusTarget(active)) return;

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
      // Persist optimistic timeline so leave/return mid-bootstrap keeps chrome.
      window.setTimeout(() => {
        schedulePersistLiveTurnTimeline();
      }, 0);
    }
    const prompt = request.prompt?.trim();
    if (!prompt || !request.sessionIsNew) return;
    const key = `${request.chatId}:${prompt.slice(0, 80)}`;
    if (bootstrapPromptKeyRef.current === key) return;
    bootstrapPromptKeyRef.current = key;

    const message = createAgentChatMessage("user", prompt);
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
              !(last.planSteps && last.planSteps.length > 0))) ||
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
            planSteps:
              (message.planSteps?.length ?? 0) >= (last.planSteps?.length ?? 0)
                ? message.planSteps ?? last.planSteps
                : last.planSteps ?? message.planSteps,
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
        };
        const upgraded = applyAgentHookEventToTurn(asTurn, message);
        const activitiesChanged =
          JSON.stringify(upgraded.activities) !==
          JSON.stringify(last.activities ?? []);
        const segmentsChanged =
          JSON.stringify(upgraded.segments) !==
          JSON.stringify(last.segments ?? []);
        const plansChanged =
          JSON.stringify(upgraded.planSteps) !==
          JSON.stringify(last.planSteps ?? []);
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

  const finalizeAssistantTurn = useCallback(
    (text: string) => {
      const turn = turnUiRef.current;
      const trimmed = text.trim() || turn.assistantDraft.trim();
      const sealedActivities = finalizeTurnActivities(turn.activities);
      const sealedSegments = finalizeTurnSegments(
        turn.segments.length > 0
          ? turn.segments
          : segmentsFromActivitiesAndText(sealedActivities, trimmed),
      );
      const sealed: AgentChatTurnUiState = {
        ...turn,
        activities: sealedActivities,
        segments: sealedSegments,
        assistantDraft: trimmed,
        phase: "idle",
      };
      turnUiRef.current = sealed;

      if (persistLiveTurnTimerRef.current != null) {
        window.clearTimeout(persistLiveTurnTimerRef.current);
        persistLiveTurnTimerRef.current = null;
      }

      const checkpointPatches = buildCheckpointPatchesFromActivities(
        sealedActivities,
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

  const handleAssistantMessage = useCallback(
    (forTaskId: string, text: string) => {
      if (forTaskId !== taskId) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      // Show assistant text in the live timeline (as its own segment after
      // tools). Settle still happens on idle / prompt-complete so later tools
      // can open a new work block below this text.
      turnActiveRef.current = true;
      setTurnPending(true);
      setTurnStartedAt((prev) => prev ?? Date.now());
      // Update the ref synchronously so a same-tick settle (ACP prompt-complete)
      // still finalizes with this text.
      const next = applyAssistantTextToTurn(turnUiRef.current, trimmed);
      turnUiRef.current = next;
      setTurnUi(next);
      schedulePersistLiveTurnTimeline();
    },
    [schedulePersistLiveTurnTimeline, taskId],
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
      if (!turnActiveRef.current && !localTurnWorkingRef.current) return;
      turnActiveRef.current = true;
      setTurnPending(true);
      setTurnStartedAt((prev) => prev ?? Date.now());
      patchTurnUi((prev) => applyCursorUpdateTodosToTurn(prev, params));
    },
    [patchTurnUi, taskId],
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
    enabled: Boolean(taskId) && !collapsed && layoutReady,
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
      answers?: { questionId: string; selectedOptionIds: string[] }[] | null;
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

  const handleAskOptionToggle = useCallback(
    (optionId: string) => {
      const question = askProgress.activeQuestion;
      if (!question) return;
      setAskDrafts((prev) => ({
        ...prev,
        [question.id]: toggleAskOption(question, prev[question.id], optionId),
      }));
    },
    [askProgress.activeQuestion],
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
        messages,
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
      liveTurnMessageIdRef.current = null;
      setLiveTurnMessageId(null);
      setTurnPending(true);
      setTurnStartedAt(Date.now());
      const optimistic = createOptimisticTurnUiState();
      turnUiRef.current = optimistic;
      setTurnUi(optimistic);
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
          appendMessage("user", text || "(image)", undefined, {
            images,
            gitHeadSha,
          });
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

  const handleSend = useCallback(() => {
    const text = draft.trim();
    const images = draftImages;
    if (!text && images.length === 0) return;
    if (sendInFlightRef.current) return;
    if (!sessionReady) {
      setSendError("Start an agent from Activities first.");
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
      setDraft("");
      setDraftImages([]);
      setSendError(null);
      return;
    }
    sendInFlightRef.current = true;
    setDraft("");
    setDraftImages([]);
    dispatchPrompt(text, images);
  }, [
    dispatchPrompt,
    draft,
    draftImages,
    localTurnWorking,
    sessionReady,
  ]);

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
    setDraft("");
    setDraftImages([]);
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

      requestAttach({
        taskId,
        chatId: nextChatId,
        sessionIsNew: true,
        forceReattach: true,
        focusUi: true,
      });
    })();
  }, [
    agentChatId,
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

  // After cancel / ACP idle (no finalize path), flush any queued follow-ups.
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

  useEffect(() => {
    const footer = footerRef.current;
    if (!footer || typeof ResizeObserver === "undefined") return;
    const update = () => {
      setComposerOverlayHeight(Math.ceil(footer.getBoundingClientRect().height));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(footer);
    return () => observer.disconnect();
  }, [uiRequest, sendError, viewMode, queuedFollowUps.length]);

  // Keep viewMode forced to chat (ACP-only — ADR-025).
  useEffect(() => {
    if (viewMode === "chat") return;
    setViewMode("chat");
    writeAgentChatViewMode("chat", viewScope);
  }, [viewMode, viewScope]);

  if (!sessionReady && onStartAgent) {
    return (
      <div ref={rootRef} className="desktop-agent-chat" data-agent-chat>
        {agentError ? (
          <p className="desktop-agent-chat__error" role="alert">
            {agentError}
          </p>
        ) : null}
        <button
          type="button"
          className="desktop-agent-chat__start"
          disabled={startingAgent}
          aria-busy={startingAgent || undefined}
          aria-label={startingAgent ? "Creating agent" : "Start agent"}
          title="Start a new agent session bound to this task"
          onClick={() => onStartAgent()}
        >
          <span className="desktop-agent-chat__start-label">
            {startingAgent ? "Creating…" : "Start agent"}
          </span>
        </button>
      </div>
    );
  }

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
          <header className="desktop-agent-chat__header">
            <div className="desktop-agent-chat__header-main">
              <div className="desktop-agent-chat__tabs" aria-label="Agent chat">
                <span className="desktop-agent-chat__tab is-active">Chat</span>
              </div>
              {onStopAgent ? (
                <div className="desktop-agent-chat__header-agent-actions">
                  <button
                    type="button"
                    className="desktop-agent-chat__stop"
                    aria-label="Stop agent"
                    title="Stop agent — end the ACP session and clear this task's agent chat"
                    onClick={() => handleStopAgent()}
                  >
                    Stop
                  </button>
                </div>
              ) : null}
            </div>
            {onHide ? (
              <div className="desktop-agent-chat__header-actions">
                <button
                  type="button"
                  className="desktop-agent-chat__hide"
                  onClick={onHide}
                  title="Hide agent chat"
                >
                  Hide
                </button>
              </div>
            ) : null}
          </header>

          <div className="desktop-agent-chat__body-main-content">
            <div
              className="desktop-agent-chat__pane desktop-agent-chat__pane--chat is-active"
              aria-label="Chat"
            >
            <DesktopAgentChatTranscript
              messages={messages}
              activities={turnUi.activities}
              segments={turnUi.segments}
              planSteps={turnUi.planSteps}
              proposedPlanMarkdown={turnUi.proposedPlanMarkdown}
              assistantDraft={turnUi.assistantDraft}
              turnPhase={turnUi.phase}
              working={working}
              liveTurnMessageId={liveTurnMessageId}
              turnStartedAt={turnStartedAt}
              composerOverlayHeight={composerOverlayHeight}
              projectLabel={projectLabel}
              taskDisplayId={taskDisplayId}
              emptyHint="Send a message to talk to the agent."
              onOpenTurnDiff={handleOpenTurnDiff}
              onRevertToMessage={handleRevertToMessage}
            />
          </div>
          </div>

          <div ref={footerRef} className="desktop-agent-chat__footer">
            {sendError ? (
              <p className="desktop-agent-chat__error" role="alert">
                {sendError}
              </p>
            ) : null}
            {uiRequest ? (
              <div
                className="desktop-agent-chat__approval"
                role="alertdialog"
                aria-label={uiRequest.title}
              >
                <p className="desktop-agent-chat__approval-title">
                  {uiRequest.kind === "ask_question"
                    ? askQuestions.length > 1
                      ? `Agent question ${askProgress.questionIndex + 1} of ${askQuestions.length}`
                      : "Agent question"
                    : "Permission required"}
                  {" · "}
                  {uiRequest.title}
                </p>
                {uiRequest.kind === "ask_question" &&
                askProgress.activeQuestion ? (
                  <>
                    <p className="desktop-agent-chat__approval-prompt">
                      {askProgress.activeQuestion.prompt}
                    </p>
                    {askQuestions.length > 1 ? (
                      <p className="desktop-agent-chat__approval-progress">
                        {askProgress.answeredCount} of {askQuestions.length}{" "}
                        answered
                      </p>
                    ) : null}
                    <div className="desktop-agent-chat__approval-options">
                      {askProgress.activeQuestion.options.map((option) => {
                        const selected = askProgress.selectedOptionIds.includes(
                          option.id,
                        );
                        return (
                          <button
                            key={option.id}
                            type="button"
                            className={`desktop-agent-chat__approval-option${
                              selected ? " is-primary" : ""
                            }`}
                            disabled={uiRequestBusy}
                            aria-pressed={selected}
                            onClick={() => handleAskOptionToggle(option.id)}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="desktop-agent-chat__approval-options">
                      {askProgress.questionIndex > 0 ? (
                        <button
                          type="button"
                          className="desktop-agent-chat__approval-option"
                          disabled={uiRequestBusy}
                          onClick={() =>
                            setAskQuestionIndex((index) => Math.max(0, index - 1))
                          }
                        >
                          Back
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="desktop-agent-chat__approval-option is-primary"
                        disabled={uiRequestBusy || !askProgress.canAdvance}
                        onClick={() => handleAskAdvance()}
                      >
                        {askProgress.isLastQuestion ? "Submit" : "Next"}
                      </button>
                      <button
                        type="button"
                        className="desktop-agent-chat__approval-option"
                        disabled={uiRequestBusy}
                        onClick={() => void answerUiRequest({ skipped: true })}
                      >
                        Skip
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {uiRequest.detail ? (
                      <pre className="desktop-agent-chat__approval-detail">
                        {uiRequest.detail}
                      </pre>
                    ) : null}
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
                            {option.label}
                          </button>
                        ))
                      ) : uiRequest.kind === "permission" ? (
                        <>
                          <button
                            type="button"
                            className="desktop-agent-chat__approval-option is-primary"
                            disabled={uiRequestBusy}
                            onClick={() =>
                              void answerUiRequest({ preference: "once" })
                            }
                          >
                            Allow once
                          </button>
                          <button
                            type="button"
                            className="desktop-agent-chat__approval-option"
                            disabled={uiRequestBusy}
                            onClick={() =>
                              void answerUiRequest({ preference: "always" })
                            }
                          >
                            Always allow
                          </button>
                          <button
                            type="button"
                            className="desktop-agent-chat__approval-option"
                            disabled={uiRequestBusy}
                            onClick={() =>
                              void answerUiRequest({ preference: "reject" })
                            }
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="desktop-agent-chat__approval-option"
                          disabled={uiRequestBusy}
                          onClick={() => void answerUiRequest({ skipped: true })}
                        >
                          Skip
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
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
              disabled={!sessionReady && !working}
              placeholder={
                !sessionReady
                  ? "Start an agent to chat…"
                  : working
                    ? "Add a follow-up to send next…"
                    : "Message the agent… (@ files, / commands, paste images)"
              }
            />
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
