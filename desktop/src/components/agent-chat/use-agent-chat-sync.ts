import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

import {
  emptyAgentChatTurnUiState,
  type AgentChatTurnUiState,
} from "../../lib/agent/agent-acp-activity";
import { isTaskAgentWorkingForUi } from "../../lib/agent/agent-list-indicators";
import { writeAgentChatComposerDraft } from "../../lib/agent/agent-chat-composer-draft";
import {
  loadAgentChatTranscript,
  mergeAgentChatTranscripts,
  publishAgentChatTranscriptTimeline,
  saveAgentChatTranscript,
  syncAgentChatTranscript,
  type AgentChatImageAttachment,
  type AgentChatMessage,
} from "../../lib/agent/agent-chat-transcript";
import {
  applyLiveTurnTimelineToMessages,
  findRehydratableLiveAssistant,
  liveTurnToTimelinePatch,
  rehydrateTurnUiFromMessage,
} from "../../lib/agent/agent-chat-live-timeline";
import { resolveTurnWorkingStartedAt } from "../../lib/agent/agent-chat-work-ui";
import {
  mergeDisplayMessagesWithOptimisticUsers,
  pruneOptimisticUserMessages,
} from "../../lib/agent/agent-chat-optimistic-user";
import type { AskQuestionDraft } from "../../lib/agent/agent-chat-ask";
import type { AgentChatTurnDiffSelection } from "../../lib/agent/agent-chat-timeline";
import { markLiveAgentWorkingForTask } from "../../lib/agent/clear-live-agent-working";
import { useDesktopAgentStatus } from "../../lib/agent/agent-status-context";
import { ensurePtyAcpSession, setPtyAcpAccessMode } from "../../lib/pty";
import { readAgentChatModelId } from "../../lib/agent/agent-chat-model";
import {
  readAgentChatAccessMode,
  writeAgentChatAccessMode,
  type AgentChatAccessMode,
} from "../../lib/agent/agent-chat-runtime-mode";
import {
  ensureChatTab,
  writeAgentSurfaceTabs,
  type AgentSurfaceTabsState,
} from "../../lib/agent/agent-surface-tabs";
import {
  findPairedUserCreatedAt,
  type AgentChatUiRequest,
  type FailedSteerDraft,
} from "./agent-chat-panel-helpers";

/** Live turn timeline persistence (T3 durable timeline; local cache + seal publish). */
export function useLiveTurnPersistence({
  optimisticUserMessages,
  liveTurnMessageIdRef,
  turnStartedAtRef,
  turnUiRef,
  persistLiveTurnTimerRef,
  chatIdRef,
  setMessages,
  setLiveTurnMessageId,
  setTurnUi,
}: {
  optimisticUserMessages: AgentChatMessage[];
  liveTurnMessageIdRef: RefObject<string | null>;
  turnStartedAtRef: RefObject<number | null>;
  turnUiRef: RefObject<AgentChatTurnUiState>;
  persistLiveTurnTimerRef: RefObject<number | null>;
  chatIdRef: RefObject<string | null>;
  setMessages: Dispatch<SetStateAction<AgentChatMessage[]>>;
  setLiveTurnMessageId: Dispatch<SetStateAction<string | null>>;
  setTurnUi: Dispatch<SetStateAction<AgentChatTurnUiState>>;
}) {
  const optimisticUserMessagesRef = useRef(optimisticUserMessages);
  optimisticUserMessagesRef.current = optimisticUserMessages;

  const persistLiveTurnTimelineNow = useCallback(
    (turn: AgentChatTurnUiState, options?: { seal?: boolean; retry?: boolean }) => {
      const seal = options?.seal === true;
      const patch = liveTurnToTimelinePatch(turn, {
        messageId: liveTurnMessageIdRef.current,
        workedStartedAt: turnStartedAtRef.current,
        seal,
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
          if (!seal && options?.retry !== false) {
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
        // Local cache for remount within this window — durable mid-turn writes
        // belong to the sidecar projector (single writer). Publish on seal only.
        saveAgentChatTranscript(chatIdRef.current, applied.messages);
        if (seal) {
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
        }
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

  return { persistLiveTurnTimelineNow, schedulePersistLiveTurnTimeline, patchTurnUi };
}

/** Access mode / model pin / ensure-session effects for the live ACP session. */
export function useAgentSessionSettings({
  taskId,
  cwd,
  agentChatId,
  sessionReady,
  accessMode,
  setAccessMode,
  setGlobalModelId,
  setSessionModelId,
  setSurfaceTabState,
}: {
  taskId: string;
  cwd: string | null;
  agentChatId: string | null;
  sessionReady: boolean;
  accessMode: AgentChatAccessMode;
  setAccessMode: Dispatch<SetStateAction<AgentChatAccessMode>>;
  setGlobalModelId: Dispatch<SetStateAction<string>>;
  setSessionModelId: Dispatch<SetStateAction<string | null>>;
  setSurfaceTabState: Dispatch<SetStateAction<AgentSurfaceTabsState>>;
}) {
  const previousSessionReadyRef = useRef(false);

  useEffect(() => {
    setAccessMode(readAgentChatAccessMode(taskId));
    setGlobalModelId(readAgentChatModelId());
    setSessionModelId(null);
  }, [taskId]);

  useEffect(() => {
    if (!sessionReady) return;
    void setPtyAcpAccessMode({ taskId, mode: accessMode, cwd });
  }, [accessMode, cwd, sessionReady, taskId]);

  // Sync session model pin when Chat attaches / becomes ready.
  useEffect(() => {
    if (!sessionReady) {
      setSessionModelId(null);
      return;
    }
    const workingDirectory = cwd?.trim();
    if (!workingDirectory) return;
    let cancelled = false;
    void ensurePtyAcpSession({
      taskId,
      cwd: workingDirectory,
      chatId: agentChatId,
    }).then((result) => {
      if (cancelled || !result.ok) return;
      setSessionModelId(result.modelId);
    });
    return () => {
      cancelled = true;
    };
  }, [agentChatId, cwd, sessionReady, taskId]);

  const handleAccessModeChange = useCallback(
    (mode: AgentChatAccessMode) => {
      writeAgentChatAccessMode(taskId, mode);
      setAccessMode(mode);
    },
    [taskId],
  );

  // When an agent session becomes ready, open Chat if none exists yet.
  useEffect(() => {
    const wasReady = previousSessionReadyRef.current;
    previousSessionReadyRef.current = sessionReady;
    if (!sessionReady || wasReady) return;
    setSurfaceTabState((current) => {
      if (current.tabs.some((tab) => tab.kind === "chat")) return current;
      return ensureChatTab(current.tabs);
    });
  }, [sessionReady]);

  return { handleAccessModeChange };
}

/** Transcript load/merge/sync effects + local persistence of drafts and tabs. */
export function useAgentTranscriptSync({
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
}: {
  taskId: string;
  taskStatus: string | null;
  agentChatId: string | null;
  chatOnly: boolean;
  collapsed: boolean;
  layoutReady: boolean;
  draft: string;
  draftImages: AgentChatImageAttachment[];
  messages: AgentChatMessage[];
  optimisticUserMessages: AgentChatMessage[];
  surfaceTabState: AgentSurfaceTabsState;
  localTurnWorking: boolean;
  localTurnWorkingRef: RefObject<boolean>;
  turnActiveRef: RefObject<boolean>;
  cancellingRef: RefObject<boolean>;
  cancelSettleTimerRef: RefObject<number | null>;
  liveTurnMessageIdRef: RefObject<string | null>;
  turnUiRef: RefObject<AgentChatTurnUiState>;
  bootstrapPromptKeyRef: RefObject<string | null>;
  chatIdRef: RefObject<string | null>;
  setMessages: Dispatch<SetStateAction<AgentChatMessage[]>>;
  setOptimisticUserMessages: Dispatch<SetStateAction<AgentChatMessage[]>>;
  setLiveTurnMessageId: Dispatch<SetStateAction<string | null>>;
  setTurnUi: Dispatch<SetStateAction<AgentChatTurnUiState>>;
  setTurnPending: Dispatch<SetStateAction<boolean>>;
  setTurnStartedAt: Dispatch<SetStateAction<number | null>>;
  setUiRequestQueue: Dispatch<SetStateAction<AgentChatUiRequest[]>>;
  setUiRequestBusy: Dispatch<SetStateAction<boolean>>;
  setFailedSteer: Dispatch<SetStateAction<FailedSteerDraft | null>>;
  setAskDrafts: Dispatch<SetStateAction<Record<string, AskQuestionDraft>>>;
  setAskQuestionIndex: Dispatch<SetStateAction<number>>;
  setDiffSelection: Dispatch<SetStateAction<AgentChatTurnDiffSelection | null>>;
  setTranscriptLayoutKey: Dispatch<SetStateAction<number>>;
}) {
  const agentStatus = useDesktopAgentStatus();
  const { setTaskResearchWorking } = agentStatus;
  const wasCollapsedRef = useRef(collapsed);
  const layoutReadyRef = useRef(layoutReady);
  const previousTaskIdRef = useRef(taskId);

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
      cancellingRef.current = false;
      if (cancelSettleTimerRef.current != null) {
        window.clearTimeout(cancelSettleTimerRef.current);
        cancelSettleTimerRef.current = null;
      }
      liveTurnMessageIdRef.current = null;
      setLiveTurnMessageId(null);
      setTurnUi(emptyAgentChatTurnUiState());
      setTurnPending(false);
      setTurnStartedAt(null);
      setUiRequestQueue([]);
      setUiRequestBusy(false);
      setFailedSteer(null);
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
      setUiRequestQueue([]);
      setUiRequestBusy(false);
      setMessages([]);
      setOptimisticUserMessages([]);
      // Keep the unsent composer draft — navigating away / idle session must not
      // wipe what the user was typing (restored via agent-chat-composer-draft).
      setFailedSteer(null);
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
      setTurnStartedAt(
        resolveTurnWorkingStartedAt({
          workedStartedAt: open.workedStartedAt,
          userCreatedAt: findPairedUserCreatedAt(list, open.id),
        }),
      );
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

  useLayoutEffect(() => {
    if (chatOnly && !layoutReadyRef.current && layoutReady) {
      setTranscriptLayoutKey((key) => key + 1);
    }
    layoutReadyRef.current = layoutReady;
  }, [chatOnly, layoutReady]);

  return { displayMessages };
}
