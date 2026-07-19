"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { reorderTaskAction } from "@/lib/mutations/tasks";
import { KanbanBoard, type KanbanColumn } from "@/components/kanban/kanban-board";
import { TaskStatusIcon } from "@/components/task-status";
import { useLatestRef } from "@/hooks/use-latest-ref";
import type { AssignableContact } from "@/lib/contacts/assignable-contact";
import type { Task } from "@/lib/db/schema";
import {
  getSelectedTaskSlugFromPathname,
  isTaskSlugSelected,
} from "@/lib/task-navigation-path";
import {
  getProjectRouteScopeFromPathname,
  getScopedProjectTaskHref,
} from "@/lib/project-route-scope";
import {
  migrateLegacyTaskStatus,
  type TaskStatus,
} from "@/lib/task-status";
import { groupTasksByStatus } from "@/lib/tasks/group-tasks-by-status";
import { mergeServerTasksWithOptimistic } from "@/lib/tasks/merge-optimistic-tasks";
import { applyOptimisticTaskReorder } from "@/lib/tasks/task-reorder-client";
import type { TaskReorderRequest } from "@/lib/tasks/task-list-drag-shared";

import { TaskBoardCard } from "./task-board-card";

type ProjectTasksBoardProps = {
  tasks: Task[];
  contacts: AssignableContact[];
  /** When set, all tasks belong to this project (project tasks page). */
  projectId?: string;
  projectKey?: string;
  /** Per-task resolution for global task lists (Tasks page). */
  getTaskHref?: (task: Task) => string;
  getProjectKey?: (task: Task) => string;
  getReorderProjectId?: (task: Task) => string | null;
};

function resolveProjectKey(
  task: Task,
  projectKey: string | undefined,
  getProjectKey: ((task: Task) => string) | undefined,
): string {
  if (projectKey) {
    return projectKey;
  }

  return getProjectKey?.(task) ?? "";
}

function resolveTaskHref(
  task: Task,
  projectKey: string | undefined,
  getProjectKey: ((task: Task) => string) | undefined,
  getTaskHref: ((task: Task) => string) | undefined,
  pathname: string,
): string {
  if (getTaskHref) {
    return getTaskHref(task);
  }

  const resolvedProjectKey = resolveProjectKey(task, projectKey, getProjectKey);
  return getScopedProjectTaskHref(
    resolvedProjectKey,
    task.number,
    getProjectRouteScopeFromPathname(pathname),
  );
}

function resolveReorderProjectId(
  task: Task,
  projectId: string | undefined,
  getReorderProjectId: ((task: Task) => string | null) | undefined,
): string | null {
  if (projectId) {
    return projectId;
  }

  return getReorderProjectId?.(task) ?? task.projectId ?? null;
}

function compareTasksForBoard(left: Task, right: Task): number {
  return (
    left.sortOrder - right.sortOrder ||
    left.createdAt.getTime() - right.createdAt.getTime()
  );
}

export function ProjectTasksBoard({
  tasks,
  contacts,
  projectId,
  projectKey,
  getTaskHref,
  getProjectKey,
  getReorderProjectId,
}: ProjectTasksBoardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const serverTasksRef = useLatestRef(tasks);

  const [localTasks, setLocalTasks] = useState(tasks);
  const [moveError, setMoveError] = useState<string | null>(null);
  const selectedTaskSlug = getSelectedTaskSlugFromPathname(pathname);
  const selectedTaskId = useMemo(
    () =>
      localTasks.find((task) => {
        const key = resolveProjectKey(task, projectKey, getProjectKey);
        return isTaskSlugSelected(task, selectedTaskSlug, key);
      })?.id ?? null,
    [getProjectKey, localTasks, projectKey, selectedTaskSlug],
  );

  const [prevServerTasks, setPrevServerTasks] = useState(tasks);
  if (tasks !== prevServerTasks) {
    const previousServerTasks = prevServerTasks;
    setPrevServerTasks(tasks);
    setLocalTasks((current) =>
      mergeServerTasksWithOptimistic(tasks, current, previousServerTasks),
    );
  }

  const groups = useMemo(() => groupTasksByStatus(localTasks), [localTasks]);

  const columns = useMemo<KanbanColumn<Task>[]>(
    () =>
      groups.map((group) => ({
        key: group.status,
        label: group.label,
        icon: (
          <TaskStatusIcon status={group.status} size={14} title={group.label} />
        ),
        items: group.tasks,
      })),
    [groups],
  );

  const findItemById = useCallback(
    (itemId: string) => localTasks.find((task) => task.id === itemId),
    [localTasks],
  );

  const handleTaskStatusChange = useCallback(
    (taskId: string, nextStatus: TaskStatus) => {
      setLocalTasks((current) =>
        current.map((task) => {
          if (task.id !== taskId) return task;
          if (migrateLegacyTaskStatus(task.status) === nextStatus) return task;
          return { ...task, status: nextStatus };
        }),
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
      const task = localTasks.find((entry) => entry.id === request.itemId);
      if (!task) {
        return;
      }

      const reorderProjectId = resolveReorderProjectId(
        task,
        projectId,
        getReorderProjectId,
      );
      if (!reorderProjectId) {
        setMoveError("Cannot reorder tasks without a project.");
        return;
      }

      const reorderRequest: TaskReorderRequest = {
        taskId: request.itemId,
        fromStatus: request.fromColumnKey as TaskStatus,
        toStatus: request.toColumnKey as TaskStatus,
        beforeTaskId: request.beforeItemId,
      };

      setLocalTasks((current) => applyOptimisticTaskReorder(current, reorderRequest));
      setMoveError(null);

      void reorderTaskAction({
        projectId: reorderProjectId,
        taskId: request.itemId,
        toStatus: reorderRequest.toStatus,
        beforeTaskId: request.beforeItemId,
      }).then((result) => {
        if (!result.ok) {
          setLocalTasks(serverTasksRef.current);
          setMoveError(result.error ?? "Failed to move task");
        }
      });
    },
    [getReorderProjectId, localTasks, projectId, serverTasksRef],
  );

  return (
    <KanbanBoard
      columns={columns}
      getItemId={(task) => task.id}
      getItemColumnKey={(task) => migrateLegacyTaskStatus(task.status)}
      compareItems={compareTasksForBoard}
      renderCard={({ item, dragging, keyboardHighlighted, onOpen, onPointerDragStart }) => (
        <TaskBoardCard
          task={item}
          projectKey={resolveProjectKey(item, projectKey, getProjectKey)}
          contacts={contacts}
          dragging={dragging}
          keyboardHighlighted={keyboardHighlighted}
          onStatusChange={(status) => handleTaskStatusChange(item.id, status)}
          onOpen={() => onOpen()}
          onPointerDragStart={(_task, event) => onPointerDragStart(event)}
        />
      )}
      renderDragPreview={(item) => (
        <TaskBoardCard
          task={item}
          projectKey={resolveProjectKey(item, projectKey, getProjectKey)}
          contacts={contacts}
          dragging={false}
          onOpen={() => {}}
          onPointerDragStart={() => {}}
        />
      )}
      onMoveItem={handleMoveItem}
      onNavigate={(taskId) => {
        const task = findItemById(taskId);
        if (!task) return;
        router.push(
          resolveTaskHref(task, projectKey, getProjectKey, getTaskHref, pathname),
        );
      }}
      selectedItemId={selectedTaskId}
      ariaLabel="Task board by status"
      moveError={moveError}
      findItemById={findItemById}
    />
  );
}
