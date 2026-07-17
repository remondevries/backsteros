"use client";

import { TaskPriorityIcon } from "@/components/task-priority/task-priority-icon";
import {
  formatDueDateInputValue,
  formatTaskDueMetaLabel,
  getTaskDueDateUrgency,
} from "@/lib/task-due-date";
import { getTaskPriorityLabel } from "@/lib/task-priority";

import { TaskDueDateIcon } from "./task-due-date-icon";

export function TaskListPriorityLabel({ priority }: { priority: number }) {
  const label = getTaskPriorityLabel(priority);

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-xs leading-none text-foreground/50"
      title={label}
    >
      <TaskPriorityIcon priority={priority} size={14} />
      <span>{label}</span>
    </span>
  );
}

export function TaskListDueDateLabel({
  dueDate,
  status,
}: {
  dueDate: Date;
  status?: string | null;
}) {
  const ymd = formatDueDateInputValue(dueDate);
  const label = formatTaskDueMetaLabel(ymd) ?? ymd;
  const urgency = getTaskDueDateUrgency(ymd, new Date(), { status });

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-xs leading-none text-foreground/50"
      title={label}
    >
      <TaskDueDateIcon active urgency={urgency} />
      <span>{label}</span>
    </span>
  );
}
