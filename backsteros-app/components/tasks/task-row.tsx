"use client";

import { useEffect, useState } from "react";

import type { Task } from "@/lib/db/schema";
import { getTaskDisplayId } from "@/lib/task-display-id";
import { migrateLegacyTaskStatus, type TaskStatus } from "@/lib/task-status";
import {
  getDisplayProjectIcon,
  ProjectOcticon,
} from "@/components/project-icon";
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
import {
  keyboardNavListItemClass,
  keyboardNavItemProps,
} from "@/lib/shortcuts/keyboard-nav-item";
import { shouldHandleListKeyboardActivate } from "@/lib/shortcuts/should-handle-list-keyboard-navigation";
import { TaskDueDateDropdown } from "./task-due-date-dropdown";
import {
  TaskListDueDateLabel,
  TaskListPriorityLabel,
} from "./task-list-property-label";
import { TaskPriorityDropdown } from "./task-priority-dropdown";
import { TaskProjectField, type AssignableProject } from "./task-project-field";
import { useIsMobileUi } from "@/hooks/use-circle-platform";
import { applyDesktopDragImage } from "@/lib/platform/desktop-drag-image";
import { TaskStatusDropdown } from "./task-status-dropdown";

function stopFieldEvent(event: React.MouseEvent) {
  event.stopPropagation();
}

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

export function TaskRow({
  task,
  projectId,
  onClick,
  onStatusChange,
  projectName,
  projectIcon,
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
  const isMobileUi = useIsMobileUi();
  const [isDragging, setIsDragging] = useState(false);
  const displayId = getTaskDisplayId(task, projectKey);
  const orderKey = taskOrderKey(task.id);
  const showInsertIndicator = dragInsertBeforeKey === orderKey;
  const dragEnabled = Boolean(onReorderTask && projectId);
  const hasMobileProjectMeta = Boolean(task.projectId || projectName);
  const hasMobileDueMeta = Boolean(showDueMeta && task.dueDate);

  useEffect(() => {
    if (!isDragging) return;

    document.body.classList.add("app-is-dragging");
    return () => document.body.classList.remove("app-is-dragging");
  }, [isDragging]);

  function handleDragStart(event: React.DragEvent) {
    if (!projectId) {
      return;
    }

    event.dataTransfer.setData(
      TASK_LIST_DRAG_TYPE,
      createTaskDragPayload(task, projectId),
    );
    event.dataTransfer.effectAllowed = "move";
    applyDesktopDragImage(event);
    setIsDragging(true);
    onTaskDragStart?.({
      taskId: task.id,
      status: migrateLegacyTaskStatus(task.status),
      projectId,
    });
  }

  function handleDragEnd() {
    setIsDragging(false);
    onTaskDragEnd?.();
  }

  function handleDragOver(event: React.DragEvent) {
    if (!dragEnabled || !isTaskListDragActive(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    event.stopPropagation();
    onDragInsertBeforeKey?.(orderKey);
  }

  function handleDrop(event: React.DragEvent) {
    if (!dragEnabled) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onTaskDragEnd?.();

    const payload = readTaskDragPayload(event.dataTransfer);
    if (!payload) {
      return;
    }

    const action = resolveTaskDropBeforeTask({ payload, targetTask: task });
    if (action) {
      onReorderTask?.(action);
    }
  }

  return (
    <li
      className={`list-none ${showInsertIndicator ? "border-t border-[#ee7a47]/50" : ""}`}
      {...(onClick ? keyboardNavItemProps(task.id) : {})}
      onDragOver={dragEnabled ? handleDragOver : undefined}
      onDrop={dragEnabled ? handleDrop : undefined}
    >
      <div
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        data-tauri-drag-region="false"
        draggable={dragEnabled}
        onDragStart={dragEnabled ? handleDragStart : undefined}
        onDragEnd={dragEnabled ? handleDragEnd : undefined}
        onClick={(event) => {
          if (event.defaultPrevented) return;
          onClick?.();
        }}
        onKeyDown={
          onClick
            ? (event) => {
                if (shouldHandleListKeyboardActivate(event.nativeEvent)) {
                  event.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
        className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2.5 text-left text-sm text-foreground hover:bg-white/[0.03] ${
          isDragging ? "cursor-grabbing" : "cursor-pointer"
        } ${recentlyMoved ? "task-row-enter" : ""} ${keyboardNavListItemClass(keyboardHighlighted)}`}
      >
        {isMobileUi ? (
          <div className="task-row__content min-w-0 flex-1">
            <div className="task-row__main min-w-0">
              <span
                className="task-row__status inline-flex shrink-0"
                onMouseDown={stopFieldEvent}
                onClick={stopFieldEvent}
              >
                <TaskStatusDropdown
                  taskId={task.id}
                  projectId={task.projectId}
                  status={task.status}
                  variant="icon"
                  onStatusChange={onStatusChange}
                />
              </span>

              <span className="task-row__title min-w-0 flex-1 basis-0 truncate text-sm font-medium leading-[18px]">
                {task.title}
              </span>
            </div>

            <div className="task-row__meta min-w-0">
              <span className="task-row__priority inline-flex shrink-0">
                <TaskListPriorityLabel priority={task.priority} />
              </span>

              {hasMobileDueMeta ? (
                <span className="task-row__due inline-flex shrink-0">
                  <TaskListDueDateLabel
                    dueDate={task.dueDate!}
                    status={task.status}
                  />
                </span>
              ) : null}

              {hasMobileProjectMeta ? (
                assignableProjects.length > 0 && task.projectId ? (
                  <span
                    className="task-row__project inline-flex max-w-full min-w-0"
                    onMouseDown={stopFieldEvent}
                    onClick={stopFieldEvent}
                  >
                    <TaskProjectField
                      variant="list"
                      taskId={task.id}
                      projectId={task.projectId}
                      status={task.status}
                      projects={assignableProjects}
                    />
                  </span>
                ) : projectName ? (
                  <span className="task-row__project inline-flex max-w-full min-w-0 items-center gap-1 text-xs leading-none">
                    <ProjectOcticon
                      icon={getDisplayProjectIcon(projectIcon)}
                      size={12}
                      className="shrink-0 text-foreground/70"
                    />
                    <span className="truncate">{projectName}</span>
                  </span>
                ) : null
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <span
              className="inline-flex shrink-0"
              onMouseDown={stopFieldEvent}
              onClick={stopFieldEvent}
            >
              <TaskPriorityDropdown
                taskId={task.id}
                projectId={task.projectId}
                priority={task.priority}
                variant="icon"
              />
            </span>

            {displayId ? (
              <span className="shrink-0 font-mono text-xs tabular-nums text-foreground/45">
                {displayId}
              </span>
            ) : null}

            <span
              className="inline-flex shrink-0"
              onMouseDown={stopFieldEvent}
              onClick={stopFieldEvent}
            >
              <TaskStatusDropdown
                taskId={task.id}
                projectId={task.projectId}
                status={task.status}
                variant="icon"
                onStatusChange={onStatusChange}
              />
            </span>

            <span className="min-w-0 flex-1 truncate text-sm font-medium leading-[18px]">
              {task.title}
            </span>

            {assignableProjects.length > 0 ? (
              <span
                className="inline-flex max-w-[8rem] shrink-0"
                onMouseDown={stopFieldEvent}
                onClick={stopFieldEvent}
              >
                <TaskProjectField
                  variant="list"
                  taskId={task.id}
                  projectId={task.projectId}
                  status={task.status}
                  projects={assignableProjects}
                />
              </span>
            ) : projectName ? (
              <span className="inline-flex max-w-[8rem] shrink-0 items-center gap-1 text-xs leading-none text-foreground/50">
                <ProjectOcticon
                  icon={getDisplayProjectIcon(projectIcon)}
                  size={12}
                  className="shrink-0 text-foreground/70"
                />
                <span className="truncate">{projectName}</span>
              </span>
            ) : null}

            {showDueMeta ? (
              <span
                className="inline-flex shrink-0"
                onMouseDown={stopFieldEvent}
                onClick={stopFieldEvent}
              >
                <TaskDueDateDropdown
                  taskId={task.id}
                  projectId={task.projectId}
                  dueDate={task.dueDate}
                  status={task.status}
                  variant="list"
                />
              </span>
            ) : null}
          </>
        )}
      </div>
    </li>
  );
}
