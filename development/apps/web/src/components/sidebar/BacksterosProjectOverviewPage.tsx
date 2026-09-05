import { PlusIcon } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { useParams, useRouter } from "@tanstack/react-router";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";

import {
  openBacksterosTaskChat,
  resolveActiveBacksterosTaskId,
} from "~/backsteros/openTaskChat";
import { usePromoteWorkingBacksterosTasks, subscribeBacksterosTaskStatusChanged } from "~/backsteros/promoteWorkingTask";
import { useBacksterosTaskChatStore } from "~/backsteros/taskChatStore";
import { useBacksterosTaskDetailUiStore } from "~/backsteros/taskDetailUiStore";
import type { BacksterosCodebaseProject, BacksterosTask } from "~/backsteros/types";
import { useBacksterosCodebaseProjects } from "~/backsteros/useBacksterosCodebaseProjects";
import { useBacksterosProjectTasks } from "~/backsteros/useBacksterosProjectTasks";
import { useEnsureBacksterosT3Project } from "~/backsteros/useEnsureBacksterosT3Project";
import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { useProjects } from "~/state/entities";
import { resolveThreadRouteTarget } from "~/threadRoutes";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
} from "../WorkspaceBreadcrumb";
import { Button } from "../ui/button";
import { BacksterosProjectTasksOverview } from "./BacksterosProjectTasksOverview";

/**
 * BacksterOS project home: desktop-style task list in the main pane;
 * create/detail lives in the shared task side panel.
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
  const openCreateTaskDetail = useBacksterosTaskDetailUiStore(
    (store) => store.openCreateTaskDetail,
  );
  const { state: tasksState, reload: reloadTasks, patchLocalTask } = useBacksterosProjectTasks(
    projectId,
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
    selection?.taskId && selection.project.id === projectId
      ? selection.taskId
      : activeTaskId;

  const handleNewTask = useCallback(() => {
    if (!project) return;
    openCreateTaskDetail(project, { reveal: true });
  }, [openCreateTaskDetail, project]);

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

  usePromoteWorkingBacksterosTasks();
  useEffect(() => {
    return subscribeBacksterosTaskStatusChanged(({ taskId, status }) => {
      patchLocalTask(taskId, { status });
    });
  }, [patchLocalTask]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background text-foreground">
      <WorkspacePageHeader
        electron={isElectron}
        className={cn(
          "border-b border-border/50",
          isElectron && "drag-region",
        )}
      >
        <WorkspaceBreadcrumb ariaLabel="Project breadcrumb" className="min-w-0 flex-1">
          <WorkspaceBreadcrumbItem current className="min-w-0">
            <h2 className="min-w-0 truncate text-sm font-medium text-foreground">
              {projectName}
            </h2>
          </WorkspaceBreadcrumbItem>
        </WorkspaceBreadcrumb>
        {project ? (
          <Button
            type="button"
            size="compact"
            variant="outline"
            onClick={handleNewTask}
            className={cn("shrink-0", isElectron && "no-drag")}
          >
            <PlusIcon />
            New task
          </Button>
        ) : null}
      </WorkspacePageHeader>
      <BacksterosProjectTasksOverview
        state={tasksState}
        projectKey={project?.key ?? null}
        selectedTaskId={selectedTaskId}
        onRetry={reloadTasks}
        onSelectTask={handleSelectTask}
      />
    </div>
  );
}
