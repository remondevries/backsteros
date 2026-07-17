"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { reorderTaskAction } from "@/lib/mutations/tasks";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "@/components/shortcuts/list-keyboard-navigation-provider";
import { useLatestRef } from "@/hooks/use-latest-ref";
import { useAppTimezone } from "@/components/settings/app-timezone-provider";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "@/lib/shortcuts/list-keyboard-nav-zone";

import { TaskStatusIcon } from "@/components/task-status";
import type { TaskReorderRequest } from "@/components/tasks/task-list-drag";
import { TaskRow } from "@/components/tasks/task-row";
import { TaskStatusGroupSection } from "@/components/tasks/task-status-group-section";
import type { AssignableProject } from "@/components/tasks/task-project-field";
import type { AssignableContact } from "@/lib/contacts/assignable-contact";
import type { TaskWithContextSummary } from "@/lib/db/queries/tasks";
import { INBOX_TASK_KEY } from "@/lib/task-display-id";
import { getDueTaskHrefFromSummary } from "@/lib/task-navigation-context";
import {
  getSelectedTaskSlugFromPathname,
  isTaskSlugSelected,
} from "@/lib/task-navigation-path";
import {
  migrateLegacyTaskStatus,
  type TaskStatus,
} from "@/lib/task-status";
import { groupTasksByStatus } from "@/lib/tasks/group-tasks-by-status";
import { buildOptimisticTaskWithContextSummary } from "@/lib/tasks/build-optimistic-task-summary";
import { mergeServerTasksWithOptimistic } from "@/lib/tasks/merge-optimistic-tasks";
import { applyOptimisticTaskReorder } from "@/lib/tasks/task-reorder-client";
import {
  filterTasksByDueFilter,
  getDefaultDueDateYmdForTasksDueFilter,
  type TasksDueFilter,
} from "@/lib/tasks-due-filters";
import { flattenGroupedListItemIds } from "@/lib/shortcuts/list-keyboard-nav-index";
import { AddInboxTaskInline } from "@/components/inbox/add-inbox-task-inline";

type DueTasksListProps = {
  tasks: TaskWithContextSummary[];
  assignableProjects: AssignableProject[];
  contacts: AssignableContact[];
  defaultAssigneeId: string | null;
  dueFilter: TasksDueFilter;
};

function getDueTaskContextKey(task: TaskWithContextSummary): string {
  return task.project?.key ?? task.contact?.key ?? INBOX_TASK_KEY;
}

function getDueTaskHref(
  task: TaskWithContextSummary,
  dueFilter: TasksDueFilter,
): string {
  return getDueTaskHrefFromSummary({
    number: task.number,
    status: task.status,
    project: task.project,
    contact: task.contact,
    dueFilter,
  });
}

const TASK_ROW_MOVE_ANIMATION_MS = 220;

function getDueTaskReorderProjectId(task: TaskWithContextSummary): string | null {
  return task.projectId;
}

function applyOptimisticDueTaskReorder(
  tasks: TaskWithContextSummary[],
  request: TaskReorderRequest,
): TaskWithContextSummary[] {
  const reordered = applyOptimisticTaskReorder(tasks, request);
  const contextById = new Map(tasks.map((task) => [task.id, task]));

  return reordered.map((task) => {
    const context = contextById.get(task.id);
    if (!context) {
      return task as TaskWithContextSummary;
    }

    return {
      ...context,
      status: task.status,
      sortOrder: task.sortOrder,
    };
  });
}

export function DueTasksList({
  tasks,
  assignableProjects,
  contacts,
  defaultAssigneeId,
  dueFilter,
}: DueTasksListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const calendarTimeZone = useAppTimezone();
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
  const [dragInsertBeforeKey, setDragInsertBeforeKey] = useState<string | null>(
    null,
  );
  const selectedTaskSlug = getSelectedTaskSlugFromPathname(pathname);
  const selectedTaskId =
    localTasks.find((task) =>
      isTaskSlugSelected(task, selectedTaskSlug, getDueTaskContextKey(task)),
    )?.id ?? null;

  const groups = useMemo(
    () => groupTasksByStatus(localTasks),
    [localTasks],
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<TaskStatus>>(
    () => new Set(),
  );
  const [addingToStatus, setAddingToStatus] = useState<TaskStatus | null>(null);

  const [prevDueFilter, setPrevDueFilter] = useState(dueFilter);
  const [prevServerTasks, setPrevServerTasks] = useState(tasks);
  if (dueFilter !== prevDueFilter) {
    setPrevDueFilter(dueFilter);
    setPrevServerTasks(tasks);
    setLocalTasks(tasks);
  } else if (tasks !== prevServerTasks) {
    setPrevServerTasks(tasks);
    setLocalTasks((current) =>
      filterTasksByDueFilter(
        mergeServerTasksWithOptimistic(tasks, current),
        dueFilter,
        new Date(),
        calendarTimeZone,
      ),
    );
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
      const task = localTasks.find((entry) => entry.id === taskId);
      if (!task) {
        return;
      }

      router.push(getDueTaskHref(task, dueFilter));
    },
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: itemIds.length > 0,
  });

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
      const movingTask = localTasks.find((task) => task.id === request.taskId);
      const reorderProjectId = movingTask
        ? getDueTaskReorderProjectId(movingTask)
        : null;
      if (!reorderProjectId) {
        return;
      }

      handleTaskDragEnd();
      setLocalTasks((current) =>
        applyOptimisticDueTaskReorder(current, request),
      );

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
        projectId: reorderProjectId,
        taskId: request.taskId,
        toStatus: request.toStatus,
        beforeTaskId: request.beforeTaskId,
      }).then((result) => {
        if (!result.ok) {
          setLocalTasks(serverTasksRef.current);
        }
      });
    },
    [handleTaskDragEnd, localTasks, markTaskMoved, serverTasksRef],
  );

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
            {group.tasks.map((task) => {
              const reorderProjectId = getDueTaskReorderProjectId(task);

              return (
                <TaskRow
                  key={task.id}
                  task={task}
                  projectId={reorderProjectId ?? undefined}
                  projectKey={task.project?.key}
                  projectName={task.project?.name}
                  projectIcon={task.project?.icon}
                  recentlyMoved={recentlyMovedTaskIds.has(task.id)}
                  dragInsertBeforeKey={dragInsertBeforeKey}
                  onDragInsertBeforeKey={handleDragInsertBeforeKey}
                  onTaskDragStart={handleTaskDragStart}
                  onTaskDragEnd={handleTaskDragEnd}
                  keyboardHighlighted={highlightedId === task.id}
                  assignableProjects={assignableProjects}
                  onReorderTask={handleReorderTask}
                  onStatusChange={(status) =>
                    handleTaskStatusChange(task.id, status)
                  }
                  onClick={() => router.push(getDueTaskHref(task, dueFilter))}
                />
              );
            })}
            {isAdding ? (
              <li className="list-none">
                <AddInboxTaskInline
                  contacts={contacts}
                  defaultAssigneeId={defaultAssigneeId}
                  dueDate={getDefaultDueDateYmdForTasksDueFilter(dueFilter)}
                  status={group.status}
                  onCancel={() => setAddingToStatus(null)}
                  onCreated={(snapshot) => {
                    setLocalTasks((current) => {
                      if (current.some((task) => task.id === snapshot.taskId)) {
                        return current;
                      }

                      return [
                        ...current,
                        buildOptimisticTaskWithContextSummary(snapshot),
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

export { getDueTaskHref };
