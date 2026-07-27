"use client";

import {
  getTaskDisplayId,
  type TaskDisplayIdSource,
} from "../task-display-id.js";
import {
  getTaskPriorityLabel,
  type TaskPriority,
} from "../task-priority.js";
import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  type TaskStatus,
} from "../task-status.js";
import { TaskStatusIcon } from "./task-status-icon.js";

export type TaskListItemTask = TaskDisplayIdSource & {
  id: string;
  title: string;
  status: TaskStatus | string;
  priority?: number;
  projectName?: string | null;
};

export type TaskListItemProps = {
  task: TaskListItemTask;
  projectKey?: string | null;
  onSelect?: (taskId: string) => void;
  className?: string;
};

export function TaskListItem({
  task,
  projectKey,
  onSelect,
  className,
}: TaskListItemProps) {
  const status = migrateLegacyTaskStatus(task.status);
  const displayId = getTaskDisplayId(task, projectKey);
  const priorityLabel =
    task.priority !== undefined && task.priority > 0
      ? getTaskPriorityLabel(task.priority as TaskPriority)
      : null;

  return (
    <button
      type="button"
      className={["bos-task-list-item", className].filter(Boolean).join(" ")}
      onClick={() => onSelect?.(task.id)}
    >
      <span className="bos-task-list-item__status" aria-hidden>
        <TaskStatusIcon status={status} size={14} />
      </span>
      <span className="bos-task-list-item__body">
        <span className="bos-task-list-item__title">{task.title}</span>
        <span className="bos-task-list-item__meta">
          {displayId ? (
            <span className="bos-task-list-item__id">{displayId}</span>
          ) : null}
          <span className="bos-task-list-item__status-label">
            {getTaskStatusLabel(status)}
          </span>
          {task.projectName ? (
            <span className="bos-task-list-item__project">{task.projectName}</span>
          ) : null}
          {priorityLabel ? (
            <span className="bos-task-list-item__priority">{priorityLabel}</span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
