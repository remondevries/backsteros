"use client";

import {
  isBlockingModalOpen,
  SidebarChevronIcon,
  TaskActivityPanel as SharedTaskActivityPanel,
  type TaskActivityPanelProps,
} from "@backsteros/ui";
import { useUser } from "@clerk/nextjs";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/** True when focus is in a real text field (not the xterm helper textarea). */
function isTypingInFormField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (
    target.closest(".xterm") ||
    target.classList.contains("xterm-helper-textarea")
  ) {
    // Task open auto-focuses the terminal — ⇧Enter must still hit the agent btn.
    return false;
  }
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  if (target.closest(".cm-editor") || target.closest("[role='textbox']")) {
    return true;
  }
  return false;
}

import { useConsoleApi } from "@/lib/api-context";
import { useAgentTestingMode } from "@/lib/agent-testing-mode-context";
import {
  buildReadyToStartAgentPrompt,
  missingProjectDirectoryError,
} from "@/lib/agent-launch";
import { formatAgentCommentReplyPrompt } from "@/lib/format-agent-comment-reply-prompt";
import { normalizeWorkingDirectory } from "@/lib/project-workspace";
import { resumeTaskFromHold } from "@/lib/resume-task-from-hold";
import { startTaskAgentSession } from "@/lib/start-task-agent-session";
import {
  TASK_AGENT_SESSIONS_CHANGED_EVENT,
  clearTaskAgentSessionsForTask,
  listTaskAgentSessions,
  markAgentChatDestroyed,
  readTaskAgentSessions,
  writeTaskAgentSessions,
  type TaskAgentSession,
  type TaskAgentSessionStore,
} from "@/lib/task-agent-sessions";

export type DevelopmentTaskActivityAttachOptions = {
  prompt?: string | null;
  focusUi?: boolean;
  /** True when the chat was just created — terminal must not reuse a leftover TUI. */
  sessionIsNew?: boolean;
  /** View agent — force terminal attach/resume even if sticky open detection is set. */
  forceReattach?: boolean;
  /**
   * Root hold-comment id when continuing from a hold reply — agent follow-up
   * comments should nest under this thread.
   */
  replyParentCommentId?: string | null;
};

export type DevelopmentTaskActivityPanelProps = {
  taskId: string;
  taskUpdatedAt?: string | number | null;
  feedRevision?: number;
  working?: boolean;
  /** True when this task's terminal is showing the Cursor Agent TUI (Stop agent). */
  agentOpenInTerminal?: boolean;
  assigneeAvatarById?: ReadonlyMap<string, string | null>;
  avatarByEmail?: ReadonlyMap<string, string | null>;
  /** Task fields used when Retry creates a fresh chat (ready-to-start prompt). */
  taskSummary: {
    number: number;
    title: string;
    description: string | null;
    projectKey?: string | null;
    projectId?: string | null;
    workingDirectory?: string | null;
  };
  onAttachSession: (
    session: TaskAgentSession,
    options?: DevelopmentTaskActivityAttachOptions,
  ) => void;
  /** Exit the agent in the terminal (when attached) and remove the UI binding. */
  onEndSession: (session: TaskAgentSession) => void;
  /** Move task to In Progress before attaching after hold resume. */
  onMarkInProgress: () => void | Promise<void>;
  /** Re-hold when create-chat fails during hold reply resume. */
  onLaunchFailed: (error: string) => void | Promise<void>;
  /** Agent testing mode: simulate a failed agent launch → On Hold + comment. */
  onSimulateLaunchFail?: () => void | Promise<void>;
  /** Agent testing mode: simulate needs-input hold without a real agent turn. */
  onSimulateNeedsInput?: () => void | Promise<void>;
  /** Agent testing mode: simulate successful finish → In Review + comment. */
  onSimulateReadyForReview?: () => void | Promise<void>;
};

/**
 * Development console wrapper: shared activity/comments panel plus agent
 * session header actions (Start working / View / End, testing holds, hold resume).
 */
export function TaskActivityPanel({
  taskId,
  taskUpdatedAt,
  feedRevision = 0,
  working = false,
  agentOpenInTerminal = false,
  assigneeAvatarById,
  avatarByEmail,
  taskSummary,
  onAttachSession,
  onEndSession,
  onMarkInProgress,
  onLaunchFailed,
  onSimulateLaunchFail,
  onSimulateNeedsInput,
  onSimulateReadyForReview,
}: DevelopmentTaskActivityPanelProps) {
  const { client } = useConsoleApi();
  const { enabled: agentTestingMode } = useAgentTestingMode();
  const { user } = useUser();
  const [simulatingLaunchFail, setSimulatingLaunchFail] = useState(false);
  const [simulatingNeedsInput, setSimulatingNeedsInput] = useState(false);
  const [simulatingReadyForReview, setSimulatingReadyForReview] =
    useState(false);
  const [testingMenuOpen, setTestingMenuOpen] = useState(false);
  const testingMenuRef = useRef<HTMLDivElement>(null);
  const [store, setStore] = useState<TaskAgentSessionStore>({});
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);

  const currentUser = useMemo(
    () => ({
      email: user?.primaryEmailAddress?.emailAddress?.trim().toLowerCase() || null,
      imageUrl: user?.imageUrl?.trim() || null,
    }),
    [user?.imageUrl, user?.primaryEmailAddress?.emailAddress],
  );

  const requestJson = useCallback(
    <T,>(path: string, init?: RequestInit) => client.requestJson<T>(path, init),
    [client],
  );

  useEffect(() => {
    const refresh = () => {
      setStore(readTaskAgentSessions());
    };
    refresh();
    window.addEventListener(TASK_AGENT_SESSIONS_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(TASK_AGENT_SESSIONS_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [taskId, taskUpdatedAt, feedRevision]);

  const persistSessions = useCallback((next: TaskAgentSessionStore) => {
    setStore(next);
    writeTaskAgentSessions(next);
  }, []);

  const sessions = listTaskAgentSessions(store, taskId);
  const hasSession = sessions.length > 0;
  const agentButtonMode: "create" | "view" | "end" = !hasSession
    ? "create"
    : agentOpenInTerminal
      ? "end"
      : "view";

  const startAgentSession = useCallback(async () => {
    setCreatingAgent(true);
    setAgentError(null);
    try {
      const directoryError = missingProjectDirectoryError(
        taskSummary.projectId,
        taskSummary.workingDirectory,
      );
      if (directoryError) {
        throw new Error(directoryError);
      }
      // Start Agent always creates a brand-new chat — never revive a
      // previously destroyed (or leftover) binding.
      const result = await startTaskAgentSession(taskId, { forceNew: true });
      if (!result.ok) {
        throw new Error(result.error);
      }
      const prompt = buildReadyToStartAgentPrompt({
        id: taskId,
        number: taskSummary.number,
        title: taskSummary.title,
        description: taskSummary.description,
        projectKey: taskSummary.projectKey,
        workingDirectory: normalizeWorkingDirectory(
          taskSummary.workingDirectory,
        ),
      });
      persistSessions(readTaskAgentSessions());
      // Move to In Progress as soon as we hand the agent the task — don't wait
      // for OSC "working" (that can lag or miss on a fresh session).
      await onMarkInProgress();
      onAttachSession(result.session, {
        prompt,
        sessionIsNew: true,
        focusUi: true,
      });
    } catch (err) {
      setAgentError(
        err instanceof Error ? err.message : "Could not create agent session.",
      );
    } finally {
      setCreatingAgent(false);
    }
  }, [
    onAttachSession,
    onMarkInProgress,
    persistSessions,
    taskId,
    taskSummary.description,
    taskSummary.number,
    taskSummary.projectId,
    taskSummary.projectKey,
    taskSummary.title,
    taskSummary.workingDirectory,
  ]);

  const viewAgentSession = useCallback(() => {
    const session = sessions[0];
    if (!session) return;
    onAttachSession(session, {
      sessionIsNew: false,
      focusUi: true,
      forceReattach: true,
    });
  }, [onAttachSession, sessions]);

  const endSession = useCallback(
    (session: TaskAgentSession) => {
      // Destroy permanently: blacklist every chat bound to this task, wipe
      // bindings, then quit/clear the terminal attach.
      const current = listTaskAgentSessions(readTaskAgentSessions(), taskId);
      for (const entry of current) {
        markAgentChatDestroyed(entry.chatId);
      }
      markAgentChatDestroyed(session.chatId);
      onEndSession(session);
      persistSessions(
        clearTaskAgentSessionsForTask(readTaskAgentSessions(), taskId),
      );
    },
    [onEndSession, persistSessions, taskId],
  );

  const onAgentButtonClick = useCallback(() => {
    if (creatingAgent) return;
    if (agentButtonMode === "create") {
      void startAgentSession();
      return;
    }
    const session = sessions[0];
    if (!session) return;
    if (agentButtonMode === "end") {
      endSession(session);
      return;
    }
    viewAgentSession();
  }, [
    agentButtonMode,
    creatingAgent,
    endSession,
    sessions,
    startAgentSession,
    viewAgentSession,
  ]);

  // ⇧Enter activates the agent header button in whatever mode it is in
  // (Start / View / Stop) — same path as a click. Only registered while this
  // task detail panel is mounted (single-task view).
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!event.shiftKey) return;
      if (event.key !== "Enter" && event.code !== "Enter") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.repeat || creatingAgent) return;
      if (isBlockingModalOpen()) return;
      if (isTypingInFormField(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onAgentButtonClick();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [creatingAgent, onAgentButtonClick]);

  const resumeFromHold = useCallback(
    async (
      prompt: string,
      replyParentCommentId?: string | null,
      parentBody?: string | null,
    ) => {
      setAgentError(null);
      const contextualPrompt = formatAgentCommentReplyPrompt({
        parentBody: parentBody ?? "",
        replyBody: prompt,
      });
      const result = await resumeTaskFromHold({
        task: {
          id: taskId,
          number: taskSummary.number,
          title: taskSummary.title,
          description: taskSummary.description,
          projectKey: taskSummary.projectKey,
        },
        prompt: contextualPrompt,
      });
      if (!result.ok) {
        await onLaunchFailed(result.error);
        throw new Error(result.error);
      }
      persistSessions(readTaskAgentSessions());
      await onMarkInProgress();
      onAttachSession(result.session, {
        prompt: result.prompt,
        focusUi: true,
        sessionIsNew: result.created,
        replyParentCommentId: replyParentCommentId ?? null,
      });
    },
    [
      onAttachSession,
      onLaunchFailed,
      onMarkInProgress,
      persistSessions,
      taskId,
      taskSummary.description,
      taskSummary.number,
      taskSummary.projectKey,
      taskSummary.title,
    ],
  );

  const onContinueHoldComment = useCallback(
    async (commentId: string, replyBody: string, parentBody: string) => {
      await resumeFromHold(replyBody, commentId, parentBody);
    },
    [resumeFromHold],
  );

  const runSimulateNeedsInput = useCallback(() => {
    if (!onSimulateNeedsInput || simulatingNeedsInput) return;
    setSimulatingNeedsInput(true);
    setTestingMenuOpen(false);
    void (async () => {
      try {
        await onSimulateNeedsInput();
      } finally {
        setSimulatingNeedsInput(false);
      }
    })();
  }, [onSimulateNeedsInput, simulatingNeedsInput]);

  const runSimulateLaunchFail = useCallback(() => {
    if (!onSimulateLaunchFail || simulatingLaunchFail) return;
    setSimulatingLaunchFail(true);
    setTestingMenuOpen(false);
    void (async () => {
      try {
        await onSimulateLaunchFail();
      } finally {
        setSimulatingLaunchFail(false);
      }
    })();
  }, [onSimulateLaunchFail, simulatingLaunchFail]);

  const runSimulateReadyForReview = useCallback(() => {
    if (!onSimulateReadyForReview || simulatingReadyForReview) return;
    setSimulatingReadyForReview(true);
    setTestingMenuOpen(false);
    void (async () => {
      try {
        await onSimulateReadyForReview();
      } finally {
        setSimulatingReadyForReview(false);
      }
    })();
  }, [onSimulateReadyForReview, simulatingReadyForReview]);

  const showTestingSplit =
    agentTestingMode &&
    Boolean(
      onSimulateLaunchFail ||
        onSimulateNeedsInput ||
        onSimulateReadyForReview,
    );
  const testingBusy =
    simulatingLaunchFail || simulatingNeedsInput || simulatingReadyForReview;

  useEffect(() => {
    if (!testingMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const root = testingMenuRef.current;
      if (!root || !(event.target instanceof Node)) return;
      if (!root.contains(event.target)) setTestingMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTestingMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [testingMenuOpen]);

  useEffect(() => {
    if (!showTestingSplit) setTestingMenuOpen(false);
  }, [showTestingSplit]);

  const agentButtonClassName = [
    "task-activity__agent-btn",
    showTestingSplit ? "task-activity__agent-btn--split-main" : "",
    creatingAgent ? "is-creating" : "",
    agentButtonMode === "view" ? "is-bound" : "",
    agentButtonMode === "end" ? "is-active" : "",
    hasSession && working ? "is-working" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const agentButtonAriaLabel = creatingAgent
    ? "Creating agent"
    : agentButtonMode === "end"
      ? "Stop agent"
      : agentButtonMode === "view"
        ? "View agent"
        : "Start Agent";

  const agentButtonInner = (
    <>
      {hasSession ? (
        <span
          className={`task-activity__agent-btn-dot${
            working ? " is-working" : ""
          }`}
          aria-hidden="true"
        />
      ) : null}
      {creatingAgent ? (
        <span className="task-activity__agent-btn-label">Creating…</span>
      ) : agentButtonMode === "end" ? (
        <span className="task-activity__agent-btn-label">Stop agent</span>
      ) : agentButtonMode === "view" ? (
        <span className="task-activity__agent-btn-label">View agent</span>
      ) : (
        <span className="task-activity__agent-btn-label">Start Agent</span>
      )}
    </>
  );

  const headerActions = showTestingSplit ? (
    <div
      ref={testingMenuRef}
      className={`task-activity__agent-split${
        testingMenuOpen ? " is-open" : ""
      }`}
    >
      <button
        type="button"
        className={agentButtonClassName}
        disabled={creatingAgent}
        aria-busy={creatingAgent || undefined}
        aria-label={agentButtonAriaLabel}
        title={
          agentButtonMode === "end"
            ? "Stop agent — quit CLI and clear terminal"
            : agentButtonMode === "view"
              ? "Open the agent session in the terminal"
              : undefined
        }
        onClick={onAgentButtonClick}
      >
        {agentButtonInner}
      </button>
      <button
        type="button"
        className="task-activity__agent-split-chevron"
        disabled={creatingAgent || testingBusy}
        aria-label="Agent testing actions"
        aria-haspopup="menu"
        aria-expanded={testingMenuOpen}
        title="Agent testing actions"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setTestingMenuOpen((open) => !open);
        }}
      >
        <SidebarChevronIcon pointing="down" expanded={testingMenuOpen} />
      </button>
      {testingMenuOpen ? (
        <div className="task-activity__agent-testing-menu" role="menu">
          {onSimulateLaunchFail ? (
            <button
              type="button"
              role="menuitem"
              className="task-activity__agent-testing-menu-item"
              disabled={testingBusy || creatingAgent}
              onClick={runSimulateLaunchFail}
            >
              {simulatingLaunchFail ? "Simulating…" : "Test: launch fail"}
            </button>
          ) : null}
          {onSimulateNeedsInput ? (
            <button
              type="button"
              role="menuitem"
              className="task-activity__agent-testing-menu-item"
              disabled={testingBusy || creatingAgent}
              onClick={runSimulateNeedsInput}
            >
              {simulatingNeedsInput ? "Simulating…" : "Test: needs input"}
            </button>
          ) : null}
          {onSimulateReadyForReview ? (
            <button
              type="button"
              role="menuitem"
              className="task-activity__agent-testing-menu-item"
              disabled={testingBusy || creatingAgent}
              onClick={runSimulateReadyForReview}
            >
              {simulatingReadyForReview
                ? "Simulating…"
                : "Test: ready for review"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  ) : (
    <button
      type="button"
      className={agentButtonClassName}
      disabled={creatingAgent}
      aria-busy={creatingAgent || undefined}
      aria-label={agentButtonAriaLabel}
      title={
        agentButtonMode === "end"
          ? "Stop agent — quit CLI and clear terminal"
          : agentButtonMode === "view"
            ? "Open the agent session in the terminal"
            : undefined
      }
      onClick={onAgentButtonClick}
    >
      {agentButtonInner}
    </button>
  );

  const sharedProps: TaskActivityPanelProps = {
    taskId,
    taskUpdatedAt,
    feedRevision,
    working,
    assigneeAvatarById,
    avatarByEmail,
    requestJson,
    currentUser,
    headerActions,
    onContinueHoldComment,
  };

  return (
    <>
      <SharedTaskActivityPanel {...sharedProps} />
      {agentError ? (
        <p className="task-activity__error" role="alert">
          {agentError}
        </p>
      ) : null}
    </>
  );
}
