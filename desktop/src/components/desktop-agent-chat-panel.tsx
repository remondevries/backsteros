import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ProjectsSidePanelIcon } from "@backsteros/ui";

import {
  emptyAgentChatTurnUiState,
  type AgentChatTurnUiState,
} from "../lib/agent/agent-acp-activity";
import type {
  AgentActivitySummary,
  StatusBarAgentItem,
} from "../lib/agent/agent-activity";
import { resolveAgentChatWorking } from "../lib/agent/agent-chat-working";
import { readAgentChatComposerDraft } from "../lib/agent/agent-chat-composer-draft";
import {
  loadAgentChatTranscript,
  readAgentChatViewMode,
  writeAgentChatViewMode,
  type AgentChatImageAttachment,
  type AgentChatMessage,
  type AgentChatViewMode,
  type AgentChatViewScope,
} from "../lib/agent/agent-chat-transcript";
import {
  readAgentChatMode,
  type AgentChatMode,
} from "../lib/agent/agent-chat-mode";
import {
  type AgentAttachRequest,
  type AgentEndRequest,
} from "../lib/agent/cursor-agent-cli";
import { type DesktopAgentChatComposerHandle } from "./desktop-agent-chat-composer";
import { DesktopAgentChatTranscript } from "./desktop-agent-chat-transcript";
import { DesktopAgentChatDiffPanel } from "./desktop-agent-chat-diff-panel";
import { useAgentDiffPanelLayout } from "../lib/agent/agent-chat-diff-panel-layout";
import { useDraftHeroLayoutTransition } from "../lib/agent/use-draft-hero-layout-transition";
import {
  readAgentChatModelId,
  resolveEffectiveAgentChatModelId,
} from "../lib/agent/agent-chat-model";
import {
  readAgentChatAccessMode,
  type AgentChatAccessMode,
} from "../lib/agent/agent-chat-runtime-mode";
import { type AskQuestionDraft } from "../lib/agent/agent-chat-ask";
import {
  resolveTurnDiffFiles,
  type AgentChatTurnDiffSelection,
} from "../lib/agent/agent-chat-timeline";
import {
  ensureChatTab,
  readAgentSurfaceTabs,
} from "../lib/agent/agent-surface-tabs";
import { DesktopAgentSurfaceTabBar } from "./desktop-agent-surface-tab-bar";
import { DesktopAgentCollapsedStrip } from "./desktop-agent-collapsed-strip";
import { AgentSurfaceEmptyPicker } from "./agent-surface/agent-surface-empty-picker";
import type {
  AgentChatUiRequest,
  FailedSteerDraft,
} from "./agent-chat/agent-chat-panel-helpers";
import {
  useAgentSessionSettings,
  useAgentTranscriptSync,
  useLiveTurnPersistence,
} from "./agent-chat/use-agent-chat-sync";
import {
  useAgentSurfaceFocusShortcuts,
  useAgentSurfaceTabsController,
} from "./agent-chat/use-agent-surface-controller";
import { useAgentBootstrapTurn } from "./agent-chat/use-agent-bootstrap-turn";
import { useAgentTurnLifecycle } from "./agent-chat/use-agent-turn-lifecycle";
import { useAgentAskApproval } from "./agent-chat/use-agent-ask-approval";
import { useAgentSendControls } from "./agent-chat/use-agent-send-controls";
import { AgentChatPanelFooterContent } from "./agent-chat/agent-chat-panel-footer";
import { AgentChatSurfacePanes } from "./agent-chat/agent-chat-surface-panes";

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
  /**
   * True while the parent layout is sliding the agent column. Keeps the
   * collapsed strip mounted through expand so dashed tabs can fade out.
   */
  collapseAnimating?: boolean;
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
  /** Collapse the agent column to the strip (Hide / ]). */
  onHide?: () => void;
  /** Expand the agent column from the collapsed strip / ⌘N. */
  onExpand?: () => void;
  /** Start a new agent session; optional prompt/images/mode override the default ticket brief. */
  onStartAgent?: (options?: {
    prompt?: string;
    images?: readonly AgentChatImageAttachment[];
    mode?: AgentChatMode | null;
  }) => void;
  startingAgent?: boolean;
  onStopAgent?: () => void;
  agentError?: string | null;
  /** Persist task fields (used by /clear to bind a fresh agentChatId). */
  patchTaskValues?: (values: Record<string, unknown>) => Promise<void>;
  /** Chat-only rail — no Browser/Files/Terminal tabs or Implement ticket button. */
  chatOnly?: boolean;
  /** Fires with final assistant text when a turn completes successfully. */
  onAssistantTurnComplete?: (text: string) => void;
  /** Override draft-hero headline when chatOnly (default: reply prompt). */
  draftHeroHeadline?: string | null;
  /** Composer bar only — no transcript, tabs, or draft hero (e.g. email compose). */
  composerOnly?: boolean;
  /** Override composer placeholder when {@link composerOnly}. */
  composerPlaceholder?: string | null;
  /**
   * Wrap the user composer text before ACP submit (UI still shows the short
   * text). Used by email chat to re-inject headers/body on every turn.
   */
  buildAgentPrompt?: (userText: string) => string;
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
  collapseAnimating = false,
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
  onExpand,
  onStartAgent,
  startingAgent = false,
  onStopAgent,
  agentError = null,
  patchTaskValues,
  chatOnly = false,
  onAssistantTurnComplete,
  draftHeroHeadline = null,
  composerOnly = false,
  composerPlaceholder = null,
  buildAgentPrompt,
}: DesktopAgentChatPanelProps) {
  const autoMarkInProgress = viewScope === "codebase";
  const [draft, setDraft] = useState(
    () => readAgentChatComposerDraft(taskId).text,
  );
  const [draftImages, setDraftImages] = useState<AgentChatImageAttachment[]>(
    () => readAgentChatComposerDraft(taskId).images,
  );
  /** Remount LegendList after expand so row width matches the restored pane. */
  const [transcriptLayoutKey, setTranscriptLayoutKey] = useState(0);
  /**
   * Keep the collapsed strip mounted through the expand slide so dashed tabs
   * can fade out instead of unmounting immediately.
   */
  const [collapsedStripMounted, setCollapsedStripMounted] = useState(collapsed);
  useEffect(() => {
    if (collapsed) {
      setCollapsedStripMounted(true);
      return;
    }
    if (!collapseAnimating) {
      setCollapsedStripMounted(false);
    }
  }, [collapsed, collapseAnimating]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<AgentChatViewMode>(() =>
    readAgentChatViewMode(viewScope),
  );
  const [surfaceTabState, setSurfaceTabState] = useState(() =>
    chatOnly ? ensureChatTab([]) : readAgentSurfaceTabs(taskId),
  );
  const { tabs: surfaceTabs, activeId: activeSurfaceTabId } = surfaceTabState;
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [messages, setMessages] = useState<AgentChatMessage[]>(() =>
    loadAgentChatTranscript(agentChatId),
  );
  /** T3: keep outgoing user rows visible until the persisted transcript acks them. */
  const [optimisticUserMessages, setOptimisticUserMessages] = useState<
    AgentChatMessage[]
  >([]);
  const [turnUi, setTurnUi] = useState<AgentChatTurnUiState>(() =>
    emptyAgentChatTurnUiState(),
  );
  /** Local optimistic working — do not wait for PTY/status round-trip. */
  const [turnPending, setTurnPending] = useState(false);
  const [uiRequestQueue, setUiRequestQueue] = useState<AgentChatUiRequest[]>(
    [],
  );
  const uiRequest = uiRequestQueue[0] ?? null;
  const [uiRequestBusy, setUiRequestBusy] = useState(false);
  /** Failed mid-turn steer — Retry/Discard above composer; never auto-flushed. */
  const [failedSteer, setFailedSteer] = useState<FailedSteerDraft | null>(null);
  /** Live ACP session model pin (null = use global last-picked). */
  const [sessionModelId, setSessionModelId] = useState<string | null>(null);
  const [globalModelId, setGlobalModelId] = useState(() =>
    readAgentChatModelId(),
  );
  const effectiveModelId = resolveEffectiveAgentChatModelId({
    sessionModelId,
    globalModelId,
  });
  /** Prevent double Enter / double-click from submitting the same draft twice. */
  const sendInFlightRef = useRef(false);
  const [sendInFlight, setSendInFlight] = useState(false);
  const setSendInFlightBoth = useCallback((value: boolean) => {
    sendInFlightRef.current = value;
    setSendInFlight(value);
  }, []);
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
  const [accessMode, setAccessMode] = useState<AgentChatAccessMode>(() =>
    readAgentChatAccessMode(taskId),
  );
  const footerRef = useRef<HTMLDivElement | null>(null);
  const bootstrapPromptKeyRef = useRef<string | null>(null);
  const chatIdRef = useRef(agentChatId);
  const composerRef = useRef<DesktopAgentChatComposerHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  /** Stable id for the in-progress assistant message (T3 durable timeline). */
  const liveTurnMessageIdRef = useRef<string | null>(null);
  const [liveTurnMessageId, setLiveTurnMessageId] = useState<string | null>(
    null,
  );
  const persistLiveTurnTimerRef = useRef<number | null>(null);

  const localTurnWorking =
    turnPending || turnUi.phase !== "idle" || sendInFlight;
  const localTurnWorkingRef = useRef(localTurnWorking);
  localTurnWorkingRef.current = localTurnWorking;
  /** True between user/bootstrap send and settle — ignores late ACP frames. */
  const turnActiveRef = useRef(false);
  /** User hit Stop — seal as interrupted when ACP acknowledges (or times out). */
  const cancellingRef = useRef(false);
  const cancelSettleTimerRef = useRef<number | null>(null);
  /** Sidecar-minted durable turn id for the live turn (steer / settle). */
  const activeTurnIdRef = useRef<string | null>(null);

  const turnUiRef = useRef(turnUi);
  turnUiRef.current = turnUi;

  const { schedulePersistLiveTurnTimeline, patchTurnUi } =
    useLiveTurnPersistence({
      optimisticUserMessages,
      liveTurnMessageIdRef,
      turnStartedAtRef,
      turnUiRef,
      persistLiveTurnTimerRef,
      chatIdRef,
      setMessages,
      setLiveTurnMessageId,
      setTurnUi,
    });

  // T3: send intent + turn phase (startingAgent / sendInFlight count as busy).
  const working = resolveAgentChatWorking({
    turnPending,
    turnPhase: turnUi.phase,
    startingAgent,
    sendInFlight,
  });
  // Composer Stop only after a live turn; Sending… while dispatching/start.
  const composerSending = sendInFlight || startingAgent;
  const composerRunning =
    !composerSending && (turnPending || turnUi.phase !== "idle");
  const sessionReady =
    Boolean(agentChatId?.trim()) || Boolean(agentAttachRequest);

  const { handleAccessModeChange } = useAgentSessionSettings({
    taskId,
    cwd,
    agentChatId,
    sessionReady,
    accessMode,
    setAccessMode,
    setGlobalModelId,
    setSessionModelId,
    setSurfaceTabState,
  });

  const { displayMessages } = useAgentTranscriptSync({
    taskId,
    taskStatus,
    agentChatId,
    chatOnly,
    collapsed,
    layoutReady,
    draft,
    draftImages,
    messages,
    optimisticUserMessages,
    surfaceTabState,
    localTurnWorking,
    localTurnWorkingRef,
    turnActiveRef,
    cancellingRef,
    cancelSettleTimerRef,
    liveTurnMessageIdRef,
    turnUiRef,
    bootstrapPromptKeyRef,
    chatIdRef,
    setMessages,
    setOptimisticUserMessages,
    setLiveTurnMessageId,
    setTurnUi,
    setTurnPending,
    setTurnStartedAt,
    setUiRequestQueue,
    setUiRequestBusy,
    setFailedSteer,
    setAskDrafts,
    setAskQuestionIndex,
    setDiffSelection,
    setTranscriptLayoutKey,
  });

  useAgentSurfaceFocusShortcuts({
    collapsed,
    viewMode,
    surfaceTabs,
    activeSurfaceTabId,
    composerRef,
    rootRef,
  });

  useAgentBootstrapTurn({
    taskId,
    startingAgent,
    agentAttachRequest,
    schedulePersistLiveTurnTimeline,
    liveTurnMessageIdRef,
    turnUiRef,
    turnActiveRef,
    bootstrapPromptKeyRef,
    chatIdRef,
    setLiveTurnMessageId,
    setTurnUi,
    setTurnPending,
    setTurnStartedAt,
    setOptimisticUserMessages,
    setMessages,
  });

  const {
    handleAcpUiRequest,
    handleAcpUiRequestCleared,
    askQuestions,
    askProgress,
    answerUiRequest,
    handleAskAdvance,
    handleAskOptionToggle,
    askAutoAdvanceTimerRef,
  } = useAgentAskApproval({
    taskId,
    uiRequest,
    uiRequestBusy,
    askDrafts,
    askQuestionIndex,
    setUiRequestQueue,
    setUiRequestBusy,
    setAskDrafts,
    setAskQuestionIndex,
    setSendError,
  });

  const { appendMessage, finalizeAssistantTurn } = useAgentTurnLifecycle({
    taskId,
    projectId,
    projectLabel,
    agentChatId,
    cwd,
    layoutReady,
    chatOnly,
    agentAttachRequest,
    onAgentAttachRequestHandled,
    agentEndRequest,
    onAgentEndRequestHandled,
    onAgentActivitySummaryChange,
    onWorkingTaskIdsChange,
    onAgentStatusItemsChange,
    onAgentOpenTaskIdsChange,
    onAssistantTurnComplete,
    handleAcpUiRequest,
    handleAcpUiRequestCleared,
    patchTurnUi,
    schedulePersistLiveTurnTimeline,
    setSendInFlightBoth,
    messages,
    turnUiRef,
    turnActiveRef,
    localTurnWorkingRef,
    cancellingRef,
    cancelSettleTimerRef,
    activeTurnIdRef,
    liveTurnMessageIdRef,
    persistLiveTurnTimerRef,
    turnStartedAtRef,
    chatIdRef,
    setMessages,
    setOptimisticUserMessages,
    setLiveTurnMessageId,
    setTurnUi,
    setTurnPending,
    setTurnStartedAt,
  });

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

  const {
    handleRevertToMessage,
    clearComposerDraft,
    showPlanFollowUpPrompt,
    handleSend,
    discardFailedSteer,
    retryFailedSteer,
    handleStartOnTicket,
    handleCancel,
    handleClearChat,
    handleStopAgent,
    handleModelChange,
    handleModeChange,
  } = useAgentSendControls({
    taskId,
    agentChatId,
    cwd,
    viewMode,
    collapsed,
    autoMarkInProgress,
    sessionReady,
    startingAgent,
    working,
    localTurnWorking,
    agentMode,
    setAgentMode,
    sessionModelId,
    setSessionModelId,
    setGlobalModelId,
    buildAgentPrompt,
    onStartAgent,
    onStopAgent,
    patchTaskValues,
    uiRequest,
    messages,
    turnUi,
    draft,
    draftImages,
    setDraft,
    setDraftImages,
    failedSteer,
    setFailedSteer,
    setSendError,
    sendInFlightRef,
    setSendInFlightBoth,
    setOptimisticUserMessages,
    setMessages,
    setDiffSelection,
    setUiRequestQueue,
    setUiRequestBusy,
    setAskDrafts,
    setAskQuestionIndex,
    setTurnPending,
    setTurnStartedAt,
    setTurnUi,
    setLiveTurnMessageId,
    appendMessage,
    schedulePersistLiveTurnTimeline,
    finalizeAssistantTurn,
    chatIdRef,
    turnUiRef,
    turnActiveRef,
    cancellingRef,
    cancelSettleTimerRef,
    activeTurnIdRef,
    liveTurnMessageIdRef,
    localTurnWorkingRef,
    rootRef,
  });

  const {
    handleActivateSurfaceTab,
    handleAddSurface,
    handlePickerAddSurface,
    handleCloseSurfaceTab,
    handleBrowserUrlChange,
    isCodebaseProject,
    diffAvailable,
  } = useAgentSurfaceTabsController({
    collapsed,
    cwd,
    viewScope,
    sessionReady,
    startingAgent,
    onStartAgent,
    onExpand,
    surfaceTabs,
    surfaceTabState,
    displayMessages,
    turnUi,
    setSurfaceTabState,
    setAddMenuOpen,
    clearComposerDraft,
    setSendError,
    handleStopAgent,
  });

  const surfacesEmpty = !chatOnly && surfaceTabs.length === 0;
  const activeSurfaceTab = surfacesEmpty
    ? undefined
    : (surfaceTabs.find((tab) => tab.id === activeSurfaceTabId) ??
      surfaceTabs[0]);
  const activeSurfaceKind = chatOnly
    ? "chat"
    : (activeSurfaceTab?.kind ?? null);
  const cwdAvailable = Boolean(cwd?.trim());
  const chatPickerAvailable = sessionReady || Boolean(onStartAgent);
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

  // Keep preference in sync if the same panel instance is reused across scopes.
  useEffect(() => {
    setViewMode(readAgentChatViewMode(viewScope));
  }, [viewScope]);

  // T3 ChatView: draft hero vertically centers the composer; timeline inset is 0.
  // Also used when no agent is bound yet (same empty UI as after /clear).
  const isDraftHeroState =
    displayMessages.length === 0 && !working && !uiRequest;
  const showTicketStart =
    !chatOnly && isDraftHeroState && !sessionReady && Boolean(onStartAgent);
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
    failedSteer,
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
    <div
      ref={rootRef}
      className={`desktop-agent-chat${collapsed ? " is-collapsed" : ""}${
        composerOnly ? " desktop-agent-chat--composer-only" : ""
      }`}
      data-agent-chat
    >
      {!composerOnly && collapsedStripMounted && onExpand ? (
        chatOnly ? (
          <button
            type="button"
            className="desktop-terminal-strip"
            title="Show agent panel (])"
            aria-label="Show agent panel"
            onClick={onExpand}
          >
            <ProjectsSidePanelIcon size={16} collapsed rail="end" />
          </button>
        ) : (
        <DesktopAgentCollapsedStrip
          tabs={surfaceTabs}
          activeId={activeSurfaceTabId}
          isCodebaseProject={isCodebaseProject}
          diffAvailable={diffAvailable}
          cwdAvailable={cwdAvailable}
          chatAvailable={chatPickerAvailable}
          onActivateTab={handleActivateSurfaceTab}
          onOpenKind={handlePickerAddSurface}
          onExpand={onExpand}
        />
        )
      ) : null}

      {agentError && !composerOnly ? (
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
          {!chatOnly ? (
          <DesktopAgentSurfaceTabBar
            tabs={surfaceTabs}
            activeId={activeSurfaceTabId}
            cwdAvailable={cwdAvailable}
            isCodebaseProject={isCodebaseProject}
            diffAvailable={diffAvailable}
            addMenuOpen={addMenuOpen}
            onAddMenuOpenChange={setAddMenuOpen}
            onActivate={handleActivateSurfaceTab}
            onClose={handleCloseSurfaceTab}
            onAddSurface={handleAddSurface}
            onHide={onHide}
          />
          ) : !composerOnly && onHide ? (
            <div className="desktop-agent-chat__chat-only-header">
              <button
                type="button"
                className="desktop-agent-chat__hide"
                onClick={onHide}
                title="Hide agent panel (])"
                aria-label="Hide agent panel"
              >
                Hide
              </button>
            </div>
          ) : null}

          <div className="desktop-agent-chat__body-main-content">
            {!chatOnly && surfacesEmpty ? (
              <AgentSurfaceEmptyPicker
                onAddSurface={handlePickerAddSurface}
                cwdAvailable={cwdAvailable}
                chatAvailable={chatPickerAvailable}
                isCodebaseProject={isCodebaseProject}
                diffAvailable={diffAvailable}
              />
            ) : (
              <>
            <div
              className={`desktop-agent-chat__pane desktop-agent-chat__pane--chat${
                activeSurfaceKind === "chat" ? " is-active" : " is-inactive"
              }`}
              aria-label="Chat"
              aria-hidden={activeSurfaceKind !== "chat"}
            >
            <div className="desktop-agent-chat__transcript-host">
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
              failedSteerMessageId={failedSteer?.id ?? null}
              composerOverlayHeight={
                isDraftHeroState ? 0 : composerOverlayHeight
              }
              onOpenTurnDiff={handleOpenTurnDiff}
              onRevertToMessage={handleRevertToMessage}
            />
            </div>
            </div>

            {/* T3 ChatView: composer overlays the timeline so the scrollbar
                fills the full column; height is measured for end inset.
                Draft hero centers the composer + headline (T3 isDraftHeroState). */}
            <div
              ref={footerRef}
              className={`desktop-agent-chat__footer${
                !composerOnly && isDraftHeroState ? " is-draft-hero" : ""
              }${
                composerOnly ? " desktop-agent-chat__footer--embedded" : ""
              }${
                activeSurfaceKind !== "chat" ? " is-surface-hidden" : ""
              }`}
              data-chat-composer-overlay={composerOnly ? undefined : "true"}
              aria-hidden={activeSurfaceKind !== "chat"}
            >
              <div
                ref={attachDraftHeroTransitionGroupRef}
                className="desktop-agent-chat__footer-inner"
              >
                <AgentChatPanelFooterContent
                  composerOnly={composerOnly}
                  chatOnly={chatOnly}
                  isDraftHeroState={isDraftHeroState}
                  taskDisplayId={taskDisplayId}
                  draftHeroHeadline={draftHeroHeadline}
                  projectLabel={projectLabel}
                  sendError={sendError}
                  setSendError={setSendError}
                  failedSteer={failedSteer}
                  retryFailedSteer={retryFailedSteer}
                  discardFailedSteer={discardFailedSteer}
                  attachDraftHeroComposerAnchorRef={
                    attachDraftHeroComposerAnchorRef
                  }
                  composerRef={composerRef}
                  draft={draft}
                  setDraft={setDraft}
                  cwd={cwd}
                  agentMode={agentMode}
                  draftImages={draftImages}
                  setDraftImages={setDraftImages}
                  handleSend={handleSend}
                  handleCancel={handleCancel}
                  handleClearChat={handleClearChat}
                  effectiveModelId={effectiveModelId}
                  handleModelChange={handleModelChange}
                  handleModeChange={handleModeChange}
                  accessMode={accessMode}
                  handleAccessModeChange={handleAccessModeChange}
                  composerSending={composerSending}
                  composerRunning={composerRunning}
                  showPlanFollowUpPrompt={showPlanFollowUpPrompt}
                  startingAgent={startingAgent}
                  sessionReady={sessionReady}
                  onStartAgent={onStartAgent}
                  working={working}
                  composerPlaceholder={composerPlaceholder}
                  uiRequest={uiRequest}
                  uiRequestQueue={uiRequestQueue}
                  uiRequestBusy={uiRequestBusy}
                  askProgress={askProgress}
                  askQuestions={askQuestions}
                  handleAskOptionToggle={handleAskOptionToggle}
                  askAutoAdvanceTimerRef={askAutoAdvanceTimerRef}
                  setAskDrafts={setAskDrafts}
                  setAskQuestionIndex={setAskQuestionIndex}
                  handleAskAdvance={handleAskAdvance}
                  answerUiRequest={answerUiRequest}
                  showTicketStart={showTicketStart}
                  handleStartOnTicket={handleStartOnTicket}
                />
              </div>
            </div>

            <AgentChatSurfacePanes
              surfaceTabs={surfaceTabs}
              activeSurfaceTabId={activeSurfaceTabId}
              chatOnly={chatOnly}
              collapsed={collapsed}
              addMenuOpen={addMenuOpen}
              cwd={cwd}
              cwdAvailable={cwdAvailable}
              planMarkdownForSurface={planMarkdownForSurface}
              planStepsForSurface={planStepsForSurface}
              messages={messages}
              turnUi={turnUi}
              handleBrowserUrlChange={handleBrowserUrlChange}
            />
              </>
            )}
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
