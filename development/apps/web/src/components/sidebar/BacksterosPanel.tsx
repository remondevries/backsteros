import { ArrowLeftIcon } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { useParams, useRouter } from "@tanstack/react-router";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";

import { BACKSTEROS_INBOX_ATTENTION_STATUSES } from "~/backsteros/client";
import {
  openBacksterosTaskChat,
  resolveActiveBacksterosTaskId,
} from "~/backsteros/openTaskChat";
import {
  usePromoteWorkingBacksterosTasks,
  subscribeBacksterosTaskStatusChanged,
} from "~/backsteros/promoteWorkingTask";
import { useSyncBacksterosAgentPresence } from "~/backsteros/useBacksterosAgentPresence";
import { useBacksterosTaskChatStore } from "~/backsteros/taskChatStore";
import { useBacksterosTaskDetailUiStore } from "~/backsteros/taskDetailUiStore";
import {
  useSidebarModeStore,
  type BacksterosRailMode,
} from "~/backsteros/sidebarModeStore";
import type { BacksterosCodebaseProject, BacksterosTask } from "~/backsteros/types";
import { useBacksterosCodebaseProjects } from "~/backsteros/useBacksterosCodebaseProjects";
import { useBacksterosInboxAttentionTasks } from "~/backsteros/useBacksterosInboxAttentionTasks";
import { useBacksterosProjectTasks } from "~/backsteros/useBacksterosProjectTasks";
import { useEnsureBacksterosT3Project } from "~/backsteros/useEnsureBacksterosT3Project";
import type { BacksterosTaskStatus } from "~/backsteros/taskStatus";
import { useProjects } from "~/state/entities";
import { resolveThreadRouteTarget } from "~/threadRoutes";
import { BacksterosProjectList } from "./BacksterosProjectList";
import { BacksterosTaskList } from "./BacksterosTaskList";

const INBOX_STATUS_FILTER = new Set<BacksterosTaskStatus>(
  BACKSTEROS_INBOX_ATTENTION_STATUSES,
);

export function BacksterosPanel({
  searchQuery = "",
}: {
  readonly searchQuery?: string;
}) {
  const router = useRouter();
  const projects = useProjects();
  const ensureT3Project = useEnsureBacksterosT3Project();
  const selection = useBacksterosTaskDetailUiStore((state) => state.selection);
  const openTaskDetail = useBacksterosTaskDetailUiStore((state) => state.openTaskDetail);
  const clearTaskDetail = useBacksterosTaskDetailUiStore((state) => state.clearTaskDetail);
  const railMode = useSidebarModeStore((state) => state.backsterosRailMode);
  const { state: projectsState, reload: reloadProjects } = useBacksterosCodebaseProjects(true);

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
   * Left rail drills into a project's tasks when a task is open or create-task
   * is active for that project (Projects mode). Create uses `taskId: null`.
   */
  const taskListProject =
    railMode === "projects" && selection != null ? selection.project : null;

  const { state: tasksState, reload: reloadTasks, patchLocalTask } = useBacksterosProjectTasks(
    taskListProject?.id ?? null,
  );
  const {
    state: inboxState,
    reload: reloadInbox,
    patchLocalTask: patchInboxTask,
  } = useBacksterosInboxAttentionTasks(railMode === "inbox");

  const byTaskId = useBacksterosTaskChatStore((state) => state.byTaskId);
  const selectedProjectId = useParams({
    strict: false,
    select: (params) =>
      typeof params.projectId === "string" && params.projectId.trim()
        ? params.projectId
        : null,
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
  const activeTaskId = useMemo(() => {
    if (selection?.taskId) return selection.taskId;
    return resolveActiveBacksterosTaskId({ byTaskId, route: activeRoute });
  }, [activeRoute, byTaskId, selection?.taskId]);

  useEffect(() => {
    if (taskListProject?.id) {
      reloadTasks();
    }
  }, [reloadTasks, taskListProject?.id]);

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

  const handleSelectProject = useCallback(
    (project: BacksterosCodebaseProject) => {
      clearTaskDetail();
      void router.navigate({
        to: "/backsteros/project/$projectId",
        params: { projectId: project.id },
        search: project.name.trim() ? { title: project.name } : {},
      });
    },
    [clearTaskDetail, router],
  );

  const handleBackToProjects = useCallback(() => {
    const project = taskListProject;
    clearTaskDetail();
    if (!project) return;
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

  if (railMode === "inbox") {
    const projectsReady = projectsState.status === "ready";
    const inboxListState =
      !projectsReady
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
      <BacksterosTaskList
        state={inboxListState}
        searchQuery={searchQuery}
        onRetry={reloadInbox}
        activeTaskId={activeTaskId}
        statusFilter={INBOX_STATUS_FILTER}
        projectNameById={projectNameById}
        emptyLabel="Nothing needs attention"
        onSelectTask={handleSelectInboxTask}
      />
    );
  }

  if (taskListProject) {
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
            {taskListProject.name}
          </span>
        </div>
        <BacksterosTaskList
          state={tasksState}
          searchQuery={searchQuery}
          onRetry={reloadTasks}
          activeTaskId={activeTaskId}
          onSelectTask={handleSelectProjectTask}
        />
      </div>
    );
  }

  return (
    <BacksterosProjectList
      state={projectsState}
      searchQuery={searchQuery}
      selectedProjectId={selectedProjectId}
      onRetry={reloadProjects}
      onSelectProject={handleSelectProject}
    />
  );
}

export const BACKSTEROS_RAIL_MODE_OPTIONS: ReadonlyArray<{
  readonly value: BacksterosRailMode;
  readonly label: string;
}> = [
  { value: "inbox", label: "Inbox" },
  { value: "projects", label: "Projects" },
];
