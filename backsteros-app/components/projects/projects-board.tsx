"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { reorderProjectAction } from "@/lib/mutations/projects";
import { KanbanBoard, type KanbanColumn } from "@/components/kanban/kanban-board";
import { ProjectStatusIcon } from "@/components/project-status";
import { useLatestRef } from "@/hooks/use-latest-ref";
import type { Project, TaskPriority } from "@/lib/db/schema";
import { getProjectHrefFromKey } from "@/lib/project-sections";
import {
  migrateLegacyProjectStatus,
  type ProjectStatus,
} from "@/lib/project-status";
import { groupProjectsByStatus } from "@/lib/projects/group-projects-by-status";
import { applyOptimisticProjectReorder } from "@/lib/projects/project-reorder-client";
import type { ProjectTaskProgress } from "@/lib/project-task-progress";
import { toDate } from "@/lib/sync/timestamps";

import { ProjectBoardCard } from "./project-board-card";

type ProjectsBoardProps = {
  projects: Project[];
  taskProgressByProjectId?: Record<string, ProjectTaskProgress>;
  getProjectHref?: (projectKey: string) => string;
};

const EMPTY_TASK_PROGRESS: ProjectTaskProgress = { total: 0, completed: 0 };

function getSelectedProjectIdFromPathname(pathname: string): string | null {
  const orgMatch = pathname.match(/^\/organizations\/[^/]+\/projects\/([^/]+)/);
  if (orgMatch) {
    return orgMatch[1]!;
  }

  const match = pathname.match(/^\/projects\/([^/]+)/);
  if (!match || match[1] === "new") {
    return null;
  }
  return match[1];
}

function compareProjectsForBoard(left: Project, right: Project): number {
  return (
    left.sortOrder - right.sortOrder ||
    left.createdAt.getTime() - right.createdAt.getTime()
  );
}

function projectDateMs(value: unknown): number | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  return toDate(value)?.getTime() ?? null;
}

function mergeServerProjectsWithOptimistic(
  serverProjects: Project[],
  localProjects: Project[],
): Project[] {
  const localById = new Map(localProjects.map((project) => [project.id, project]));

  return serverProjects.map((serverProject) => {
    const localProject = localById.get(serverProject.id);
    if (!localProject) return serverProject;

    const localStatus = migrateLegacyProjectStatus(localProject.status);
    const serverStatus = migrateLegacyProjectStatus(serverProject.status);
    const statusChanged = localStatus !== serverStatus;
    const sortOrderChanged = localProject.sortOrder !== serverProject.sortOrder;

    if (statusChanged || sortOrderChanged) {
      return {
        ...serverProject,
        status: localProject.status,
        sortOrder: localProject.sortOrder,
      };
    }

    if (localProject.priority !== serverProject.priority) {
      return { ...serverProject, priority: localProject.priority };
    }

    if (
      projectDateMs(localProject.startDate) !==
        projectDateMs(serverProject.startDate) ||
      projectDateMs(localProject.dueDate) !== projectDateMs(serverProject.dueDate)
    ) {
      return {
        ...serverProject,
        startDate: toDate(localProject.startDate),
        dueDate: toDate(localProject.dueDate),
      };
    }

    return serverProject;
  });
}

export function ProjectsBoard({
  projects,
  taskProgressByProjectId = {},
  getProjectHref,
}: ProjectsBoardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const selectedProjectId = getSelectedProjectIdFromPathname(pathname);
  const serverProjectsRef = useLatestRef(projects);

  const [localProjects, setLocalProjects] = useState(projects);
  const [moveError, setMoveError] = useState<string | null>(null);

  const [prevServerProjects, setPrevServerProjects] = useState(projects);
  if (projects !== prevServerProjects) {
    setPrevServerProjects(projects);
    setLocalProjects((current) =>
      mergeServerProjectsWithOptimistic(projects, current),
    );
  }

  const groups = useMemo(
    () => groupProjectsByStatus(localProjects),
    [localProjects],
  );

  const columns = useMemo<KanbanColumn<Project>[]>(
    () =>
      groups.map((group) => ({
        key: group.status,
        label: group.label,
        icon: (
          <ProjectStatusIcon
            status={group.status}
            size={14}
            title={group.label}
          />
        ),
        items: group.projects,
      })),
    [groups],
  );

  const findItemById = useCallback(
    (itemId: string) => localProjects.find((project) => project.id === itemId),
    [localProjects],
  );

  const handleProjectStatusChange = useCallback(
    (projectId: string, nextStatus: ProjectStatus) => {
      setLocalProjects((current) =>
        current.map((project) => {
          if (project.id !== projectId) return project;
          if (migrateLegacyProjectStatus(project.status) === nextStatus) {
            return project;
          }
          return { ...project, status: nextStatus };
        }),
      );
    },
    [],
  );

  const handleProjectPriorityChange = useCallback(
    (projectId: string, priority: TaskPriority) => {
      setLocalProjects((current) =>
        current.map((project) =>
          project.id === projectId ? { ...project, priority } : project,
        ),
      );
    },
    [],
  );

  const handleProjectStartDateChange = useCallback(
    (projectId: string, startDate: Date | null) => {
      setLocalProjects((current) =>
        current.map((project) =>
          project.id === projectId ? { ...project, startDate } : project,
        ),
      );
    },
    [],
  );

  const handleProjectDueDateChange = useCallback(
    (projectId: string, dueDate: Date | null) => {
      setLocalProjects((current) =>
        current.map((project) =>
          project.id === projectId ? { ...project, dueDate } : project,
        ),
      );
    },
    [],
  );

  const handleMoveItem = useCallback(
    (request: {
      itemId: string;
      fromColumnKey: string;
      toColumnKey: string;
      beforeItemId: string | null;
    }) => {
      const reorderRequest = {
        projectId: request.itemId,
        fromStatus: request.fromColumnKey as ProjectStatus,
        toStatus: request.toColumnKey as ProjectStatus,
        beforeProjectId: request.beforeItemId,
      };

      setLocalProjects((current) =>
        applyOptimisticProjectReorder(current, reorderRequest),
      );
      setMoveError(null);

      void reorderProjectAction({
        projectId: request.itemId,
        toStatus: reorderRequest.toStatus,
        beforeProjectId: request.beforeItemId,
      }).then((result) => {
        if (!result.ok) {
          setLocalProjects(serverProjectsRef.current);
          setMoveError(result.error ?? "Failed to move project");
        }
      });
    },
    [serverProjectsRef],
  );

  return (
    <KanbanBoard
      columns={columns}
      getItemId={(project) => project.id}
      getItemColumnKey={(project) => migrateLegacyProjectStatus(project.status)}
      compareItems={compareProjectsForBoard}
      renderCard={({
        item,
        dragging,
        keyboardHighlighted,
        onOpen,
        onPointerDragStart,
      }) => (
        <ProjectBoardCard
          project={item}
          taskProgress={taskProgressByProjectId[item.id] ?? EMPTY_TASK_PROGRESS}
          dragging={dragging}
          keyboardHighlighted={keyboardHighlighted}
          onStatusChange={(status) => handleProjectStatusChange(item.id, status)}
          onPriorityChange={(priority) =>
            handleProjectPriorityChange(item.id, priority)
          }
          onStartDateChange={(startDate) =>
            handleProjectStartDateChange(item.id, startDate)
          }
          onDueDateChange={(dueDate) =>
            handleProjectDueDateChange(item.id, dueDate)
          }
          onOpen={() => onOpen()}
          onPointerDragStart={(_project, event) => onPointerDragStart(event)}
        />
      )}
      renderDragPreview={(item) => (
        <ProjectBoardCard
          project={item}
          taskProgress={taskProgressByProjectId[item.id] ?? EMPTY_TASK_PROGRESS}
          dragging={false}
          onOpen={() => {}}
          onPointerDragStart={() => {}}
        />
      )}
      onMoveItem={handleMoveItem}
      onNavigate={(projectId) => {
        const project = findItemById(projectId);
        router.push(
          project
            ? getProjectHref
              ? getProjectHref(project.key)
              : getProjectHrefFromKey(project.key)
            : `/projects/${projectId}`,
        );
      }}
      selectedItemId={selectedProjectId}
      ariaLabel="Project board by status"
      moveError={moveError}
      findItemById={findItemById}
    />
  );
}
