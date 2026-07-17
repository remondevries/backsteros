"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { reorderTaskAction } from "@/lib/mutations/tasks";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "@/components/shortcuts/list-keyboard-navigation-provider";
import { useLatestRef } from "@/hooks/use-latest-ref";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "@/lib/shortcuts/list-keyboard-nav-zone";
import { TaskStatusIcon } from "@/components/task-status";
import type { AssignableContact } from "@/lib/contacts/assignable-contact";
import type { Task } from "@/lib/db/schema";
import {
  migrateLegacyTaskStatus,
  type TaskStatus,
} from "@/lib/task-status";
import { groupTasksByStatus } from "@/lib/tasks/group-tasks-by-status";
import { mergeServerTasksWithOptimistic } from "@/lib/tasks/merge-optimistic-tasks";
import { applyOptimisticTaskReorder } from "@/lib/tasks/task-reorder-client";
import type { LocalCreatedTaskSnapshot } from "@/lib/sync/local-created-task-snapshot";
import {
  getSelectedTaskSlugFromPathname,
  isTaskSlugSelected,
} from "@/lib/task-navigation-path";
import {
  getProjectRouteScopeFromPathname,
  getScopedProjectTaskHref,
} from "@/lib/project-route-scope";
import { flattenGroupedListItemIds } from "@/lib/shortcuts/list-keyboard-nav-index";

import { AddTaskInline } from "./add-task-inline";
import type { TaskReorderRequest } from "./task-list-drag";
import { TaskRow } from "./task-row";
import { TaskStatusGroupSection } from "./task-status-group-section";

type ProjectTasksListProps = {
  projectId: string;
  projectKey: string;
  tasks: Task[];
  contacts: AssignableContact[];
  defaultAssigneeId: string | null;
};

const TASK_ROW_MOVE_ANIMATION_MS = 220;

function buildOptimisticProjectTask(
  snapshot: LocalCreatedTaskSnapshot,
  projectId: string,
): Task {
  const updatedAt = new Date(snapshot.updatedAt);

  return {
    id: snapshot.taskId,
    projectId,
    contactId: null,
    assigneeId: null,
    number: snapshot.taskNumber,
    title: snapshot.title,
    description: null,
    status: snapshot.status,
    priority: 0 as Task["priority"],
    sortOrder: snapshot.sortOrder,
    dueDate: snapshot.dueDate != null ? new Date(snapshot.dueDate) : null,
    triagedAt: null,
    inbox: false,
    completedAt: null,
    createdAt: updatedAt,
    updatedAt,
    deletedAt: null,
  };
}

export function ProjectTasksList({
  projectId,
  projectKey,
  tasks,
  contacts,
  defaultAssigneeId,
}: ProjectTasksListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );
  const serverTasksRef = useLatestRef(tasks);
  const moveAnimationTimeoutsRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const [localTasks, setLocalTasks] = useState(tasks);
  const [recentlyMovedTaskIds, setRecentlyMovedTaskIds] = useState(
    () => new Set<string>(),
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<TaskStatus>>(
    () => new Set(),
  );
  const [addingToStatus, setAddingToStatus] = useState<TaskStatus | null>(null);
  const [dragInsertBeforeKey, setDragInsertBeforeKey] = useState<string | null>(
    null,
  );
  const selectedTaskSlug = getSelectedTaskSlugFromPathname(pathname);
  const selectedTaskId =
    localTasks.find((task) =>
      isTaskSlugSelected(task, selectedTaskSlug, projectKey),
    )?.id ?? null;
  const projectTaskScope = getProjectRouteScopeFromPathname(pathname);

  function navigateToTask(taskNumber: number) {
    const href = getScopedProjectTaskHref(
      projectKey,
      taskNumber,
      projectTaskScope,
    );

    router.push(href);
  }

  const [prevProjectId, setPrevProjectId] = useState(projectId);
  const [prevServerTasks, setPrevServerTasks] = useState(tasks);
  if (projectId !== prevProjectId) {
    setPrevProjectId(projectId);
    setPrevServerTasks(tasks);
    setLocalTasks(tasks);
    setCollapsedGroups(new Set());
    setRecentlyMovedTaskIds(new Set());
  } else if (tasks !== prevServerTasks) {
    setPrevServerTasks(tasks);
    setLocalTasks((current) => mergeServerTasksWithOptimistic(tasks, current));
  }

  useEffect(() => {
    const timeoutsRef = moveAnimationTimeoutsRef;
    return () => {
      for (const timeoutId of timeoutsRef.current.values()) {
        clearTimeout(timeoutId);
      }
      timeoutsRef.current.clear();
    };
  }, []);

  const groups = useMemo(
    () => groupTasksByStatus(localTasks),
    [localTasks],
  );

  const itemIds = useMemo(
    () =>
      flattenGroupedListItemIds(
        groups.map((group) => ({ key: group.status, items: group.tasks })),
        collapsedGroups,
        (task) => task.id,
      ),
    [collapsedGroups, groups],
  );

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId: selectedTaskId,
    onNavigate: (taskId) => {
      const task = localTasks.find((item) => item.id === taskId);
      if (task) {
        navigateToTask(task.number);
      }
    },
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: itemIds.length > 0,
  });

  const markTaskMoved = useCallback((taskId: string) => {
    setRecentlyMovedTaskIds((current) => {
      const next = new Set(current);
      next.add(taskId);
      return next;
    });

    const existingTimeout = moveAnimationTimeoutsRef.current.get(taskId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeoutId = setTimeout(() => {
      setRecentlyMovedTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
      moveAnimationTimeoutsRef.current.delete(taskId);
    }, TASK_ROW_MOVE_ANIMATION_MS);

    moveAnimationTimeoutsRef.current.set(taskId, timeoutId);
  }, []);

  const handleTaskStatusChange = useCallback(
    (taskId: string, nextStatus: TaskStatus) => {
      let didMove = false;

      setLocalTasks((current) =>
        current.map((task) => {
          if (task.id !== taskId) return task;
          if (migrateLegacyTaskStatus(task.status) === nextStatus) return task;
          didMove = true;
          return { ...task, status: nextStatus };
        }),
      );

      if (!didMove) return;

      markTaskMoved(taskId);
      setCollapsedGroups((current) => {
        const next = new Set(current);
        next.delete(nextStatus);
        return next;
      });
    },
    [markTaskMoved],
  );

  const handleDragInsertBeforeKey = useCallback((orderKey: string | null) => {
    setDragInsertBeforeKey((current) =>
      current === orderKey ? current : orderKey,
    );
  }, []);

  const handleTaskDragStart = useCallback(() => {
    // Drag state is tracked via dragInsertBeforeKey during dragover.
  }, []);

  const handleTaskDragEnd = useCallback(() => {
    setDragInsertBeforeKey(null);
  }, []);

  const handleReorderTask = useCallback(
    (request: TaskReorderRequest) => {
      handleTaskDragEnd();
      setLocalTasks((current) => applyOptimisticTaskReorder(current, request));

      const statusChanged = request.fromStatus !== request.toStatus;
      if (statusChanged) {
        markTaskMoved(request.taskId);
        setCollapsedGroups((current) => {
          const next = new Set(current);
          next.delete(request.toStatus);
          return next;
        });
      }

      void reorderTaskAction({
        projectId,
        taskId: request.taskId,
        toStatus: request.toStatus,
        beforeTaskId: request.beforeTaskId,
      }).then((result) => {
        if (!result.ok) {
          setLocalTasks(serverTasksRef.current);
        }
      });
    },
    [handleTaskDragEnd, markTaskMoved, projectId, serverTasksRef],
  );

  function toggleGroup(status: TaskStatus) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }

  function expandGroup(status: TaskStatus) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      next.delete(status);
      return next;
    });
  }

  function startAdding(status: TaskStatus) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      next.delete(status);
      return next;
    });
    setAddingToStatus(status);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul
        ref={listRef}
        className="flex flex-col gap-1"
        role="list"
        {...listContainerProps}
      >
        {groups.map((group) => {
          const collapsed = collapsedGroups.has(group.status);
          const isAdding = addingToStatus === group.status;

          return (
            <TaskStatusGroupSection
              key={group.status}
              groupKey={group.status}
              title={group.label}
              icon={
                <TaskStatusIcon
                  status={group.status}
                  size={14}
                  title={group.label}
                />
              }
              collapsed={collapsed}
              onToggle={() => toggleGroup(group.status)}
              onAddTask={() => startAdding(group.status)}
              dragInsertBeforeKey={dragInsertBeforeKey}
              onDragInsertBeforeKey={handleDragInsertBeforeKey}
              onTaskDragEnd={handleTaskDragEnd}
              onReorderTask={handleReorderTask}
              onExpandGroup={() => expandGroup(group.status)}
            >
              {group.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  projectId={projectId}
                  projectKey={projectKey}
                  recentlyMoved={recentlyMovedTaskIds.has(task.id)}
                  dragInsertBeforeKey={dragInsertBeforeKey}
                  onDragInsertBeforeKey={handleDragInsertBeforeKey}
                  onTaskDragStart={handleTaskDragStart}
                  onTaskDragEnd={handleTaskDragEnd}
                  keyboardHighlighted={highlightedId === task.id}
                  onReorderTask={handleReorderTask}
                  onStatusChange={(status) =>
                    handleTaskStatusChange(task.id, status)
                  }
                  onClick={() => navigateToTask(task.number)}
                />
              ))}
              {isAdding ? (
                <li className="list-none">
                  <AddTaskInline
                    projectId={projectId}
                    status={group.status}
                    contacts={contacts}
                    defaultAssigneeId={defaultAssigneeId}
                    onCancel={() => setAddingToStatus(null)}
                    onCreated={(snapshot) => {
                      setLocalTasks((current) => {
                        if (current.some((task) => task.id === snapshot.taskId)) {
                          return current;
                        }

                        return [
                          ...current,
                          buildOptimisticProjectTask(snapshot, projectId),
                        ];
                      });
                      setAddingToStatus(null);
                    }}
                  />
                </li>
              ) : null}
            </TaskStatusGroupSection>
          );
        })}
      </ul>
    </div>
  );
}
