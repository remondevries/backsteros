import {
  useCallback,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

import {
  applyAcpSessionUpdateToTurn,
  applyAssistantTextToTurn,
  applyCursorCreatePlanToTurn,
  applyCursorUpdateTodosToTurn,
  emptyAgentChatTurnUiState,
  finalizeTurnActivities,
  finalizeTurnSegments,
  sealTurnUiState,
  segmentsFromActivitiesAndText,
  type AgentChatTurnUiState,
} from "../../lib/agent/agent-acp-activity";
import {
  agentHookEventAffectsTurnUi,
  applyAgentHookEventToTurn,
} from "../../lib/agent/agent-hook-activity";
import type {
  AgentActivitySummary,
  StatusBarAgentItem,
} from "../../lib/agent/agent-activity";
import { shouldReopenLiveTurnFromLateFrame } from "../../lib/agent/agent-acp-settle";
import {
  createAgentChatMessage,
  publishAgentChatTranscriptMessage,
  publishAgentChatTranscriptTimeline,
  saveAgentChatTranscript,
  type AgentChatImageAttachment,
  type AgentChatMessage,
} from "../../lib/agent/agent-chat-transcript";
import {
  applyLiveTurnTimelineToMessages,
  findRehydratableLiveAssistant,
  foldAssistantTextIntoLastMessage,
  liveTurnToTimelinePatch,
  rehydrateTurnUiFromMessage,
} from "../../lib/agent/agent-chat-live-timeline";
import { resolveTurnWorkingStartedAt } from "../../lib/agent/agent-chat-work-ui";
import {
  planStepsEqual,
  preferPlanSteps,
} from "../../lib/agent/t3-port/cursor-todos";
import { buildCheckpointPatchesFromActivities } from "../../lib/agent/agent-chat-checkpoint";
import { useDesktopAgentStatus } from "../../lib/agent/agent-status-context";
import type {
  AgentAttachRequest,
  AgentEndRequest,
} from "../../lib/agent/cursor-agent-cli";
import {
  clearLiveAgentWorkingForTask,
  markLiveAgentWorkingForTask,
} from "../../lib/agent/clear-live-agent-working";
import { useAgentAcpEvents } from "../../lib/agent/use-agent-acp-events";
import {
  findPairedUserCreatedAt,
  type AgentChatUiRequest,
} from "./agent-chat-panel-helpers";

/**
 * Live-turn message/timeline callbacks + ACP event wiring for the Chat panel.
 * Live turns project server-side so switching tasks does not stop background
 * sessions; these callbacks fold frames into the transcript and seal turns.
 */
export function useAgentTurnLifecycle({
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
}: {
  taskId: string;
  projectId: string | null;
  projectLabel: string;
  agentChatId: string | null;
  cwd: string | null;
  layoutReady: boolean;
  chatOnly: boolean;
  agentAttachRequest: AgentAttachRequest | null;
  onAgentAttachRequestHandled?: () => void;
  agentEndRequest: AgentEndRequest | null;
  onAgentEndRequestHandled?: () => void;
  onAgentActivitySummaryChange?: (summary: AgentActivitySummary) => void;
  onWorkingTaskIdsChange?: (taskIds: string[]) => void;
  onAgentStatusItemsChange?: (items: StatusBarAgentItem[]) => void;
  onAgentOpenTaskIdsChange?: (taskIds: readonly string[]) => void;
  onAssistantTurnComplete?: (text: string) => void;
  handleAcpUiRequest: (forTaskId: string, request: AgentChatUiRequest) => void;
  handleAcpUiRequestCleared: (
    forTaskId: string,
    requestId: string | null,
  ) => void;
  patchTurnUi: (
    recipe: (prev: AgentChatTurnUiState) => AgentChatTurnUiState,
  ) => void;
  schedulePersistLiveTurnTimeline: () => void;
  setSendInFlightBoth: (value: boolean) => void;
  messages: AgentChatMessage[];
  turnUiRef: RefObject<AgentChatTurnUiState>;
  turnActiveRef: RefObject<boolean>;
  localTurnWorkingRef: RefObject<boolean>;
  cancellingRef: RefObject<boolean>;
  cancelSettleTimerRef: RefObject<number | null>;
  activeTurnIdRef: RefObject<string | null>;
  liveTurnMessageIdRef: RefObject<string | null>;
  persistLiveTurnTimerRef: RefObject<number | null>;
  turnStartedAtRef: RefObject<number | null>;
  chatIdRef: RefObject<string | null>;
  setMessages: Dispatch<SetStateAction<AgentChatMessage[]>>;
  setOptimisticUserMessages: Dispatch<SetStateAction<AgentChatMessage[]>>;
  setLiveTurnMessageId: Dispatch<SetStateAction<string | null>>;
  setTurnUi: Dispatch<SetStateAction<AgentChatTurnUiState>>;
  setTurnPending: Dispatch<SetStateAction<boolean>>;
  setTurnStartedAt: Dispatch<SetStateAction<number | null>>;
}) {
  const { isTaskAcpSessionBusy } = useDesktopAgentStatus();
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  /** Dedupes email concept-reply hook when settle races late assistant text. */
  const assistantTurnNotifiedRef = useRef<string | null>(null);
  const pendingTurnOutcomeRef = useRef<
    "completed" | "interrupted" | "failed" | null
  >(null);

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

  const resolveAssistantTurnText = useCallback(
    (explicit: string, turn: AgentChatTurnUiState): string => {
      const fromTurn = explicit.trim() || turn.assistantDraft.trim();
      if (fromTurn) return fromTurn;
      const rows = messagesRef.current;
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        const row = rows[i];
        if (row?.role === "assistant" && row.text.trim()) {
          return row.text.trim();
        }
      }
      return "";
    },
    [],
  );

  const notifyAssistantTurnComplete = useCallback(
    (text: string, turnOutcome: "completed" | "interrupted" | "failed") => {
      if (!onAssistantTurnComplete || turnOutcome !== "completed") return;
      const trimmed = text.trim();
      if (!trimmed) return;
      const messageId =
        liveTurnMessageIdRef.current ??
        [...messagesRef.current]
          .reverse()
          .find((row) => row.role === "assistant")?.id ??
        null;
      const key = `${messageId ?? "turn"}:${trimmed.slice(0, 240)}`;
      if (assistantTurnNotifiedRef.current === key) return;
      assistantTurnNotifiedRef.current = key;
      onAssistantTurnComplete(trimmed);
    },
    [onAssistantTurnComplete],
  );

  const finalizeAssistantTurn = useCallback(
    (text: string, options?: { interrupted?: boolean; failed?: boolean }) => {
      const turnAlreadyIdle =
        !turnActiveRef.current &&
        !localTurnWorkingRef.current &&
        turnUiRef.current.phase === "idle" &&
        !cancellingRef.current;
      if (turnAlreadyIdle) {
        // Late settle after afterAgentResponse upgraded the transcript row.
        window.setTimeout(() => {
          notifyAssistantTurnComplete(
            resolveAssistantTurnText(text, turnUiRef.current),
            "completed",
          );
        }, 0);
        return;
      }
      const pendingOutcome = pendingTurnOutcomeRef.current;
      pendingTurnOutcomeRef.current = null;
      const interrupted =
        options?.interrupted === true ||
        cancellingRef.current ||
        pendingOutcome === "interrupted";
      const failed =
        !interrupted &&
        (options?.failed === true || pendingOutcome === "failed");
      cancellingRef.current = false;
      activeTurnIdRef.current = null;
      if (cancelSettleTimerRef.current != null) {
        window.clearTimeout(cancelSettleTimerRef.current);
        cancelSettleTimerRef.current = null;
      }

      const turn = turnUiRef.current;
      const trimmed = resolveAssistantTurnText(text, turn);
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
      const turnOutcome = interrupted
        ? "interrupted"
        : failed
          ? "failed"
          : "completed";
      const patch = liveTurnToTimelinePatch(sealed, {
        messageId: liveTurnMessageIdRef.current,
        workedStartedAt: turnStartedAtRef.current,
        turnOutcome,
        seal: true,
      });
      if (patch) {
        setMessages((prev) => {
          const applied = applyLiveTurnTimelineToMessages(prev, patch);
          const last = applied.messages[applied.messages.length - 1];
          let sealedMessage = last;
          if (last?.role === "assistant") {
            sealedMessage = {
              ...last,
              turnOutcome,
              turnStatus: turnOutcome,
              ...(checkpointPatches.length > 0
                ? { checkpointPatches: [...checkpointPatches] }
                : {}),
            };
          }
          const nextMessages =
            sealedMessage && last
              ? [...applied.messages.slice(0, -1), sealedMessage]
              : applied.messages;
          liveTurnMessageIdRef.current = applied.messageId;
          setLiveTurnMessageId(applied.messageId);
          saveAgentChatTranscript(chatIdRef.current, nextMessages);
          if (sealedMessage) {
            publishAgentChatTranscriptTimeline(chatIdRef.current, {
              id: sealedMessage.id,
              text: sealedMessage.text,
              createdAt: sealedMessage.createdAt,
              activities: sealedMessage.activities,
              segments: sealedMessage.segments,
              planSteps: sealedMessage.planSteps,
              proposedPlanMarkdown: sealedMessage.proposedPlanMarkdown,
              workedStartedAt: sealedMessage.workedStartedAt,
              turnOutcome: sealedMessage.turnOutcome,
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
      setSendInFlightBoth(false);
      // Keep liveTurnMessageId until working clears so transcript can suppress
      // duplicate settled+live rows for one frame; clear on next send.
      // Clear before React re-renders: bump listeners still see the old
      // localTurnWorkingRef for this tick if we leave it true.
      localTurnWorkingRef.current = false;
      clearLiveAgentWorkingForTask(taskId);
      // Steer-first: never auto-dispatch a deferred prompt after settle.
      window.setTimeout(() => {
        liveTurnMessageIdRef.current = null;
        setLiveTurnMessageId(null);
      }, 350);

      if (
        onAssistantTurnComplete &&
        turnOutcome === "completed" &&
        trimmed.length > 0
      ) {
        notifyAssistantTurnComplete(trimmed, turnOutcome);
      }
    },
    [
      notifyAssistantTurnComplete,
      resolveAssistantTurnText,
      setSendInFlightBoth,
      taskId,
    ],
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
        if (chatOnly && onAssistantTurnComplete) {
          window.setTimeout(() => {
            notifyAssistantTurnComplete(trimmed, "completed");
          }, 0);
        }
        return;
      }
      // Mid-turn: stream text into the live timeline. Do not bump turnPending —
      // text alone is not a working signal (settle still owns clear).
      const next = applyAssistantTextToTurn(turnUiRef.current, trimmed);
      turnUiRef.current = next;
      setTurnUi(next);
      schedulePersistLiveTurnTimeline();
    },
    [chatOnly, notifyAssistantTurnComplete, schedulePersistLiveTurnTimeline, taskId, upgradeLastAssistantWithText],
  );

  const reopenLiveTurnIfAgentStillWorking = useCallback(() => {
    // Only reopen from late ACP frames while the session is still busy —
    // not from stale optimistic list marks (research/Start pulse).
    if (
      !shouldReopenLiveTurnFromLateFrame({
        localTurnActive:
          localTurnWorkingRef.current || turnActiveRef.current,
        sessionBusy: isTaskAcpSessionBusy(taskId),
      })
    ) {
      return;
    }
    setMessages((prev) => {
      const open =
        findRehydratableLiveAssistant(prev) ??
        // Bootstrap can seal with acknowledgment text before todos land —
        // still reopen the latest assistant while the ACP session is busy.
        (prev[prev.length - 1]?.role === "assistant"
          ? prev[prev.length - 1]!
          : null);
      if (!open || open.role !== "assistant") return prev;
      const restored = rehydrateTurnUiFromMessage(open);
      turnUiRef.current = restored;
      liveTurnMessageIdRef.current = open.id;
      setLiveTurnMessageId(open.id);
      setTurnUi(restored);
      setTurnPending(true);
      turnActiveRef.current = true;
      const resolvedStart = resolveTurnWorkingStartedAt({
        workedStartedAt: open.workedStartedAt,
        userCreatedAt: findPairedUserCreatedAt(prev, open.id),
      });
      setTurnStartedAt((prevStarted) => resolvedStart ?? prevStarted ?? Date.now());
      markLiveAgentWorkingForTask(taskId);
      return prev;
    });
  }, [isTaskAcpSessionBusy, taskId]);

  const handleAcpSessionUpdate = useCallback(
    (forTaskId: string, update: unknown) => {
      if (forTaskId !== taskId) return;
      // Ignore frames that arrive after settle (or before the next send),
      // unless Start-agent sealed early while the ACP session is still busy.
      if (!turnActiveRef.current && !localTurnWorkingRef.current) {
        reopenLiveTurnIfAgentStillWorking();
        if (!turnActiveRef.current && !localTurnWorkingRef.current) return;
      }
      turnActiveRef.current = true;
      setTurnPending(true);
      setTurnStartedAt((prev) => prev ?? Date.now());
      patchTurnUi((prev) => applyAcpSessionUpdateToTurn(prev, update));
    },
    [patchTurnUi, reopenLiveTurnIfAgentStillWorking, taskId],
  );

  const handleCursorUpdateTodos = useCallback(
    (forTaskId: string, params: unknown) => {
      if (forTaskId !== taskId) return;
      // Late todo frames after settle — fold into the last assistant turn so
      // final "all completed" updates are not lost to the finalize race.
      if (!turnActiveRef.current && !localTurnWorkingRef.current) {
        upgradeLastAssistantWithTodos(params);
        // Start-agent can seal early; reopen Working… when todos keep moving.
        reopenLiveTurnIfAgentStillWorking();
        return;
      }
      turnActiveRef.current = true;
      setTurnPending(true);
      setTurnStartedAt((prev) => prev ?? Date.now());
      patchTurnUi((prev) => applyCursorUpdateTodosToTurn(prev, params));
    },
    [
      patchTurnUi,
      reopenLiveTurnIfAgentStillWorking,
      taskId,
      upgradeLastAssistantWithTodos,
    ],
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
        reopenLiveTurnIfAgentStillWorking();
        return;
      }
      turnActiveRef.current = true;
      setTurnPending(true);
      setTurnStartedAt((prev) => prev ?? Date.now());
      patchTurnUi((prev) => applyAgentHookEventToTurn(prev, message));
    },
    [
      patchTurnUi,
      reopenLiveTurnIfAgentStillWorking,
      taskId,
      upgradeLastAssistantWithHook,
    ],
  );

  const handleAcpTurnSettled = useCallback(
    (forTaskId: string) => {
      if (forTaskId !== taskId) return;
      // If afterAgentResponse already finalized, this is a no-op (empty turn).
      finalizeAssistantTurn("");
    },
    [finalizeAssistantTurn, taskId],
  );

  useAgentAcpEvents({
    taskId,
    projectId,
    projectLabel,
    chatId: agentChatId,
    cwd,
    enabled: Boolean(taskId) && (layoutReady || chatOnly),
    agentAttachRequest,
    onAgentAttachRequestHandled,
    agentEndRequest,
    onAgentEndRequestHandled,
    onAssistantMessage: handleAssistantMessage,
    onAcpSessionUpdate: handleAcpSessionUpdate,
    onCursorUpdateTodos: handleCursorUpdateTodos,
    onCursorCreatePlan: handleCursorCreatePlan,
    onAcpTurnSettled: handleAcpTurnSettled,
    onAcpTurnBegin: (forTaskId, messageId, meta) => {
      if (forTaskId !== taskId) return;
      assistantTurnNotifiedRef.current = null;
      const id = messageId.trim();
      if (!id) return;
      liveTurnMessageIdRef.current = id;
      setLiveTurnMessageId(id);
      const turnId = meta?.turnId?.trim();
      if (turnId) activeTurnIdRef.current = turnId;
      // Projector startedAt is authoritative — especially on leave→return replay
      // when rehydrate may have restored a stale workedStartedAt.
      if (meta?.startedAt != null) {
        setTurnStartedAt(meta.startedAt);
      }
      turnActiveRef.current = true;
      setTurnPending(true);
      // Remount / reconnect: bind live chrome to the transcript row for this
      // message so tool progress is visible before the next session-update.
      if (turnUiRef.current.phase === "idle") {
        setMessages((prev) => {
          const open =
            prev.find((message) => message.id === id) ??
            findRehydratableLiveAssistant(prev);
          if (!open || open.role !== "assistant") return prev;
          const restored = rehydrateTurnUiFromMessage(open);
          turnUiRef.current = restored;
          setTurnUi(restored);
          if (meta?.startedAt == null) {
            setTurnStartedAt(
              resolveTurnWorkingStartedAt({
                workedStartedAt: open.workedStartedAt,
                userCreatedAt: findPairedUserCreatedAt(prev, open.id),
              }),
            );
          }
          return prev;
        });
      }
    },
    onAcpTurnState: (forTaskId, state) => {
      if (forTaskId !== taskId) return;
      pendingTurnOutcomeRef.current = state.status;
      if (state.status === "interrupted") {
        cancellingRef.current = true;
      }
      activeTurnIdRef.current = null;
    },
    onAcpUiRequest: handleAcpUiRequest,
    onAcpUiRequestCleared: handleAcpUiRequestCleared,
    onAgentHookTurnUpdate: handleAgentHookTurnUpdate,
    onAgentActivitySummaryChange,
    onWorkingTaskIdsChange,
    onAgentStatusItemsChange,
    onAgentOpenTaskIdsChange,
  });

  return { appendMessage, finalizeAssistantTurn };
}
