import { useAtomValue } from "@effect/atom-react";
import { ArrowLeftIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "@tanstack/react-router";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";

import {
  BACKSTEROS_INBOX_ATTENTION_STATUSES,
  updateBacksterosProject,
  updateBacksterosTask,
} from "~/backsteros/client";
import { isBacksterosInboxDueTask } from "~/backsteros/inboxDue";
import {
  orderedBacksterosInboxTaskIds,
  orderedBacksterosProjectIds,
  orderedBacksterosTaskIds,
  resolveAdjacentListItemId,
  resolveSidepanelHighlightSeed,
} from "~/backsteros/listTraversal";
import {
  useListKeyboardNavStore,
  handleListKeyboardNavEvent,
} from "~/backsteros/listKeyboardNavStore";
import { isBacksterosGoEditableTarget } from "~/backsteros/backsterosRailMode";
import { isBacksterosComposeModalOpen } from "~/backsteros/isBacksterosComposeModalOpen";
import { isBacksterosPropertyMenuOpen } from "~/backsteros/isBacksterosPropertyMenuOpen";
import { openBacksterosTaskChat, resolveActiveBacksterosTaskId } from "~/backsteros/openTaskChat";
import {
  usePromoteWorkingBacksterosTasks,
  subscribeBacksterosTaskStatusChanged,
} from "~/backsteros/promoteWorkingTask";
import type { BacksterosProjectSortPatch } from "~/backsteros/project-reorder";
import type { BacksterosTaskSortPatch } from "~/backsteros/task-reorder";
import { useSyncBacksterosAgentPresence } from "~/backsteros/useBacksterosAgentPresence";
import { matchesBacksterosSearchQuery } from "~/backsteros/searchQuery";
import { useBacksterosTaskChatStore } from "~/backsteros/taskChatStore";
import { useBacksterosTaskDetailUiStore } from "~/backsteros/taskDetailUiStore";
import { useSidebarModeStore, type BacksterosRailMode } from "~/backsteros/sidebarModeStore";
import type { BacksterosCodebaseProject, BacksterosTask } from "~/backsteros/types";
import { useBacksterosCodebaseProjects } from "~/backsteros/useBacksterosCodebaseProjects";
import { useBacksterosInboxAttentionTasks } from "~/backsteros/useBacksterosInboxAttentionTasks";
import { useBacksterosProjectTasks } from "~/backsteros/useBacksterosProjectTasks";
import { useEnsureBacksterosT3Project } from "~/backsteros/useEnsureBacksterosT3Project";
import { migrateBacksterosTaskStatus, type BacksterosTaskStatus } from "~/backsteros/taskStatus";
import {
  resolveShortcutCommand,
  threadJumpIndexFromCommand,
  threadTraversalDirectionFromCommand,
} from "~/keybindings";
import { isTerminalFocused } from "~/lib/terminalFocus";
import { isModelPickerOpen } from "~/modelPickerVisibility";
import { useProjects } from "~/state/entities";
import { primaryServerKeybindingsAtom } from "~/state/server";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "~/terminalUiStateStore";
import { resolveThreadRouteTarget } from "~/threadRoutes";
import { toastManager } from "../ui/toast";
import { BacksterosContentCrossfade } from "~/backsteros/BacksterosContentCrossfade";
import { BacksterosProjectList } from "./BacksterosProjectList";
import { BacksterosTaskList } from "./BacksterosTaskList";

const INBOX_STATUS_FILTER = new Set<BacksterosTaskStatus>(BACKSTEROS_INBOX_ATTENTION_STATUSES);

function backsterosRailContentKey(input: {
  readonly railMode: BacksterosRailMode;
  readonly taskListProjectId: string | null;
}): string {
  if (input.railMode === "inbox") return "inbox";
  if (input.taskListProjectId) return `project-tasks:${input.taskListProjectId}`;
  return "projects";
}

export function BacksterosPanel({ searchQuery = "" }: { readonly searchQuery?: string }) {
  const router = useRouter();
  const projects = useProjects();
  const ensureT3Project = useEnsureBacksterosT3Project();
  const selection = useBacksterosTaskDetailUiStore((state) => state.selection);
  const openTaskDetail = useBacksterosTaskDetailUiStore((state) => state.openTaskDetail);
  const clearTaskDetail = useBacksterosTaskDetailUiStore((state) => state.clearTaskDetail);
  const railMode = useSidebarModeStore((state) => state.backsterosRailMode);
  const {
    state: projectsState,
    reload: reloadProjects,
    applySortOrderPatches,
  } = useBacksterosCodebaseProjects(true);

  const handleReorderProjects = useCallback(
    (patches: readonly BacksterosProjectSortPatch[]) => {
      if (patches.length === 0) return;
      applySortOrderPatches(patches);
      void Promise.all(
        patches.map((patch) => updateBacksterosProject(patch.id, { sortOrder: patch.sortOrder })),
      ).catch((error: unknown) => {
        reloadProjects();
        toastManager.add({
          type: "error",
          title: "Could not reorder projects",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      });
    },
    [applySortOrderPatches, reloadProjects],
  );

  const projectById = useMemo(() => {
    if (projectsState.status !== "ready") {
      return new Map<string, BacksterosCodebaseProject>();
    }
    return new Map(projectsState.projects.map((project) => [project.id, project]));
  }, [projectsState]);

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const [id, project] of projectById) {
      map.set(id, project.name);
    }
    return map;
  }, [projectById]);

  /**
   * Left rail drills into a project's tasks when a task is open for that
   * project (Projects mode). Create-task uses the compose modal, not the rail.
   */
  const taskListProject = railMode === "projects" && selection != null ? selection.project : null;

  const {
    state: tasksState,
    reload: reloadTasks,
    patchLocalTask,
    applySortOrderPatches: applyTaskSortOrderPatches,
  } = useBacksterosProjectTasks(taskListProject?.id ?? null);
  const {
    state: inboxState,
    reload: reloadInbox,
    patchLocalTask: patchInboxTask,
    applySortOrderPatches: applyInboxSortOrderPatches,
  } = useBacksterosInboxAttentionTasks(railMode === "inbox");

  const persistTaskSortOrderPatches = useCallback(
    (
      patches: readonly BacksterosTaskSortPatch[],
      options: {
        readonly applyLocal: (patches: readonly BacksterosTaskSortPatch[]) => void;
        readonly onFailure: () => void;
      },
    ) => {
      if (patches.length === 0) return;
      options.applyLocal(patches);
      void Promise.all(
        patches.map((patch) => updateBacksterosTask(patch.id, { sortOrder: patch.sortOrder })),
      ).catch((error: unknown) => {
        options.onFailure();
        toastManager.add({
          type: "error",
          title: "Could not reorder tasks",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      });
    },
    [],
  );

  const handleReorderProjectTasks = useCallback(
    (patches: readonly BacksterosTaskSortPatch[]) => {
      persistTaskSortOrderPatches(patches, {
        applyLocal: applyTaskSortOrderPatches,
        onFailure: reloadTasks,
      });
    },
    [applyTaskSortOrderPatches, persistTaskSortOrderPatches, reloadTasks],
  );

  const handleReorderInboxTasks = useCallback(
    (patches: readonly BacksterosTaskSortPatch[]) => {
      persistTaskSortOrderPatches(patches, {
        applyLocal: applyInboxSortOrderPatches,
        onFailure: reloadInbox,
      });
    },
    [applyInboxSortOrderPatches, persistTaskSortOrderPatches, reloadInbox],
  );

  const byTaskId = useBacksterosTaskChatStore((state) => state.byTaskId);
  const selectedProjectId = useParams({
    strict: false,
    select: (params) =>
      typeof params.projectId === "string" && params.projectId.trim() ? params.projectId : null,
  });
  const routeTarget = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params),
  });
  const activeRoute = useMemo(() => {
    if (!routeTarget) return null;
    if (routeTarget.kind === "draft") {
      return { kind: "draft" as const, draftId: routeTarget.draftId };
    }
    return {
      kind: "server" as const,
      threadKey: scopedThreadKey(routeTarget.threadRef),
    };
  }, [routeTarget]);
  const routeFromBinding = useMemo(
    () => resolveActiveBacksterosTaskId({ byTaskId, route: activeRoute }),
    [activeRoute, byTaskId],
  );
  // Selection wins while browsing the log-mode list (Cmd+Shift+[ / ]).
  // Fall back to the route binding when nothing is selected yet.
  const activeTaskId = selection?.taskId ?? routeFromBinding ?? null;

  // j/k cursor on the left rail. Remember the last projects-rail row so Escape
  // back from a project overview can restore highlight instead of jumping to top.
  const [sidepanelHighlightId, setSidepanelHighlightId] = useState<string | null>(null);
  const sidepanelHighlightIdRef = useRef(sidepanelHighlightId);
  sidepanelHighlightIdRef.current = sidepanelHighlightId;
  const lastProjectsRailHighlightRef = useRef<string | null>(null);

  usePromoteWorkingBacksterosTasks();
  useSyncBacksterosAgentPresence(true);
  useEffect(() => {
    return subscribeBacksterosTaskStatusChanged(({ taskId, status }) => {
      patchLocalTask(taskId, { status });
      patchInboxTask(taskId, { status });
    });
  }, [patchInboxTask, patchLocalTask]);

  const openTask = useCallback(
    (task: BacksterosTask, project: BacksterosCodebaseProject) => {
      openTaskDetail({ taskId: task.id, project });
      void openBacksterosTaskChat({
        task,
        backsterosProject: project,
        projects,
        ensureT3Project,
        navigate: (opts) => router.navigate(opts as never),
      });
    },
    [ensureT3Project, openTaskDetail, projects, router],
  );

  const openProject = useCallback(
    (project: BacksterosCodebaseProject, options?: { readonly focusTasks?: boolean }) => {
      clearTaskDetail();
      if (options?.focusTasks) {
        useListKeyboardNavStore.getState().setActiveZone("main");
      }
      void router.navigate({
        to: "/backsteros/project/$projectId",
        params: { projectId: project.id },
        search: project.name.trim() ? { title: project.name } : {},
      });
    },
    [clearTaskDetail, router],
  );

  /** Mouse / Enter confirmation — open project and hand j/k to its task list. */
  const handleSelectProject = useCallback(
    (project: BacksterosCodebaseProject) => {
      lastProjectsRailHighlightRef.current = project.id;
      setSidepanelHighlightId(project.id);
      openProject(project, { focusTasks: true });
    },
    [openProject],
  );

  /** j/k preview — open project in the main pane but keep list focus on the rail. */
  const handlePreviewProject = useCallback(
    (project: BacksterosCodebaseProject) => {
      lastProjectsRailHighlightRef.current = project.id;
      setSidepanelHighlightId(project.id);
      openProject(project);
    },
    [openProject],
  );

  const leaveOpenProject = useCallback(() => {
    const projectId = selectedProjectId ?? taskListProject?.id ?? selection?.project.id ?? null;
    if (projectId) {
      lastProjectsRailHighlightRef.current = projectId;
      setSidepanelHighlightId(projectId);
    }
    clearTaskDetail();
    useListKeyboardNavStore.getState().setActiveZone("sidepanel");
    void router.navigate({ to: "/backsteros/projects" });
    return true;
  }, [clearTaskDetail, router, selectedProjectId, selection?.project.id, taskListProject?.id]);

  const handleBackToProjects = useCallback(() => {
    const project = taskListProject;
    clearTaskDetail();
    if (!project) return;
    useListKeyboardNavStore.getState().setActiveZone("main");
    void router.navigate({
      to: "/backsteros/project/$projectId",
      params: { projectId: project.id },
      search: project.name.trim() ? { title: project.name } : {},
    });
  }, [clearTaskDetail, router, taskListProject]);

  const handleSelectProjectTask = useCallback(
    (task: BacksterosTask) => {
      if (!taskListProject) return;
      openTask(task, taskListProject);
    },
    [openTask, taskListProject],
  );

  const handleSelectInboxTask = useCallback(
    (task: BacksterosTask) => {
      const project =
        (task.projectId ? projectById.get(task.projectId) : null) ??
        (selection?.project.id === task.projectId ? selection.project : null);
      if (!project) return;
      openTask(task, project);
    },
    [openTask, projectById, selection?.project],
  );

  const isSearching = searchQuery.trim().length > 0;

  const visibleProjects = useMemo(() => {
    if (projectsState.status !== "ready") return [];
    if (!isSearching) return projectsState.projects;
    return projectsState.projects.filter((project) =>
      matchesBacksterosSearchQuery(
        [
          project.name,
          project.key,
          project.summary,
          project.githubRepository,
          project.localWorkingDirectory,
        ],
        searchQuery,
      ),
    );
  }, [isSearching, projectsState, searchQuery]);

  const visibleInboxTasks = useMemo(() => {
    if (inboxState.status !== "ready" || projectsState.status !== "ready") return [];
    return inboxState.tasks.filter((task) => {
      if (task.projectId == null || !projectById.has(task.projectId)) return false;
      const status = migrateBacksterosTaskStatus(task.status);
      const inAttention = INBOX_STATUS_FILTER.has(status);
      if (!inAttention && !isBacksterosInboxDueTask(task)) return false;
      if (!isSearching) return true;
      const projectName = task.projectId ? (projectNameById.get(task.projectId) ?? "") : "";
      return matchesBacksterosSearchQuery([task.title, task.number, projectName], searchQuery);
    });
  }, [inboxState, isSearching, projectById, projectNameById, projectsState.status, searchQuery]);

  const visibleProjectTasks = useMemo(() => {
    if (!taskListProject || tasksState.status !== "ready") return [];
    if (!isSearching) return tasksState.tasks;
    return tasksState.tasks.filter((task) =>
      matchesBacksterosSearchQuery([task.title, task.number], searchQuery),
    );
  }, [isSearching, searchQuery, taskListProject, tasksState]);

  const listMode = useMemo(() => {
    if (railMode === "inbox") {
      return {
        kind: "tasks" as const,
        itemIds: orderedBacksterosInboxTaskIds(visibleInboxTasks),
        currentItemId: activeTaskId,
        activate: (id: string) => {
          const task = visibleInboxTasks.find((entry) => entry.id === id);
          if (task) handleSelectInboxTask(task);
        },
      };
    }
    if (taskListProject) {
      return {
        kind: "tasks" as const,
        itemIds: orderedBacksterosTaskIds(visibleProjectTasks),
        currentItemId: activeTaskId,
        activate: (id: string) => {
          const task = visibleProjectTasks.find((entry) => entry.id === id);
          if (task) handleSelectProjectTask(task);
        },
      };
    }
    return {
      kind: "projects" as const,
      itemIds: orderedBacksterosProjectIds(visibleProjects),
      currentItemId: selectedProjectId,
      // j/k previews the project; Enter (enterMovesToMain) hands focus to tasks.
      activate: (id: string) => {
        const project = visibleProjects.find((entry) => entry.id === id);
        if (project) handlePreviewProject(project);
      },
    };
  }, [
    activeTaskId,
    handlePreviewProject,
    handleSelectInboxTask,
    handleSelectProjectTask,
    railMode,
    selectedProjectId,
    taskListProject,
    visibleInboxTasks,
    visibleProjectTasks,
    visibleProjects,
  ]);

  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const routeThreadRef = routeTarget?.kind === "server" ? routeTarget.threadRef : null;
  const routeTerminalOpen = useTerminalUiStateStore((state) =>
    routeThreadRef
      ? selectThreadTerminalUiState(state.terminalUiStateByThreadKey, routeThreadRef).terminalOpen
      : false,
  );

  const registerListKeyboardNav = useListKeyboardNavStore((state) => state.register);
  const listModeRef = useRef(listMode);
  listModeRef.current = listMode;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const selectedProjectIdRef = useRef(selectedProjectId);
  selectedProjectIdRef.current = selectedProjectId;
  const listItemIdsKey = listMode.itemIds.join("\0");

  useEffect(() => {
    if (selectedProjectId) {
      lastProjectsRailHighlightRef.current = selectedProjectId;
    }
  }, [selectedProjectId]);

  // Keep the j/k cursor on the open/selected row after Inbox ↔ Projects (and
  // other list-mode flips). Do not clear while item ids are still loading —
  // that used to drop the highlight and never put it back.
  useEffect(() => {
    const ids = listModeRef.current.itemIds;
    const nextHighlight = resolveSidepanelHighlightSeed({
      currentItemId: listModeRef.current.currentItemId,
      itemIds: ids,
      rememberedId: listMode.kind === "projects" ? lastProjectsRailHighlightRef.current : null,
    });
    setSidepanelHighlightId(nextHighlight);
    if (listMode.kind === "projects" && nextHighlight != null) {
      lastProjectsRailHighlightRef.current = nextHighlight;
    }
  }, [listMode.kind, listMode.currentItemId, railMode, taskListProject?.id]);

  useEffect(() => {
    // Rail switches should show the left-list outline again (composer/main may
    // have held the zone while a task chat was focused).
    useListKeyboardNavStore.getState().setActiveZone("sidepanel");
  }, [railMode]);

  useEffect(() => {
    const ids = listModeRef.current.itemIds;
    if (ids.length === 0) return;

    if (sidepanelHighlightId != null && ids.includes(sidepanelHighlightId)) {
      return;
    }

    const seedId = listModeRef.current.currentItemId;
    if (seedId != null && ids.includes(seedId)) {
      setSidepanelHighlightId(seedId);
      return;
    }

    if (sidepanelHighlightId != null) {
      setSidepanelHighlightId(null);
    }
  }, [listMode.currentItemId, listItemIdsKey, sidepanelHighlightId]);

  useEffect(() => {
    // Do not force activeZone here — Enter / project open moves focus to main,
    // and re-registering on listMode changes must not steal it back.
    const isTaskList = listMode.kind === "tasks";
    return registerListKeyboardNav({
      zone: "sidepanel",
      getItemIds: () => listModeRef.current.itemIds,
      getSelectedId: () => {
        // Prefer the j/k cursor so Escape-back to the projects rail continues
        // from the project we left (route selection is null on /projects).
        if (sidepanelHighlightIdRef.current != null) {
          return sidepanelHighlightIdRef.current;
        }
        return isTaskList ? null : listModeRef.current.currentItemId;
      },
      // Tasks: highlight-only while browsing. Projects: omit so j/k still previews.
      onHighlight: isTaskList ? (id) => setSidepanelHighlightId(id) : undefined,
      onActivate: (id) => listModeRef.current.activate(id),
      enterMovesToMain: listMode.kind === "projects",
    });
  }, [listMode.kind, registerListKeyboardNav]);

  const listKeyboardActiveZone = useListKeyboardNavStore((state) => state.activeZone);
  // Open/route selection stays distinct from the j/k cursor outline.
  const sidepanelActiveTaskId = activeTaskId;

  // Only one primary outline at a time: hide the list keyboard ring while the
  // chat composer (or any editable) owns DOM focus.
  const [editableHasFocus, setEditableHasFocus] = useState(false);
  useEffect(() => {
    const sync = () => {
      setEditableHasFocus(isBacksterosGoEditableTarget(document.activeElement));
    };
    sync();
    const onFocusOut = () => {
      // focusout runs before the new target receives focus.
      queueMicrotask(sync);
    };
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  const showSidepanelKeyboardOutline = listKeyboardActiveZone === "sidepanel" && !editableHasFocus;

  // Prefer the j/k cursor; fall back to the open row so a primary outline still
  // shows after a rail switch before the first j/k press.
  const sidepanelKeyboardFocusTaskId =
    listMode.kind === "tasks" && showSidepanelKeyboardOutline
      ? (sidepanelHighlightId ?? activeTaskId)
      : null;
  const sidepanelKeyboardFocusProjectId =
    listMode.kind === "projects" && showSidepanelKeyboardOutline
      ? (sidepanelHighlightId ?? selectedProjectId)
      : null;

  const leaveOpenProjectRef = useRef(leaveOpenProject);
  leaveOpenProjectRef.current = leaveOpenProject;
  const keybindingsRef = useRef(keybindings);
  keybindingsRef.current = keybindings;
  const routeTerminalOpenRef = useRef(routeTerminalOpen);
  routeTerminalOpenRef.current = routeTerminalOpen;

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const mode = listModeRef.current;
      const currentSelection = selectionRef.current;
      const currentSelectedProjectId = selectedProjectIdRef.current;

      // Escape hierarchy while browsing BacksterOS projects:
      // 0) property dropdown open → close menu only (do not leave task/project)
      // 1) yield to composer / editable (blur first)
      // 2) open task → return focus to the task list (keep task open)
      // 3) project page → projects rail root
      // Tab switches sidepanel ↔ main without leaving.
      if (
        event.key === "Escape" &&
        !event.repeat &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isTerminalFocused() &&
        !isModelPickerOpen()
      ) {
        // Let Base UI dismiss the open property menu; skip back-navigation.
        if (isBacksterosPropertyMenuOpen()) {
          return;
        }

        // Create-task compose layover owns Escape (close modal / nested menus).
        if (isBacksterosComposeModalOpen()) {
          return;
        }

        const openTaskId = currentSelection?.taskId ?? null;
        const editable = isBacksterosGoEditableTarget(event.target);

        // Composer focused on an open task: blur and return j/k to the left
        // sidepanel task list (keep the task/chat open).
        if (editable && openTaskId && currentSelection) {
          event.preventDefault();
          event.stopPropagation();
          if (event.target instanceof HTMLElement) {
            event.target.blur();
          }
          setSidepanelHighlightId(openTaskId);
          useListKeyboardNavStore.getState().setActiveZone("sidepanel");
          return;
        }

        if (editable) return;

        if (openTaskId && currentSelection) {
          event.preventDefault();
          event.stopPropagation();
          const { activeZone } = useListKeyboardNavStore.getState();
          // Return focus to the left sidepanel list while keeping the task open.
          if (activeZone !== "sidepanel") {
            setSidepanelHighlightId(openTaskId);
            useListKeyboardNavStore.getState().setActiveZone("sidepanel");
            return;
          }
          // Already on the sidepanel list — step up to the projects rail.
          leaveOpenProjectRef.current();
          return;
        }

        if (currentSelectedProjectId) {
          event.preventDefault();
          event.stopPropagation();
          const { activeZone } = useListKeyboardNavStore.getState();
          // From the project task list → projects rail (keep project open).
          if (activeZone !== "sidepanel") {
            useListKeyboardNavStore.getState().setActiveZone("sidepanel");
            return;
          }
          // Already on the projects list — leave the project.
          leaveOpenProjectRef.current();
          return;
        }
      }

      if (
        handleListKeyboardNavEvent(event, {
          terminalFocus: isTerminalFocused(),
          modelPickerOpen: isModelPickerOpen(),
          // Project overview registers `main` after navigation; Enter should
          // still hand j/k to the task list immediately.
          assumeMainAfterSidepanelEnter: mode.kind === "projects",
        })
      ) {
        return;
      }
      if (event.repeat) return;
      const command = resolveShortcutCommand(event, keybindingsRef.current, {
        platform: navigator.platform,
        context: {
          terminalFocus: isTerminalFocused(),
          terminalOpen: routeTerminalOpenRef.current,
          modelPickerOpen: isModelPickerOpen(),
        },
      });
      const activateTarget = (targetId: string | null) => {
        if (!targetId) return false;
        event.preventDefault();
        event.stopPropagation();
        mode.activate(targetId);
        return true;
      };
      const traversalDirection = threadTraversalDirectionFromCommand(command);
      if (traversalDirection !== null) {
        activateTarget(
          resolveAdjacentListItemId({
            itemIds: mode.itemIds,
            currentItemId: mode.currentItemId,
            direction: traversalDirection,
          }),
        );
        return;
      }
      const jumpIndex = threadJumpIndexFromCommand(command ?? "");
      if (jumpIndex === null) return;
      activateTarget(mode.itemIds[jumpIndex] ?? null);
    };
    window.addEventListener("keydown", onWindowKeyDown, true);
    return () => window.removeEventListener("keydown", onWindowKeyDown, true);
  }, [listMode.kind]);

  const railContentKey = backsterosRailContentKey({
    railMode,
    taskListProjectId: taskListProject?.id ?? null,
  });

  const projectsReady = projectsState.status === "ready";
  const inboxListState = !projectsReady
    ? ({ status: "loading" } as const)
    : inboxState.status === "ready"
      ? {
          ...inboxState,
          tasks: inboxState.tasks.filter(
            (task) => task.projectId != null && projectById.has(task.projectId),
          ),
        }
      : inboxState;

  return (
    <BacksterosContentCrossfade
      contentKey={railContentKey}
      className="flex min-h-0 flex-1 flex-col"
    >
      {(displayedKey) => {
        if (displayedKey === "inbox") {
          return (
            <BacksterosTaskList
              state={inboxListState}
              searchQuery={searchQuery}
              onRetry={reloadInbox}
              activeTaskId={sidepanelActiveTaskId}
              keyboardFocusTaskId={sidepanelKeyboardFocusTaskId}
              statusFilter={INBOX_STATUS_FILTER}
              showDueGroup
              projectNameById={projectNameById}
              emptyLabel="Nothing needs attention"
              onSelectTask={handleSelectInboxTask}
              onReorderTasks={handleReorderInboxTasks}
            />
          );
        }

        if (displayedKey.startsWith("project-tasks:")) {
          const displayedProjectId = displayedKey.slice("project-tasks:".length);
          const displayedProject =
            projectById.get(displayedProjectId) ??
            (taskListProject?.id === displayedProjectId ? taskListProject : null);
          return (
            <div className="flex min-h-0 flex-col">
              <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-sidebar-border/60 bg-sidebar px-1 pb-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={handleBackToProjects}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
                  aria-label="Back to BacksterOS projects"
                >
                  <ArrowLeftIcon className="size-4" />
                </button>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-sidebar-foreground">
                  {displayedProject?.name ?? "Project"}
                </span>
              </div>
              <BacksterosTaskList
                state={tasksState}
                searchQuery={searchQuery}
                onRetry={reloadTasks}
                activeTaskId={sidepanelActiveTaskId}
                keyboardFocusTaskId={sidepanelKeyboardFocusTaskId}
                onSelectTask={handleSelectProjectTask}
                onReorderTasks={handleReorderProjectTasks}
              />
            </div>
          );
        }

        return (
          <BacksterosProjectList
            state={projectsState}
            searchQuery={searchQuery}
            selectedProjectId={selectedProjectId}
            keyboardFocusProjectId={sidepanelKeyboardFocusProjectId}
            onRetry={reloadProjects}
            onSelectProject={handleSelectProject}
            onReorderProjects={handleReorderProjects}
          />
        );
      }}
    </BacksterosContentCrossfade>
  );
}

export const BACKSTEROS_RAIL_MODE_OPTIONS: ReadonlyArray<{
  readonly value: BacksterosRailMode;
  readonly label: string;
}> = [
  { value: "inbox", label: "Inbox" },
  { value: "projects", label: "Projects" },
];
