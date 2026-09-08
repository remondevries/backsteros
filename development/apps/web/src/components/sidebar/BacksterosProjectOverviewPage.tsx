import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "@tanstack/react-router";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";

import { updateBacksterosTask } from "~/backsteros/client";
import { openBacksterosTaskChat, resolveActiveBacksterosTaskId } from "~/backsteros/openTaskChat";
import { orderedBacksterosTaskIds } from "~/backsteros/listTraversal";
import { useListKeyboardNavStore } from "~/backsteros/listKeyboardNavStore";
import {
  usePromoteWorkingBacksterosTasks,
  subscribeBacksterosTaskStatusChanged,
} from "~/backsteros/promoteWorkingTask";
import { useBacksterosTaskChatStore } from "~/backsteros/taskChatStore";
import { useBacksterosTaskDetailUiStore } from "~/backsteros/taskDetailUiStore";
import type { BacksterosTaskSortPatch } from "~/backsteros/task-reorder";
import type { BacksterosCodebaseProject, BacksterosTask } from "~/backsteros/types";
import { useBacksterosCodebaseProjects } from "~/backsteros/useBacksterosCodebaseProjects";
import { useBacksterosProjectTasks } from "~/backsteros/useBacksterosProjectTasks";
import { useEnsureBacksterosT3Project } from "~/backsteros/useEnsureBacksterosT3Project";
import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { useProjects } from "~/state/entities";
import { resolveThreadRouteTarget } from "~/threadRoutes";
import { toastManager } from "../ui/toast";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem } from "../WorkspaceBreadcrumb";
import { BacksterosProjectTasksOverview } from "./BacksterosProjectTasksOverview";

/**
 * BacksterOS project home: desktop-style task list in the main pane.
 * Create/detail lives in the shared task side panel (left-rail New task / C).
 */
export function BacksterosProjectOverviewPage({
  projectId,
  fallbackTitle,
  project: projectProp,
}: {
  readonly projectId: string;
  readonly fallbackTitle?: string | null;
  readonly project?: BacksterosCodebaseProject | null;
}) {
  const router = useRouter();
  const projects = useProjects();
  const ensureT3Project = useEnsureBacksterosT3Project();
  const { state: projectsState } = useBacksterosCodebaseProjects(true);
  const selection = useBacksterosTaskDetailUiStore((store) => store.selection);
  const openTaskDetail = useBacksterosTaskDetailUiStore((store) => store.openTaskDetail);
  const {
    state: tasksState,
    reload: reloadTasks,
    patchLocalTask,
    applySortOrderPatches,
  } = useBacksterosProjectTasks(projectId);

  const handleReorderTasks = useCallback(
    (patches: readonly BacksterosTaskSortPatch[]) => {
      if (patches.length === 0) return;
      applySortOrderPatches(patches);
      void Promise.all(
        patches.map((patch) => updateBacksterosTask(patch.id, { sortOrder: patch.sortOrder })),
      ).catch((error: unknown) => {
        reloadTasks();
        toastManager.add({
          type: "error",
          title: "Could not reorder tasks",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      });
    },
    [applySortOrderPatches, reloadTasks],
  );
  const byTaskId = useBacksterosTaskChatStore((state) => state.byTaskId);
  const routeTarget = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params),
  });

  const project = useMemo(() => {
    if (projectProp) return projectProp;
    if (projectsState.status === "ready") {
      return projectsState.projects.find((entry) => entry.id === projectId) ?? null;
    }
    return null;
  }, [projectId, projectProp, projectsState]);

  const projectName = useMemo(() => {
    if (project?.name?.trim()) return project.name.trim();
    return fallbackTitle?.trim() || "Project";
  }, [fallbackTitle, project]);

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

  const activeTaskId = useMemo(
    () => resolveActiveBacksterosTaskId({ byTaskId, route: activeRoute }),
    [activeRoute, byTaskId],
  );

  const selectedTaskId =
    activeTaskId ??
    (selection?.taskId && selection.project.id === projectId ? selection.taskId : null);

  const handleSelectTask = useCallback(
    (task: BacksterosTask) => {
      if (!project) return;
      openTaskDetail({ taskId: task.id, project });
      void openBacksterosTaskChat({
        task,
        backsterosProject: project,
        projects,
        ensureT3Project,
        navigate: (opts) => router.navigate(opts as never),
      });
    },
    [ensureT3Project, openTaskDetail, project, projects, router],
  );

  const registerListKeyboardNav = useListKeyboardNavStore((state) => state.register);
  const listKeyboardActiveZone = useListKeyboardNavStore((state) => state.activeZone);
  const [keyboardHighlightId, setKeyboardHighlightId] = useState<string | null>(null);
  const keyboardHighlightIdRef = useRef(keyboardHighlightId);
  keyboardHighlightIdRef.current = keyboardHighlightId;
  const tasksStateRef = useRef(tasksState);
  tasksStateRef.current = tasksState;
  const handleSelectTaskRef = useRef(handleSelectTask);
  handleSelectTaskRef.current = handleSelectTask;

  const mainListItemIds = useMemo(() => {
    if (tasksState.status !== "ready") return [] as string[];
    return orderedBacksterosTaskIds(tasksState.tasks);
  }, [tasksState]);
  const mainListItemIdsRef = useRef(mainListItemIds);
  mainListItemIdsRef.current = mainListItemIds;

  useEffect(() => {
    setKeyboardHighlightId(null);
  }, [projectId]);

  // Enter from the projects rail lands on main — highlight the first task (or the
  // open task) so the primary outline shows immediately.
  useEffect(() => {
    if (listKeyboardActiveZone !== "main") return;

    if (selection?.taskId && selection.project.id === projectId) {
      setKeyboardHighlightId(selection.taskId);
      return;
    }

    if (mainListItemIds.length === 0) return;
    setKeyboardHighlightId((current) =>
      current != null && mainListItemIds.includes(current) ? current : (mainListItemIds[0] ?? null),
    );
  }, [
    listKeyboardActiveZone,
    mainListItemIds,
    projectId,
    selection?.project.id,
    selection?.taskId,
  ]);

  // Main-column task list so Tab / Enter from the projects rail can hand j/k here.
  // Keep the list registered while a task is open so Escape can return focus here
  // without closing the task.
  // Use a ref for ids so loading→ready does not thrash register/unregister.
  useEffect(() => {
    return registerListKeyboardNav({
      zone: "main",
      getItemIds: () => mainListItemIdsRef.current,
      getSelectedId: () => keyboardHighlightIdRef.current,
      onHighlight: (taskId) => setKeyboardHighlightId(taskId),
      onActivate: (taskId) => {
        const currentTasks = tasksStateRef.current;
        const task =
          currentTasks.status === "ready"
            ? currentTasks.tasks.find((entry) => entry.id === taskId)
            : undefined;
        if (!task) return;
        setKeyboardHighlightId(taskId);
        handleSelectTaskRef.current(task);
      },
    });
  }, [registerListKeyboardNav]);

  usePromoteWorkingBacksterosTasks();
  useEffect(() => {
    return subscribeBacksterosTaskStatusChanged(({ taskId, status }) => {
      patchLocalTask(taskId, { status });
    });
  }, [patchLocalTask]);

  const composeProject = useBacksterosTaskDetailUiStore((state) => state.composeProject);
  const keyboardFocusTaskId =
    listKeyboardActiveZone === "main" && composeProject == null ? keyboardHighlightId : null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background text-foreground">
      <WorkspacePageHeader
        electron={isElectron}
        className={cn("border-b border-border/50", isElectron && "drag-region")}
      >
        <WorkspaceBreadcrumb ariaLabel="Project breadcrumb" className="min-w-0 flex-1">
          <WorkspaceBreadcrumbItem current className="min-w-0">
            <h2 className="min-w-0 truncate text-sm font-medium text-foreground">{projectName}</h2>
          </WorkspaceBreadcrumbItem>
        </WorkspaceBreadcrumb>
      </WorkspacePageHeader>
      <BacksterosProjectTasksOverview
        state={tasksState}
        projectKey={project?.key ?? null}
        selectedTaskId={selectedTaskId}
        keyboardFocusTaskId={keyboardFocusTaskId}
        onRetry={reloadTasks}
        onSelectTask={handleSelectTask}
        onReorderTasks={handleReorderTasks}
      />
    </div>
  );
}
