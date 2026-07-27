"use client";

import { useMemo, useTransition, type DragEvent } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  TaskItemRow,
  buildProjectDropdownOptions,
  type TaskItemRowTask,
  type TaskStatus as SharedTaskStatus,
} from "@backsteros/ui";

import type { Task } from "@/lib/db/schema";
import {
  navigateInboxAfterStatusChange,
  notifyInboxStatusChange,
  shouldNotifyInboxStatusChange,
} from "@/lib/inbox/inbox-status-change-notification";
import {
  moveTaskToProjectAction,
  updateTaskDueDateAction,
  updateTaskPriorityAction,
  updateTaskStatusAction,
} from "@/lib/mutations/tasks";
import type { AssignableProject } from "@/lib/projects/assignable-project";
import { formatDueDateInputValue } from "@/lib/task-due-date";
import {
  moveLocalTaskToProject,
  updateLocalTaskDueDate,
  updateLocalTaskPriority,
  updateLocalTaskStatus,
} from "@/lib/sync/local-task-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";
import { isTaskPriority, type TaskPriority } from "@/lib/task-priority";
import { migrateLegacyTaskStatus, type TaskStatus } from "@/lib/task-status";
import { applyDesktopDragImage } from "@/lib/platform/desktop-drag-image";

import {
  createTaskDragPayload,
  isTaskListDragActive,
  readTaskDragPayload,
  resolveTaskDropBeforeTask,
  TASK_LIST_DRAG_TYPE,
  taskOrderKey,
  type TaskDragPayload,
  type TaskReorderRequest,
} from "./task-list-drag";

export type { AssignableProject };

type TaskRowProps = {
  task: Task;
  projectId?: string;
  onClick?: () => void;
  onStatusChange?: (status: TaskStatus) => void;
  projectName?: string;
  projectIcon?: string | null;
  projectKey?: string;
  recentlyMoved?: boolean;
  showDueMeta?: boolean;
  dragInsertBeforeKey?: string | null;
  onDragInsertBeforeKey?: (orderKey: string | null) => void;
  onTaskDragStart?: (payload: TaskDragPayload) => void;
  onTaskDragEnd?: () => void;
  onReorderTask?: (request: TaskReorderRequest) => void;
  keyboardHighlighted?: boolean;
  assignableProjects?: AssignableProject[];
};

function toOverviewTask(
  task: Task,
  projectKey?: string | null,
  projectName?: string | null,
): TaskItemRowTask {
  return {
    id: task.id,
    number: task.number,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate ? task.dueDate.getTime() : null,
    projectId: task.projectId,
    projectKey: projectKey ?? null,
    projectName: projectName ?? null,
    contactId: task.contactId,
    assigneeId: task.assigneeId,
    sortOrder: task.sortOrder,
  };
}

/**
 * Web adapter over shared `@backsteros/ui` task rows — keeps Next persist /
 * inbox / drag wiring while the visual layout stays in sync with desktop.
 */
export function TaskRow({
  task,
  projectId,
  onClick,
  onStatusChange,
  projectName,
  projectKey,
  recentlyMoved = false,
  showDueMeta = true,
  dragInsertBeforeKey,
  onDragInsertBeforeKey,
  onTaskDragStart,
  onTaskDragEnd,
  onReorderTask,
  keyboardHighlighted = false,
  assignableProjects = [],
}: TaskRowProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const dragEnabled = Boolean(onReorderTask && projectId);
  const orderKey = taskOrderKey(task.id);
  const showInsertIndicator = dragInsertBeforeKey === orderKey;

  const overviewTask = useMemo(
    () => toOverviewTask(task, projectKey, projectName),
    [projectKey, projectName, task],
  );

  const projectOptions = useMemo(
    () =>
      buildProjectDropdownOptions(
        assignableProjects.map((project) => ({
          key: project.key,
          name: project.name,
          icon: project.icon,
        })),
      ),
    [assignableProjects],
  );

  function handleStatusChange(_taskId: string, nextStatus: SharedTaskStatus) {
    const status = migrateLegacyTaskStatus(nextStatus);
    onStatusChange?.(status);

    startTransition(async () => {
      const result = await runEntityPersist(
        () =>
          updateLocalTaskStatus({
            taskId: task.id,
            projectId: task.projectId,
            status,
          }),
        () =>
          updateTaskStatusAction({
            taskId: task.id,
            projectId: task.projectId,
            status,
          }),
      );

      if (!result.ok) {
        onStatusChange?.(migrateLegacyTaskStatus(task.status));
        return;
      }

      if (
        pathname.startsWith("/inbox") &&
        shouldNotifyInboxStatusChange(status) &&
        result.taskNumber != null
      ) {
        notifyInboxStatusChange(
          {
            kind: "task",
            title: result.title,
            status,
            taskNumber: result.taskNumber,
            projectKey: result.projectKey,
            projectName: result.projectName,
            contactKey: result.contactKey,
          },
          router,
        );
        navigateInboxAfterStatusChange(router);
      }
    });
  }

  function handlePriorityChange(_taskId: string, priority: number) {
    if (!isTaskPriority(priority)) return;
    const nextPriority = priority as TaskPriority;

    startTransition(async () => {
      await runEntityPersist(
        () =>
          updateLocalTaskPriority({
            taskId: task.id,
            projectId: task.projectId,
            priority: nextPriority,
          }),
        () =>
          updateTaskPriorityAction({
            taskId: task.id,
            projectId: task.projectId,
            priority: nextPriority,
          }),
      );
    });
  }

  function handleDueDateChange(_taskId: string, dueDate: Date | null) {
    const dueDateYmd = formatDueDateInputValue(dueDate) || null;

    startTransition(async () => {
      await runEntityPersist(
        () =>
          updateLocalTaskDueDate({
            taskId: task.id,
            projectId: task.projectId,
            dueDate: dueDateYmd,
          }),
        () =>
          updateTaskDueDateAction({
            taskId: task.id,
            projectId: task.projectId,
            dueDate: dueDateYmd,
          }),
      );
    });
  }

  function handleProjectChange(_taskId: string, nextProjectKey: string | null) {
    if (assignableProjects.length === 0) return;

    const nextProjectId = nextProjectKey
      ? (assignableProjects.find((project) => project.key === nextProjectKey)
          ?.id ?? null)
      : null;

    if (nextProjectId === task.projectId) return;

    startTransition(async () => {
      const result = await runEntityPersist(
        () =>
          moveLocalTaskToProject({
            taskId: task.id,
            projectId: nextProjectId,
          }),
        () =>
          moveTaskToProjectAction({
            taskId: task.id,
            projectId: nextProjectId,
          }),
      );

      if (result.ok) {
        router.refresh();
      }
    });
  }

  const sharedProps = {
    task: overviewTask,
    keyboardHighlighted,
    onSelect: onClick ? () => onClick() : undefined,
    showDueMeta,
    showProject: assignableProjects.length > 0 || Boolean(projectName),
    className: recentlyMoved ? "task-row-enter" : undefined,
    onStatusChange: handleStatusChange,
    onPriorityChange: handlePriorityChange,
    onDueDateChange: handleDueDateChange,
    onProjectChange:
      assignableProjects.length > 0 ? handleProjectChange : undefined,
    projectOptions: assignableProjects.length > 0 ? projectOptions : undefined,
  };

  return (
    <TaskItemRow
      {...sharedProps}
      showAssignee={false}
      draggable={dragEnabled && Boolean(projectId)}
      showDragInsertBefore={showInsertIndicator}
      onDragStart={
        dragEnabled && projectId
          ? (event: DragEvent<HTMLDivElement>) => {
              event.dataTransfer.setData(
                TASK_LIST_DRAG_TYPE,
                createTaskDragPayload(task, projectId),
              );
              event.dataTransfer.effectAllowed = "move";
              applyDesktopDragImage(event);
              document.body.classList.add("app-is-dragging");
              onTaskDragStart?.({
                taskId: task.id,
                status: migrateLegacyTaskStatus(task.status),
                projectId,
              });
            }
          : undefined
      }
      onDragEnd={
        dragEnabled
          ? () => {
              document.body.classList.remove("app-is-dragging");
              onTaskDragEnd?.();
            }
          : undefined
      }
      onDragOver={
        dragEnabled
          ? (event: DragEvent<HTMLLIElement>) => {
              if (!isTaskListDragActive(event.dataTransfer)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              event.stopPropagation();
              onDragInsertBeforeKey?.(orderKey);
            }
          : undefined
      }
      onDrop={
        dragEnabled
          ? (event: DragEvent<HTMLLIElement>) => {
              event.preventDefault();
              event.stopPropagation();
              onTaskDragEnd?.();

              const payload = readTaskDragPayload(event.dataTransfer);
              if (!payload) return;

              const action = resolveTaskDropBeforeTask({
                payload,
                targetTask: task,
              });
              if (action) {
                onReorderTask?.(action);
              }
            }
          : undefined
      }
    />
  );
}
