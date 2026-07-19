"use client";

import {
  formatDueDateInputValue,
  formatTaskDueMetaLabel,
  getTaskDueDateUrgency,
} from "../task-due-date.js";
import { getTaskPriorityLabel } from "../task-priority.js";
import { TaskDueDateIcon } from "./task-due-date-icon.js";
import { TaskPriorityIcon } from "./task-priority-icon.js";

export function TaskListPriorityLabel({ priority }: { priority: number }) {
  const label = getTaskPriorityLabel(priority);

  return (
    <span className="bos-property-label" title={label}>
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
    <span className="bos-property-label" title={label}>
      <TaskDueDateIcon active urgency={urgency} />
      <span>{label}</span>
    </span>
  );
}
