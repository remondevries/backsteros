import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

import {
  createOptimisticTurnUiState,
  emptyAgentChatTurnUiState,
  type AgentChatTurnUiState,
} from "../../lib/agent/agent-acp-activity";
import {
  clearAgentChatComposerDraft,
  writeAgentChatComposerDraft,
} from "../../lib/agent/agent-chat-composer-draft";
import {
  createAgentChatMessage,
  clearAgentChatTranscript,
  publishAgentChatTranscriptMessage,
  saveAgentChatTranscript,
  type AgentChatImageAttachment,
  type AgentChatMessage,
  type AgentChatViewMode,
} from "../../lib/agent/agent-chat-transcript";
import {
  readAgentChatMode,
  writeAgentChatMode,
  type AgentChatMode,
} from "../../lib/agent/agent-chat-mode";
import { resolvePlanFollowUpSubmission } from "../../lib/agent/t3-port/proposed-plan";
import { useDesktopAgentStatus } from "../../lib/agent/agent-status-context";
import {
  clearLiveAgentWorkingForTask,
  markLiveAgentWorkingForTask,
} from "../../lib/agent/clear-live-agent-working";
import { markTaskInProgressForAgent } from "../../lib/agent/agent-task-mutations";
import { useDesktopApi } from "../../lib/api-context";
import {
  cancelPtyAcpTurn,
  ensurePtyAcpSession,
  fetchPtyGitHead,
  restorePtyGitCheckpoint,
  setPtyAcpModel,
  setPtyAgentMode,
  steerPtyAcpTurn,
  submitPtyAgentPrompt,
} from "../../lib/pty";
import {
  readAgentChatModelId,
  writeAgentChatModelId,
} from "../../lib/agent/agent-chat-model";
import type { AskQuestionDraft } from "../../lib/agent/agent-chat-ask";
import type { AgentChatTurnDiffSelection } from "../../lib/agent/agent-chat-timeline";
import {
  isEditableFocusTarget,
  type AgentChatUiRequest,
  type FailedSteerDraft,
} from "./agent-chat-panel-helpers";

/**
 * Composer send / steer / cancel / clear / stop / revert controls plus
 * model & mode pickers for the live ACP session.
 */
export function useAgentSendControls({
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
}: {
  taskId: string;
  agentChatId: string | null;
  cwd: string | null;
  viewMode: AgentChatViewMode;
  collapsed: boolean;
  autoMarkInProgress: boolean;
  sessionReady: boolean;
  startingAgent: boolean;
  working: boolean;
  localTurnWorking: boolean;
  agentMode: AgentChatMode;
  setAgentMode: Dispatch<SetStateAction<AgentChatMode>>;
  sessionModelId: string | null;
  setSessionModelId: Dispatch<SetStateAction<string | null>>;
  setGlobalModelId: Dispatch<SetStateAction<string>>;
  buildAgentPrompt?: (userText: string) => string;
  onStartAgent?: (options?: {
    prompt?: string;
    images?: readonly AgentChatImageAttachment[];
    mode?: AgentChatMode | null;
  }) => void;
  onStopAgent?: () => void;
  patchTaskValues?: (values: Record<string, unknown>) => Promise<void>;
  uiRequest: AgentChatUiRequest | null;
  messages: AgentChatMessage[];
  turnUi: AgentChatTurnUiState;
  draft: string;
  draftImages: AgentChatImageAttachment[];
  setDraft: Dispatch<SetStateAction<string>>;
  setDraftImages: Dispatch<SetStateAction<AgentChatImageAttachment[]>>;
  failedSteer: FailedSteerDraft | null;
  setFailedSteer: Dispatch<SetStateAction<FailedSteerDraft | null>>;
  setSendError: Dispatch<SetStateAction<string | null>>;
  sendInFlightRef: RefObject<boolean>;
  setSendInFlightBoth: (value: boolean) => void;
  setOptimisticUserMessages: Dispatch<SetStateAction<AgentChatMessage[]>>;
  setMessages: Dispatch<SetStateAction<AgentChatMessage[]>>;
  setDiffSelection: Dispatch<SetStateAction<AgentChatTurnDiffSelection | null>>;
  setUiRequestQueue: Dispatch<SetStateAction<AgentChatUiRequest[]>>;
  setUiRequestBusy: Dispatch<SetStateAction<boolean>>;
  setAskDrafts: Dispatch<SetStateAction<Record<string, AskQuestionDraft>>>;
  setAskQuestionIndex: Dispatch<SetStateAction<number>>;
  setTurnPending: Dispatch<SetStateAction<boolean>>;
  setTurnStartedAt: Dispatch<SetStateAction<number | null>>;
  setTurnUi: Dispatch<SetStateAction<AgentChatTurnUiState>>;
  setLiveTurnMessageId: Dispatch<SetStateAction<string | null>>;
  appendMessage: (
    role: "user" | "assistant",
    text: string,
    activities?: AgentChatTurnUiState["activities"],
    extras?: { images?: readonly AgentChatImageAttachment[] },
  ) => void;
  schedulePersistLiveTurnTimeline: () => void;
  finalizeAssistantTurn: (
    text: string,
    options?: { interrupted?: boolean; failed?: boolean },
  ) => void;
  chatIdRef: RefObject<string | null>;
  turnUiRef: RefObject<AgentChatTurnUiState>;
  turnActiveRef: RefObject<boolean>;
  cancellingRef: RefObject<boolean>;
  cancelSettleTimerRef: RefObject<number | null>;
  activeTurnIdRef: RefObject<string | null>;
  liveTurnMessageIdRef: RefObject<string | null>;
  localTurnWorkingRef: RefObject<boolean>;
  rootRef: RefObject<HTMLDivElement | null>;
}) {
  const { client } = useDesktopApi();
  const { requestAttach } = useDesktopAgentStatus();

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
      const later = messages.slice(index + 1);
      const checkpointId =
        later.find((message) => message.checkpointId?.trim())?.checkpointId?.trim() ||
        null;
      const deleteCheckpointIds = later
        .map((message) => message.checkpointId?.trim() || "")
        .filter(Boolean);
      if (working) {
        cancellingRef.current = true;
        void cancelPtyAcpTurn(taskId);
      }
      if (!checkpointId) {
        setSendError(
          "No snapshot checkpoint for this turn — cannot safely revert.",
        );
        return;
      }
      void restorePtyGitCheckpoint({
        cwd,
        checkpointId,
        deleteCheckpointIds,
      }).then((result) => {
        if (!result.ok) {
          setSendError(result.error);
          return;
        }
        // Truncate Chat only after filesystem restore succeeds.
        setTurnPending(false);
        setTurnStartedAt(null);
        turnUiRef.current = emptyAgentChatTurnUiState();
        setTurnUi(emptyAgentChatTurnUiState());
        setDiffSelection(null);
        turnActiveRef.current = false;
        activeTurnIdRef.current = null;
        setMessages((prev) => {
          const next = prev.slice(0, index + 1);
          saveAgentChatTranscript(chatIdRef.current, next);
          return next;
        });
      });
    },
    [cwd, messages, taskId, working],
  );

  const restoreComposerDraft = useCallback(
    (text: string, images: readonly AgentChatImageAttachment[]) => {
      setDraft(text);
      setDraftImages([...images]);
      writeAgentChatComposerDraft(taskId, {
        text,
        images: [...images],
      });
    },
    [taskId],
  );

  const removeLastOptimisticUser = useCallback(
    (text: string, images: readonly AgentChatImageAttachment[]) => {
      const needle = (text || "(image)").trim();
      setMessages((prev) => {
        for (let i = prev.length - 1; i >= 0; i -= 1) {
          const row = prev[i];
          if (!row || row.role !== "user") continue;
          const sameText = row.text.trim() === needle;
          const sameImageCount =
            (row.images?.length ?? 0) === images.length;
          if (!sameText || !sameImageCount) continue;
          const next = [...prev.slice(0, i), ...prev.slice(i + 1)];
          saveAgentChatTranscript(chatIdRef.current, next);
          return next;
        }
        return prev;
      });
    },
    [],
  );

  const dispatchPrompt = useCallback(
    (
      text: string,
      images: readonly AgentChatImageAttachment[],
      options?: { mode?: AgentChatMode },
    ) => {
      if (!sessionReady) {
        setSendError("Start an agent from the Chat rail first.");
        setSendInFlightBoth(false);
        return;
      }
      setSendError(null);
      turnActiveRef.current = true;
      // Stable live assistant id for the whole unsettled window (T3 turn id).
      // Prefer projector-minted id from turn-begin when it arrives.
      if (!liveTurnMessageIdRef.current) {
        const liveId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `live-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        liveTurnMessageIdRef.current = liveId;
        setLiveTurnMessageId(liveId);
      }
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
        void markTaskInProgressForAgent(
          client,
          taskId,
          patchTaskValues
            ? async (_id, values) => {
                await patchTaskValues(values);
              }
            : undefined,
        );
      }
      const imagePayload = images
        .filter((image) => image.dataBase64)
        .map((image) => ({
          mimeType: image.mimeType,
          data: image.dataBase64!,
        }));
      const promptMode = options?.mode ?? agentMode;
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
          // New sessions: send global preference. Sidecar keeps session pin after.
          const acpPrompt = buildAgentPrompt
            ? buildAgentPrompt(text || " ")
            : text || " ";
          const result = await submitPtyAgentPrompt({
            taskId,
            prompt: acpPrompt,
            chatId: agentChatId,
            cwd,
            mode: promptMode,
            model: sessionModelId ?? readAgentChatModelId(),
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
            removeLastOptimisticUser(text, images);
            restoreComposerDraft(text, images);
          } else if (result.modelId) {
            setSessionModelId(result.modelId);
          }
        } finally {
          setSendInFlightBoth(false);
        }
      })();
    },
    [
      agentChatId,
      agentMode,
      appendMessage,
      autoMarkInProgress,
      buildAgentPrompt,
      client,
      cwd,
      removeLastOptimisticUser,
      restoreComposerDraft,
      schedulePersistLiveTurnTimeline,
      sessionModelId,
      sessionReady,
      setSendInFlightBoth,
      taskId,
    ],
  );

  const clearComposerDraft = useCallback(() => {
    clearAgentChatComposerDraft(taskId);
    setDraft("");
    setDraftImages([]);
  }, [taskId]);

  const pendingStartDraftRef = useRef<{
    text: string;
    images: AgentChatImageAttachment[];
  } | null>(null);
  const wasStartingAgentRef = useRef(false);

  useEffect(() => {
    const wasStarting = wasStartingAgentRef.current;
    wasStartingAgentRef.current = Boolean(startingAgent);
    if (wasStarting && !startingAgent) {
      const pending = pendingStartDraftRef.current;
      if (sessionReady) {
        pendingStartDraftRef.current = null;
        return;
      }
      // Start failed — drop optimistic Working… and restore composer.
      turnActiveRef.current = false;
      liveTurnMessageIdRef.current = null;
      setLiveTurnMessageId(null);
      setTurnPending(false);
      setTurnStartedAt(null);
      turnUiRef.current = emptyAgentChatTurnUiState();
      setTurnUi(emptyAgentChatTurnUiState());
      if (pending) {
        restoreComposerDraft(pending.text, pending.images);
        pendingStartDraftRef.current = null;
      }
    }
  }, [restoreComposerDraft, sessionReady, startingAgent]);

  const activeProposedPlanMarkdown = useMemo(() => {
    const fromTurn = turnUi.proposedPlanMarkdown?.trim();
    if (fromTurn) return fromTurn;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const markdown = messages[i]?.proposedPlanMarkdown?.trim();
      if (markdown) return markdown;
    }
    return null;
  }, [messages, turnUi.proposedPlanMarkdown]);

  const showPlanFollowUpPrompt =
    sessionReady &&
    !working &&
    !uiRequest &&
    agentMode === "plan" &&
    Boolean(activeProposedPlanMarkdown);

  const handleSend = useCallback(() => {
    const text = draft.trim();
    const images = draftImages;
    if (sendInFlightRef.current || startingAgent) return;

    // Plan Ready: empty → Implement (build), text → Refine (stay in plan).
    if (
      showPlanFollowUpPrompt &&
      activeProposedPlanMarkdown &&
      sessionReady &&
      !localTurnWorking &&
      !turnActiveRef.current
    ) {
      const followUp = resolvePlanFollowUpSubmission({
        draftText: text,
        planMarkdown: activeProposedPlanMarkdown,
      });
      writeAgentChatMode(followUp.mode);
      setAgentMode(followUp.mode);
      clearComposerDraft();
      setSendError(null);
      setSendInFlightBoth(true);
      dispatchPrompt(followUp.text, images, { mode: followUp.mode });
      return;
    }

    if (!text && images.length === 0) return;
    if (!sessionReady) {
      if (!onStartAgent) {
        setSendError("Start an agent from the Chat rail first.");
        return;
      }
      // Image-only start is allowed (t3 IMAGE_ONLY_BOOTSTRAP_PROMPT).
      pendingStartDraftRef.current = { text, images: [...images] };
      clearComposerDraft();
      setSendError(null);
      onStartAgent({
        prompt: text || undefined,
        images,
        mode: agentMode,
      });
      return;
    }
    // Mid-turn: steer-first. On failure keep Retry/Discard — never auto-flush.
    if (localTurnWorking || turnActiveRef.current || working) {
      const imagePayload = images
        .filter((image) => image.dataBase64)
        .map((image) => ({
          mimeType: image.mimeType,
          data: image.dataBase64!,
        }));
      const promptText = text || "(image)";
      const draftImagesCopy = [...images];
      clearComposerDraft();
      setSendError(null);
      setFailedSteer(null);
      setSendInFlightBoth(true);
      const optimistic = createAgentChatMessage("user", promptText, {
        images,
      });
      setOptimisticUserMessages((prev) => [...prev, optimistic]);
      void (async () => {
        const started = Date.now();
        let expectedTurnId = activeTurnIdRef.current?.trim() || "";
        while (!expectedTurnId && Date.now() - started < 400) {
          await new Promise((r) => window.setTimeout(r, 40));
          expectedTurnId = activeTurnIdRef.current?.trim() || "";
        }
        if (!expectedTurnId) {
          setSendInFlightBoth(false);
          // Keep optimistic user row; mark failed for Retry/Discard.
          setFailedSteer({
            id: optimistic.id,
            text: promptText,
            images: draftImagesCopy,
            error: "Turn not ready to steer yet",
          });
          setSendError("Couldn’t steer — Retry when ready, or Discard.");
          return;
        }
        const result = await steerPtyAcpTurn({
          taskId,
          expectedTurnId,
          prompt: promptText,
          images: imagePayload,
          clientMessageId: optimistic.id,
        });
        setSendInFlightBoth(false);
        if (result.ok) return;
        setFailedSteer({
          id: optimistic.id,
          text: promptText,
          images: draftImagesCopy,
          error: result.error,
        });
        setSendError(
          result.conflict
            ? "Couldn’t steer this turn — Retry or Discard."
            : result.error,
        );
      })();
      return;
    }
    setSendInFlightBoth(true);
    clearComposerDraft();
    dispatchPrompt(text, images);
  }, [
    activeProposedPlanMarkdown,
    agentMode,
    clearComposerDraft,
    dispatchPrompt,
    setSendInFlightBoth,
    draft,
    draftImages,
    localTurnWorking,
    onStartAgent,
    sessionReady,
    showPlanFollowUpPrompt,
    startingAgent,
    taskId,
    working,
  ]);

  const discardFailedSteer = useCallback(() => {
    const id = failedSteer?.id;
    setFailedSteer(null);
    setSendError(null);
    if (id) {
      setOptimisticUserMessages((prev) =>
        prev.filter((entry) => entry.id !== id),
      );
    }
  }, [failedSteer?.id]);

  const retryFailedSteer = useCallback(() => {
    const draftItem = failedSteer;
    if (!draftItem || sendInFlightRef.current || startingAgent) return;
    setFailedSteer(null);
    setSendError(null);
    const midTurn = localTurnWorking || turnActiveRef.current || working;
    if (midTurn) {
      const imagePayload = draftItem.images
        .filter((image) => image.dataBase64)
        .map((image) => ({
          mimeType: image.mimeType,
          data: image.dataBase64!,
        }));
      setSendInFlightBoth(true);
      setOptimisticUserMessages((prev) => {
        if (prev.some((entry) => entry.id === draftItem.id)) return prev;
        return [
          ...prev,
          {
            ...createAgentChatMessage("user", draftItem.text, {
              images: draftItem.images,
            }),
            id: draftItem.id,
          },
        ];
      });
      void (async () => {
        const started = Date.now();
        let expectedTurnId = activeTurnIdRef.current?.trim() || "";
        while (!expectedTurnId && Date.now() - started < 400) {
          await new Promise((r) => window.setTimeout(r, 40));
          expectedTurnId = activeTurnIdRef.current?.trim() || "";
        }
        if (!expectedTurnId) {
          setSendInFlightBoth(false);
          setFailedSteer({
            ...draftItem,
            error: "Turn not ready to steer yet",
          });
          setSendError("Couldn’t steer — Retry when ready, or Discard.");
          return;
        }
        const result = await steerPtyAcpTurn({
          taskId,
          expectedTurnId,
          prompt: draftItem.text,
          images: imagePayload,
          clientMessageId: draftItem.id,
        });
        setSendInFlightBoth(false);
        if (result.ok) return;
        setFailedSteer({
          ...draftItem,
          error: result.error,
        });
        setSendError(
          result.conflict
            ? "Couldn’t steer this turn — Retry or Discard."
            : result.error,
        );
      })();
      return;
    }
    // Idle: drop the failed optimistic row; dispatchPrompt adds a fresh user.
    setOptimisticUserMessages((prev) =>
      prev.filter((entry) => entry.id !== draftItem.id),
    );
    setSendInFlightBoth(true);
    dispatchPrompt(draftItem.text, draftItem.images);
  }, [
    dispatchPrompt,
    failedSteer,
    localTurnWorking,
    setSendInFlightBoth,
    startingAgent,
    taskId,
    working,
  ]);

  const handleStartOnTicket = useCallback(() => {
    if (startingAgent || sendInFlightRef.current) return;
    if (!onStartAgent) {
      setSendError("Start an agent from the Chat rail first.");
      return;
    }
    setFailedSteer(null);
    clearComposerDraft();
    setSendError(null);
    onStartAgent({ mode: agentMode });
  }, [agentMode, clearComposerDraft, onStartAgent, startingAgent]);

  const clearLocalTurnWorking = useCallback(() => {
    turnActiveRef.current = false;
    cancellingRef.current = false;
    if (cancelSettleTimerRef.current != null) {
      window.clearTimeout(cancelSettleTimerRef.current);
      cancelSettleTimerRef.current = null;
    }
    setTurnPending(false);
    setTurnStartedAt(null);
    setTurnUi(emptyAgentChatTurnUiState());
    setUiRequestQueue([]);
    setUiRequestBusy(false);
    setAskDrafts({});
    setAskQuestionIndex(0);
    localTurnWorkingRef.current = false;
    clearLiveAgentWorkingForTask(taskId);
  }, [taskId]);

  const handleCancel = useCallback(() => {
    if (cancellingRef.current) return;
    // Keep live turn chrome until ACP stop/idle seals as interrupted —
    // clearing turnUi here used to wipe partial Thinking/tools.
    cancellingRef.current = true;
    setSendInFlightBoth(false);
    // Stop cancels in-flight steers and clears failed-steer recovery.
    const failedId = failedSteer?.id;
    setFailedSteer(null);
    if (failedId) {
      setOptimisticUserMessages((prev) =>
        prev.filter((entry) => entry.id !== failedId),
      );
    }
    void cancelPtyAcpTurn(taskId).then((result) => {
      if (!cancellingRef.current) return;
      if (!result.ok || result.cancelled !== true) {
        finalizeAssistantTurn("", { interrupted: true });
        return;
      }
      // Stop accepted — wait for settle; fall back if the stop frame never arrives.
      if (cancelSettleTimerRef.current != null) {
        window.clearTimeout(cancelSettleTimerRef.current);
      }
      cancelSettleTimerRef.current = window.setTimeout(() => {
        cancelSettleTimerRef.current = null;
        if (cancellingRef.current) {
          finalizeAssistantTurn("", { interrupted: true });
        }
      }, 2500);
    });
  }, [failedSteer?.id, finalizeAssistantTurn, setSendInFlightBoth, taskId]);

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
    setFailedSteer(null);
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
    const failedId = failedSteer?.id;
    setFailedSteer(null);
    if (failedId) {
      setOptimisticUserMessages((prev) =>
        prev.filter((entry) => entry.id !== failedId),
      );
    }
    if (localTurnWorkingRef.current || turnActiveRef.current) {
      cancellingRef.current = true;
      finalizeAssistantTurn("", { interrupted: true });
    } else {
      clearLocalTurnWorking();
    }
    void cancelPtyAcpTurn(taskId);
    onStopAgent?.();
  }, [
    clearLocalTurnWorking,
    failedSteer?.id,
    finalizeAssistantTurn,
    onStopAgent,
    taskId,
  ]);

  const handleModelChange = useCallback(
    (modelId: string) => {
      writeAgentChatModelId(modelId);
      setGlobalModelId(modelId);
      if (!sessionReady) {
        setSessionModelId(null);
        return;
      }
      // Live session: apply + pin so this chat follows the user's pick.
      setSessionModelId(modelId);
      void setPtyAcpModel({
        taskId,
        model: modelId,
        chatId: agentChatId,
        cwd,
      }).then((result) => {
        if (!result.ok) {
          setSendError(result.error);
          return;
        }
        setSessionModelId(result.modelId);
      });
    },
    [agentChatId, cwd, sessionReady, taskId],
  );

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

  return {
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
  };
}
