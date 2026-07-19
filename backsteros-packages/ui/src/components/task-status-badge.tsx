"use client";

import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  type TaskStatus,
} from "../task-status.js";
import { TaskStatusIcon } from "./task-status-icon.js";

export type TaskStatusBadgeProps = {
  status: TaskStatus | string;
  showLabel?: boolean;
  size?: number;
  className?: string;
};

export function TaskStatusBadge({
  status,
  showLabel = true,
  size = 14,
  className,
}: TaskStatusBadgeProps) {
  const normalized = migrateLegacyTaskStatus(status);
  const label = getTaskStatusLabel(normalized);

  return (
    <span
      className={
        className ??
        "bos-task-status-badge"
      }
    >
      <TaskStatusIcon status={normalized} title={label} size={size} />
      {showLabel ? <span>{label}</span> : null}
    </span>
  );
}
