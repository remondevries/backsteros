"use client";

import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  type TaskStatus,
} from "@/lib/task-status";

import { TaskStatusIcon } from "./task-status-icon";

type TaskStatusBadgeProps = {
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
        "inline-flex shrink-0 items-center gap-1.5 text-xs text-foreground/60"
      }
    >
      <TaskStatusIcon status={normalized} title={label} size={size} />
      {showLabel ? <span>{label}</span> : null}
    </span>
  );
}
