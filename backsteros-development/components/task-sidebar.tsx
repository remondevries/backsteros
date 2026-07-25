"use client";

import type {
  Contact as ApiContact,
  Project as ApiProject,
  Task as ApiTask,
} from "@backsteros/contracts";
import {
  DotScrollLoader,
  ProjectTasksWorkbenchView,
  TASKS_LIST_BOARD_STORAGE_KEY,
  TaskStackedDetailView,
  TasksListSkeleton,
  applyOptimisticTaskReorder,
  buildAssigneeDropdownOptions,
  buildProjectDropdownOptions,
  formatTaskDisplayId,
  getListBoardViewForShortcutKey,
  hasListBoardViewShortcutModifiers,
  isBlockingModalOpen,
  isListBoardViewShortcutKey,
  migrateLegacyTaskStatus,
  parseListBoardView,
  persistListBoardView,
  taskReorderPatches,
  useCommandPalette,
  useEscapeBackNavigation,
  useListKeyboardNavigationZone,
  type ListBoardViewMode,
  type TaskReorderRequest,
  type TaskStatus,
} from "@backsteros/ui";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { createPortal } from "react-dom";

import {
  AgentActivityIcon,
  ChevronLeftIcon,
  ProjectsSidePanelIcon,
} from "@/components/panel-icons";
import { TaskActivityPanel } from "@/components/task-activity-panel";
import {
  apiErrorMessage,
  useApiResource,
  useConsoleApi,
} from "@/lib/api-context";
import {
  buildLaunchFailedHold,
  formatAgentHoldComment,
  type AgentHoldDecision,
} from "@/lib/agent-hold";
import {
  holdTaskForAgent as holdTaskForAgentRequest,
  reviewTaskForAgent,
} from "@/lib/agent-task-mutations";
import {
  TASK_AGENT_SESSIONS_CHANGED_EVENT,
  listTaskAgentSessions,
  readTaskAgentSessions,
  type TaskAgentSession,
} from "@/lib/task-agent-sessions";
import {
  buildReadyToStartAgentPrompt,
  missingProjectDirectoryError,
} from "@/lib/agent-launch";
import type {
  AgentAttachRequest,
  AgentEndRequest,
} from "@/lib/cursor-agent-cli";
import { useConsoleAvatarSrcMap, withAvatarSrc } from "@/lib/avatar-src";
import { mapApiTask, mapApiTaskDetail } from "@/lib/map-task";
import { normalizeWorkingDirectory } from "@/lib/project-workspace";
import { startTaskAgentSession } from "@/lib/start-task-agent-session";

function shouldHandleConsoleTasksViewShortcut(event: KeyboardEvent): boolean {
  if (!isListBoardViewShortcutKey(event)) return false;
  if (!hasListBoardViewShortcutModifiers(event)) return false;
  if (isBlockingModalOpen()) return false;

  const target = event.target;
  if (!(target instanceof HTMLElement)) return true;

  // Allow while the embedded terminal is focused.
  if (target.closest(".xterm")) return true;

  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false;
  if (target.isContentEditable) return false;
  if (target.closest(".cm-editor")) return false;
  if (target.closest("[data-searchable-dropdown-panel]")) return false;

  return true;
}

export function TaskSidebar({
  project,
  projectsById,
  selectedTaskId,
  onSelectedTaskIdChange,
  workspaceStage = "project",
  sideTarget = null,
  mainTarget = null,
  terminalCollapsed = false,
  onToggleTerminal,
  onSelectedTaskChange,
  workingTaskIds = [],
  agentOpenTaskIds = [],
  activityFeedRevision = 0,
  onActivityFeedInvalidate,
  agentStatusHandlersRef,
  onAttachAgentSession,
  onEndAgentSession,
  onFocusTerminal,
  showChromeHeader = true,
  showListHeader = true,
}: {
  project: ApiProject | null;
  projectsById: Map<string, ApiProject>;
  selectedTaskId: string | null;
  onSelectedTaskIdChange: (taskId: string | null) => void;
  /** project = overview+list layout; task = detail+terminal layout. */
  workspaceStage?: "project" | "task";
  /** Left narrow panel mount point (task detail). */
  sideTarget?: HTMLElement | null;
  /** Right main panel mount point (task list / board). */
  mainTarget?: HTMLElement | null;
  terminalCollapsed?: boolean;
  onToggleTerminal?: () => void;
  onSelectedTaskChange?: (
    task: {
      id: string;
      title: string;
      projectId?: string | null;
      displayId?: string | null;
    } | null,
  ) => void;
  /** When false, host chrome owns the side pane header (stable breadcrumb). */
  showChromeHeader?: boolean;
  /** When false, omit the tasks list pane header. */
  showListHeader?: boolean;
  /** Task ids whose agent session is currently working. */
  workingTaskIds?: readonly string[];
  /** Task ids whose terminal currently has the Cursor Agent TUI open. */
  agentOpenTaskIds?: readonly string[];
  /** Bump to reload the task activity feed (e.g. after an agent turn). */
  activityFeedRevision?: number;
  /** Notify parent that comments/activities changed (reload feed). */
  onActivityFeedInvalidate?: () => void;
  /**
   * Ref filled with handlers so the terminal workspace can auto-advance
   * status when an agent becomes working in the task terminal.
   */
  agentStatusHandlersRef?: MutableRefObject<{
    onBecameWorking: (taskId: string) => void;
    onBecameIdle: (taskId: string) => void;
    onBecameAttention: (taskId: string) => void;
    onNeedsHold: (
      taskId: string,
      decision: AgentHoldDecision,
      options?: { parentCommentId?: string | null },
    ) => void;
    /** Local board refresh after console-shell marks In Review. */
    onNeedsReview?: (taskId: string) => void;
  } | null>;
  /** Open / resume a Cursor Agent chat in the task terminal. */
  onAttachAgentSession?: (request: AgentAttachRequest) => void;
  /** End a Cursor Agent chat: `/quit` in the terminal when attached, drop UI binding. */
  onEndAgentSession?: (request: AgentEndRequest) => void;
  /** Refocus the task terminal (Tab after Escape-blur). */
  onFocusTerminal?: () => void;
}) {
  const { client } = useConsoleApi();
  const { open: commandPaletteOpen } = useCommandPalette();
  const { setActiveZone, clearHighlights } = useListKeyboardNavigationZone();
  const projectId = project?.id ?? null;
  const [tasksView, setTasksView] = useState<ListBoardViewMode>(() =>
    parseListBoardView(null, TASKS_LIST_BOARD_STORAGE_KEY),
  );

  const setTasksViewPersist = useCallback((next: ListBoardViewMode) => {
    setTasksView(next);
    persistListBoardView(next, TASKS_LIST_BOARD_STORAGE_KEY);
  }, []);
  const loadTasks = useCallback(
    async (api: typeof client, signal: AbortSignal) => {
      if (!projectId) return [] as ApiTask[];
      const query = new URLSearchParams({ projectId });
      const result = await api.requestJson<{ tasks: ApiTask[] }>(
        `/api/v1/tasks?${query.toString()}`,
        { signal },
      );
      return result.tasks;
    },
    [projectId],
  );

  const {
    data: rawTasks,
    error,
    loading,
    setData,
  } = useApiResource(loadTasks, [projectId]);

  const loadContacts = useCallback(
    async (api: typeof client, signal: AbortSignal) => {
      const result = await api.requestJson<{ contacts: ApiContact[] }>(
        "/api/v1/contacts",
        { signal },
      );
      return result.contacts ?? [];
    },
    [],
  );

  const { data: contacts } = useApiResource(loadContacts, []);

  const tasks = useMemo(
    () => (rawTasks ?? []).map((task) => mapApiTask(task, projectsById)),
    [projectsById, rawTasks],
  );

  const selectedRawTask = useMemo(
    () =>
      selectedTaskId
        ? ((rawTasks ?? []).find((task) => task.id === selectedTaskId) ?? null)
        : null,
    [rawTasks, selectedTaskId],
  );

  const selectedDetailTask = useMemo(() => {
    if (!selectedRawTask) return null;
    const detail = mapApiTaskDetail(selectedRawTask, projectsById);
    if (!detail.assigneeId || detail.assigneeName) return detail;
    const assignee = (contacts ?? []).find(
      (contact) => contact.id === detail.assigneeId,
    );
    return {
      ...detail,
      assigneeName: assignee?.name?.trim() || null,
    };
  }, [contacts, projectsById, selectedRawTask]);

  useEffect(() => {
    if (!onSelectedTaskChange) return;
    if (!selectedTaskId) {
      onSelectedTaskChange(null);
      return;
    }
    if (!selectedRawTask) return;
    const taskProject = selectedRawTask.projectId
      ? (projectsById.get(selectedRawTask.projectId) ?? null)
      : project;
    onSelectedTaskChange({
      id: selectedRawTask.id,
      title: selectedRawTask.title,
      projectId: selectedRawTask.projectId,
      displayId:
        taskProject?.key && selectedRawTask.number
          ? formatTaskDisplayId(taskProject.key, selectedRawTask.number)
          : null,
    });
  }, [onSelectedTaskChange, project, projectsById, selectedRawTask, selectedTaskId]);

  const detailOpen = Boolean(selectedDetailTask);
  const showingTasksList =
    Boolean(project) && workspaceStage === "project";

  // Hold the last detail task through the exit fade so back can crossfade.
  const [heldDetailTask, setHeldDetailTask] = useState(selectedDetailTask);
  const [detailShown, setDetailShown] = useState(false);
  useEffect(() => {
    if (selectedDetailTask) {
      setHeldDetailTask(selectedDetailTask);
      setDetailShown(false);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setDetailShown(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setDetailShown(false);
    const timer = window.setTimeout(() => {
      setHeldDetailTask(null);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [selectedDetailTask]);

  const renderedDetailTask = selectedDetailTask ?? heldDetailTask;
  const showDetailLayer =
    Boolean(project) &&
    workspaceStage === "task" &&
    Boolean(selectedDetailTask) &&
    detailShown;

  useEffect(() => {
    if (!showingTasksList) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (!shouldHandleConsoleTasksViewShortcut(event)) return;

      const nextView = getListBoardViewForShortcutKey(event.key, event.code);
      if (!nextView || nextView === tasksView) return;

      event.preventDefault();
      event.stopPropagation();
      setTasksViewPersist(nextView);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [setTasksViewPersist, showingTasksList, tasksView]);

  const projectOptions = useMemo(
    () =>
      buildProjectDropdownOptions(
        [...projectsById.values()].map((entry) => ({
          key: entry.key,
          name: entry.name,
          icon: entry.icon,
        })),
        { includeNone: false },
      ),
    [projectsById],
  );

  const contactAvatarSrc = useConsoleAvatarSrcMap("contact", contacts ?? []);

  const assigneeAvatarById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const contact of contacts ?? []) {
      map.set(contact.id, contactAvatarSrc[contact.id] ?? null);
    }
    return map;
  }, [contactAvatarSrc, contacts]);

  const avatarByEmail = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const contact of contacts ?? []) {
      const email = contact.email?.trim().toLowerCase();
      if (!email) continue;
      const src = contactAvatarSrc[contact.id] ?? null;
      if (src) map.set(email, src);
    }
    return map;
  }, [contactAvatarSrc, contacts]);

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(
        withAvatarSrc(
          (contacts ?? []).map((contact) => ({
            id: contact.id,
            name: contact.name?.trim() || "Untitled",
            email: contact.email,
            avatarStorageKey: contact.avatarStorageKey,
            updatedAt: contact.updatedAt,
          })),
          contactAvatarSrc,
        ),
      ),
    [contactAvatarSrc, contacts],
  );

  const patchTask = useCallback(
    async (taskId: string, patch: Record<string, unknown>) => {
      const updated = await client.requestJson<ApiTask>(
        `/api/v1/tasks/${encodeURIComponent(taskId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      setData((current) =>
        (current ?? []).map((task) => (task.id === taskId ? updated : task)),
      );
      return updated;
    },
    [client, setData],
  );

  const createTask = useCallback(
    async (input: { status: TaskStatus; title: string }) => {
      if (!projectId) {
        throw new Error("Select a project first.");
      }
      const created = await client.requestJson<ApiTask>("/api/v1/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: input.title,
          status: input.status,
        }),
      });
      setData((current) => [...(current ?? []), created]);
      return { id: created.id };
    },
    [client, projectId, setData],
  );

  const reorderTask = useCallback(
    async (request: TaskReorderRequest): Promise<boolean> => {
      if (!projectId) return false;

      const snapshot = rawTasks ?? [];
      const patches = taskReorderPatches(snapshot, request);
      if (patches.length === 0) return false;

      setData((current) =>
        current ? applyOptimisticTaskReorder(current, request) : current,
      );

      try {
        // Persist status + sortOrder per affected task (desktop parity).
        const updated = await Promise.all(
          patches.map((patch) =>
            client.requestJson<ApiTask>(
              `/api/v1/tasks/${encodeURIComponent(patch.id)}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  status: patch.status,
                  sortOrder: patch.sortOrder,
                }),
              },
            ),
          ),
        );
        const byId = new Map(updated.map((task) => [task.id, task]));
        setData((current) =>
          (current ?? []).map((task) => byId.get(task.id) ?? task),
        );
        return true;
      } catch {
        setData(snapshot);
        return false;
      }
    },
    [client, projectId, rawTasks, setData],
  );

  const workingTaskIdSet = useMemo(
    () => new Set(workingTaskIds),
    [workingTaskIds],
  );

  const [agentSessionTaskIds, setAgentSessionTaskIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    const refresh = () => {
      setAgentSessionTaskIds(new Set(Object.keys(readTaskAgentSessions())));
    };
    refresh();
    window.addEventListener(TASK_AGENT_SESSIONS_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(TASK_AGENT_SESSIONS_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  /** Robot badge = task↔agent binding only (cleared on Stop agent). */
  const agentActiveTaskIdSet = agentSessionTaskIds;

  /** When an agent starts working in a task terminal, move that task to In Progress. */
  const rawTasksRef = useRef(rawTasks);
  rawTasksRef.current = rawTasks;
  const projectsByIdRef = useRef(projectsById);
  projectsByIdRef.current = projectsById;
  const launchingReadyToStartRef = useRef(new Set<string>());
  const holdingTaskIdsRef = useRef(new Set<string>());

  const holdTaskForAgent = useCallback(
    async (
      taskId: string,
      decision: AgentHoldDecision,
      options?: { force?: boolean; parentCommentId?: string | null },
    ) => {
      if (holdingTaskIdsRef.current.has(taskId)) return;
      holdingTaskIdsRef.current.add(taskId);
      try {
        const ok = await holdTaskForAgentRequest(
          client,
          taskId,
          decision,
          options,
        );
        if (!ok) return;
        setData((current) =>
          (current ?? []).map((task) =>
            task.id === taskId ? { ...task, status: "on_hold" } : task,
          ),
        );
        onActivityFeedInvalidate?.();
      } finally {
        holdingTaskIdsRef.current.delete(taskId);
      }
    },
    [client, onActivityFeedInvalidate, setData],
  );

  const handleAgentBecameWorking = useCallback(
    (taskId: string) => {
      // API write happens in console-shell; only refresh the project board.
      setData((current) =>
        (current ?? []).map((task) =>
          task.id === taskId ? { ...task, status: "in_progress" } : task,
        ),
      );
    },
    [setData],
  );

  const handleAgentBecameIdle = useCallback((_taskId: string) => {
    /* Status stays as-is when the agent finishes a turn (unless hold fires). */
  }, []);

  const handleAgentBecameAttention = useCallback((_taskId: string) => {
    /* Permission prompts stay In Progress — only unresolved needs-input holds. */
  }, []);

  const handleAgentNeedsHold = useCallback(
    (
      taskId: string,
      decision: AgentHoldDecision,
      options?: { parentCommentId?: string | null },
    ) => {
      void holdTaskForAgent(taskId, decision, options);
    },
    [holdTaskForAgent],
  );

  const handleAgentNeedsReview = useCallback(
    (taskId: string) => {
      setData((current) =>
        (current ?? []).map((task) =>
          task.id === taskId ? { ...task, status: "in_review" } : task,
        ),
      );
      onActivityFeedInvalidate?.();
    },
    [onActivityFeedInvalidate, setData],
  );

  useEffect(() => {
    if (!agentStatusHandlersRef) return;
    agentStatusHandlersRef.current = {
      onBecameWorking: handleAgentBecameWorking,
      onBecameIdle: handleAgentBecameIdle,
      onBecameAttention: handleAgentBecameAttention,
      onNeedsHold: handleAgentNeedsHold,
      onNeedsReview: handleAgentNeedsReview,
    };
    return () => {
      agentStatusHandlersRef.current = null;
    };
  }, [
    agentStatusHandlersRef,
    handleAgentBecameAttention,
    handleAgentBecameIdle,
    handleAgentBecameWorking,
    handleAgentNeedsHold,
    handleAgentNeedsReview,
  ]);

  const openTask = useCallback(
    (taskId: string) => {
      onSelectedTaskIdChange(taskId);
    },
    [onSelectedTaskIdChange],
  );

  const maybeLaunchReadyToStartAgent = useCallback(
    (
      taskId: string,
      fromStatus: string | null | undefined,
      toStatus: TaskStatus,
    ) => {
      const existingSessions = listTaskAgentSessions(
        readTaskAgentSessions(),
        taskId,
      );
      const launching = launchingReadyToStartRef.current.has(taskId);
      let skipReason: string | null = null;
      if (toStatus !== "ready_to_start") skipReason = "not_ready_to_start";
      else if (fromStatus === "ready_to_start") skipReason = "already_ready";
      else if (!onAttachAgentSession) skipReason = "no_attach_handler";
      else if (launching) skipReason = "already_launching";
      // Existing bindings are OK — reuse the chat and push the task prompt
      // again so Ready→agent is a continuous loop (not a one-shot).

      if (skipReason) return;

      const task = (rawTasksRef.current ?? []).find(
        (entry) => entry.id === taskId,
      );
      if (!task) {
        return;
      }
      const project = task.projectId
        ? (projectsByIdRef.current.get(task.projectId) ?? null)
        : null;
      const directoryError = missingProjectDirectoryError(
        task.projectId,
        project?.localWorkingDirectory,
      );
      if (directoryError) {
        void holdTaskForAgent(taskId, buildLaunchFailedHold(directoryError));
        return;
      }
      const workingDirectory = normalizeWorkingDirectory(
        project?.localWorkingDirectory,
      );
      const prompt = buildReadyToStartAgentPrompt({
        id: task.id,
        number: task.number,
        title: task.title,
        description: task.description,
        projectKey: project?.key ?? null,
        workingDirectory,
      });

      launchingReadyToStartRef.current.add(taskId);
      void (async () => {
        try {
          // Reuse binding when present; create only if this task has none.
          const result = await startTaskAgentSession(taskId);
          if (!result.ok) {
            await holdTaskForAgent(taskId, buildLaunchFailedHold(result.error));
            return;
          }
          // Push the ready-to-start prompt into the (possibly already open) TUI
          // or shell-resume it — same cycle as the first launch.
          onAttachAgentSession?.({
            taskId: result.session.taskId,
            chatId: result.session.chatId,
            prompt,
            focusUi: false,
            sessionIsNew: result.created,
          });
        } finally {
          launchingReadyToStartRef.current.delete(taskId);
        }
      })();
    },
    [holdTaskForAgent, onAttachAgentSession],
  );

  const blurTaskTerminal = useCallback(() => {
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      (active.closest(".xterm") ||
        active.classList.contains("xterm-helper-textarea"))
    ) {
      active.blur();
    }
  }, []);

  const closeOverlay = useCallback(() => {
    // Leave the PTY so list j/k can take the highlight on the task row.
    blurTaskTerminal();
    onSelectedTaskIdChange(null);
    // Escape from task detail returns to the task list (main), not projects.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setActiveZone("main", { activate: true });
      });
    });
  }, [blurTaskTerminal, onSelectedTaskIdChange, setActiveZone]);

  // After switching projects (no task open), claim j/k for the task list once
  // it has rows. Do not re-run on later load ticks — that would steal focus
  // back from Files/commits/PRs after the user presses 1 / 2 / 3.
  const focusedTasksForProjectRef = useRef<string | null>(null);
  useEffect(() => {
    if (!projectId || selectedTaskId || loading || tasks.length === 0) return;
    if (focusedTasksForProjectRef.current === projectId) return;
    focusedTasksForProjectRef.current = projectId;
    const frame = requestAnimationFrame(() => {
      setActiveZone("main", { activate: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [loading, projectId, selectedTaskId, setActiveZone, tasks.length]);

  const headerTitle = detailOpen
    ? (selectedDetailTask?.displayId?.trim() || "Task")
    : "Tasks";
  const showBack = workspaceStage === "task";

  // Escape (not from terminal) → leave task detail back to the task list.
  // Escape from terminal is handled below (blur only; second Escape leaves).
  useEscapeBackNavigation({
    enabled: showBack,
    pathname: "/console/detail",
    commandPaletteOpen,
    canGoBack: true,
    allowFromTerminal: false,
    onGoBack: closeOverlay,
  });

  // Task page: Escape in terminal blurs; Tab (outside terminal/inputs) refocuses.
  // Stable layout listener stays ahead of list-keyboard Tab (useEffect).
  const showBackRef = useRef(showBack);
  showBackRef.current = showBack;
  const commandPaletteOpenForKeysRef = useRef(commandPaletteOpen);
  commandPaletteOpenForKeysRef.current = commandPaletteOpen;
  const clearHighlightsRef = useRef(clearHighlights);
  clearHighlightsRef.current = clearHighlights;
  const blurTaskTerminalRef = useRef(blurTaskTerminal);
  blurTaskTerminalRef.current = blurTaskTerminal;
  const onFocusTerminalRef = useRef(onFocusTerminal);
  onFocusTerminalRef.current = onFocusTerminal;

  useLayoutEffect(() => {
    function isInTerminal(target: EventTarget | null): boolean {
      return (
        target instanceof HTMLElement &&
        Boolean(
          target.closest(".xterm") ||
            target.classList.contains("xterm-helper-textarea"),
        )
      );
    }

    function isEditableField(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        // xterm's helper textarea is handled as terminal, not a form field.
        if (isInTerminal(target)) return false;
        return true;
      }
      if (target.isContentEditable) return true;
      if (target.closest(".cm-editor") || target.closest("[role='textbox']")) {
        return true;
      }
      if (target.closest("[data-searchable-dropdown-panel]")) return true;
      return false;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!showBackRef.current) return;
      if (commandPaletteOpenForKeysRef.current) return;
      if (isBlockingModalOpen()) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (
        event.key === "Escape" &&
        !event.shiftKey &&
        isInTerminal(event.target)
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        clearHighlightsRef.current();
        blurTaskTerminalRef.current();
        return;
      }

      const focusTerminal = onFocusTerminalRef.current;
      if (
        event.key === "Tab" &&
        !event.shiftKey &&
        focusTerminal &&
        !isInTerminal(event.target) &&
        !isEditableField(event.target)
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        clearHighlightsRef.current();
        focusTerminal();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  const listPane = (
    <aside className="console-pane console-pane--tasks-main">
      {showListHeader ? (
        <div className="console-pane-header">
          <div className="console-pane-header-title">
            <span>Tasks</span>
          </div>
        </div>
      ) : null}
      <div className="console-pane-body">
        {!project ? (
          <div className="console-empty">Select a project to load tasks.</div>
        ) : null}
        {error ? (
          <div className="console-error">{apiErrorMessage(error)}</div>
        ) : null}
        {project && !error && loading && rawTasks === null ? (
          <div className="task-panel-island console-content-swap">
            <TasksListSkeleton />
          </div>
        ) : null}
        {project && rawTasks !== null ? (
          <div
            key={project.id}
            className="task-panel-island console-content-swap"
          >
            <ProjectTasksWorkbenchView
              tasks={tasks}
              selectedTaskId={selectedTaskId}
              view={tasksView}
              onViewChange={setTasksViewPersist}
              onSelectTask={openTask}
              onCreateTask={createTask}
              onCreatedTask={openTask}
              assigneeOptions={assigneeOptions}
              showDueMeta
              titleTrailingAlign="inline"
              renderTaskTitleTrailing={(task) =>
                workingTaskIdSet.has(task.id) ? (
                  <DotScrollLoader
                    className="task-sync-loader"
                    aria-label="Agent working"
                  />
                ) : null
              }
              renderAssigneeAccessory={(task) =>
                agentActiveTaskIdSet.has(task.id) ? (
                  <AgentActivityIcon
                    size={9}
                    className="task-overview-row__agent-badge-icon"
                  />
                ) : null
              }
              onStatusChange={(taskId, status: TaskStatus) => {
                const current = (rawTasks ?? []).find(
                  (task) => task.id === taskId,
                );
                void (async () => {
                  try {
                    await patchTask(taskId, { status });
                    maybeLaunchReadyToStartAgent(
                      taskId,
                      current
                        ? migrateLegacyTaskStatus(current.status)
                        : null,
                      status,
                    );
                  } catch {
                    /* patchTask errors stay in the UI via failed request */
                  }
                })();
              }}
              onPriorityChange={(taskId, priority) => {
                void patchTask(taskId, { priority });
              }}
              onDueDateChange={(taskId, dueDate) => {
                void patchTask(taskId, {
                  dueDate: dueDate ? dueDate.toISOString() : null,
                });
              }}
              onAssigneeChange={(taskId, assigneeId) => {
                void patchTask(taskId, { assigneeId });
              }}
              onReorder={(request) => {
                void (async () => {
                  const ok = await reorderTask(request);
                  if (!ok) return;
                  maybeLaunchReadyToStartAgent(
                    request.taskId,
                    request.fromStatus,
                    request.toStatus,
                  );
                })();
              }}
            />
          </div>
        ) : null}
      </div>
    </aside>
  );

  const sidePane = (
    <aside className="console-pane">
      {showChromeHeader ? (
        <div className="console-pane-header">
          <div className="console-pane-header-title">
            {showBack ? (
              <button
                type="button"
                className="console-icon-btn"
                onClick={closeOverlay}
                title="Back to project"
                aria-label="Back to project"
              >
                <ChevronLeftIcon />
              </button>
            ) : null}
            <span>{headerTitle}</span>
          </div>
          <div className="console-pane-header-actions">
            {onToggleTerminal && workspaceStage === "task" ? (
              <button
                type="button"
                className="console-icon-btn"
                onClick={onToggleTerminal}
                title={
                  terminalCollapsed
                    ? "Show terminal"
                    : "Hide terminal — expand task"
                }
                aria-label={
                  terminalCollapsed
                    ? "Show terminal"
                    : "Hide terminal and expand task"
                }
                aria-pressed={terminalCollapsed}
              >
                <ProjectsSidePanelIcon collapsed={terminalCollapsed} />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="console-pane-body">
        {project &&
        selectedTaskId &&
        !selectedDetailTask &&
        !loading ? (
          <div className="console-empty">
            Task not found.
            <button
              type="button"
              className="console-btn"
              style={{ marginTop: 8 }}
              onClick={() => onSelectedTaskIdChange(null)}
            >
              Back to project
            </button>
          </div>
        ) : null}
        {project ? (
          <div
            className={`task-panel-layer task-panel-layer--detail${
              showDetailLayer ? " is-active" : " is-exit"
            }`}
            aria-hidden={!showDetailLayer}
          >
            {renderedDetailTask ? (
              <div className="task-panel-island task-panel-island--detail">
                <TaskStackedDetailView
                  task={renderedDetailTask}
                  showDisplayId={false}
                  projectOptions={projectOptions}
                  assigneeOptions={assigneeOptions}
                  onStatusChange={(status: TaskStatus) => {
                    const fromStatus = migrateLegacyTaskStatus(
                      selectedRawTask?.status ?? renderedDetailTask.status,
                    );
                    void (async () => {
                      try {
                        await patchTask(renderedDetailTask.id, { status });
                        maybeLaunchReadyToStartAgent(
                          renderedDetailTask.id,
                          fromStatus,
                          status,
                        );
                      } catch {
                        /* patchTask errors stay in the UI via failed request */
                      }
                    })();
                  }}
                  onPriorityChange={(priority) => {
                    void patchTask(renderedDetailTask.id, { priority });
                  }}
                  onDueDateChange={(dueDate) => {
                    void patchTask(renderedDetailTask.id, {
                      dueDate: dueDate ? dueDate.toISOString() : null,
                    });
                  }}
                  onAssigneeChange={(assigneeId) => {
                    void patchTask(renderedDetailTask.id, { assigneeId });
                  }}
                  onProjectChange={(projectKey) => {
                    const next = projectKey
                      ? ([...projectsById.values()].find(
                          (entry) => entry.key === projectKey,
                        ) ?? null)
                      : null;
                    void patchTask(renderedDetailTask.id, {
                      projectId: next?.id ?? null,
                    });
                  }}
                  onSaveDescription={(description) => {
                    void patchTask(renderedDetailTask.id, { description });
                  }}
                  onChangeLinks={(links) => {
                    void patchTask(renderedDetailTask.id, { links });
                  }}
                  onSaveTitle={async (title) => {
                    const trimmed = title.trim();
                    if (!trimmed) {
                      return {
                        ok: false as const,
                        error: "Task title is required.",
                      };
                    }
                    try {
                      await patchTask(renderedDetailTask.id, {
                        title: trimmed,
                      });
                      return { ok: true as const };
                    } catch (saveError) {
                      return {
                        ok: false as const,
                        error:
                          saveError instanceof Error
                            ? saveError.message
                            : "Could not save title.",
                      };
                    }
                  }}
                  belowDescription={
                    <TaskActivityPanel
                      taskId={renderedDetailTask.id}
                      taskUpdatedAt={
                        selectedRawTask?.id === renderedDetailTask.id
                          ? (selectedRawTask?.updatedAt ?? null)
                          : null
                      }
                      feedRevision={activityFeedRevision}
                      working={workingTaskIdSet.has(renderedDetailTask.id)}
                      agentOpenInTerminal={
                        !terminalCollapsed &&
                        agentOpenTaskIds.includes(renderedDetailTask.id)
                      }
                      assigneeAvatarById={assigneeAvatarById}
                      avatarByEmail={avatarByEmail}
                      taskSummary={{
                        number:
                          selectedRawTask?.id === renderedDetailTask.id
                            ? (selectedRawTask?.number ?? 0)
                            : 0,
                        title: renderedDetailTask.title,
                        description: renderedDetailTask.description ?? null,
                        projectKey: renderedDetailTask.projectKey ?? null,
                        projectId:
                          selectedRawTask?.id === renderedDetailTask.id
                            ? (selectedRawTask?.projectId ?? null)
                            : (project.id ?? null),
                        workingDirectory:
                          project?.localWorkingDirectory ?? null,
                      }}
                      onAttachSession={(session, options) => {
                        onAttachAgentSession?.({
                          taskId: session.taskId,
                          chatId: session.chatId,
                          prompt: options?.prompt,
                          focusUi: options?.focusUi,
                          sessionIsNew: options?.sessionIsNew,
                          forceReattach: options?.forceReattach,
                          replyParentCommentId: options?.replyParentCommentId,
                        });
                      }}
                      onEndSession={(session: TaskAgentSession) => {
                        onEndAgentSession?.({
                          taskId: session.taskId,
                          chatId: session.chatId,
                        });
                      }}
                      onMarkInProgress={async () => {
                        await patchTask(renderedDetailTask.id, {
                          status: "in_progress",
                          activityActor: "agent",
                        });
                      }}
                      onLaunchFailed={(error) =>
                        holdTaskForAgent(
                          renderedDetailTask.id,
                          buildLaunchFailedHold(error),
                          { force: true },
                        )
                      }
                      onSimulateLaunchFail={() =>
                        holdTaskForAgent(
                          renderedDetailTask.id,
                          buildLaunchFailedHold(
                            "Simulated launch failure (agent testing mode).",
                          ),
                          { force: true },
                        )
                      }
                      onSimulateNeedsInput={() =>
                        holdTaskForAgent(
                          renderedDetailTask.id,
                          {
                            kind: "needs_input",
                            commentBody: formatAgentHoldComment(
                              "needs_input",
                              "Simulated needs-input hold (agent testing mode). Reply to continue.",
                            ),
                          },
                          { force: true },
                        )
                      }
                      onSimulateReadyForReview={() =>
                        reviewTaskForAgent(
                          client,
                          renderedDetailTask.id,
                          "Simulated ready-for-review (agent testing mode).",
                          { force: true },
                        ).then((ok) => {
                          if (!ok) return;
                          setData((current) =>
                            (current ?? []).map((task) =>
                              task.id === renderedDetailTask.id
                                ? { ...task, status: "in_review" }
                                : task,
                            ),
                          );
                          onActivityFeedInvalidate?.();
                        })
                      }
                    />
                  }
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );

  const usePortals = Boolean(sideTarget || mainTarget);
  const showListInMain = Boolean(mainTarget) && Boolean(project);
  const showSideContent =
    Boolean(sideTarget) &&
    (workspaceStage === "task" || Boolean(heldDetailTask));

  if (!usePortals) {
    return sidePane;
  }

  return (
    <>
      {sideTarget && showSideContent
        ? createPortal(sidePane, sideTarget)
        : null}
      {mainTarget && showListInMain
        ? createPortal(listPane, mainTarget)
        : null}
    </>
  );
}
