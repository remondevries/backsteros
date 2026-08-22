"use client";

import { useSyncExternalStore } from "react";

import {
  formatDueDateInputValue,
  formatTaskDueMetaLabel,
  getTaskDueDateUrgency,
} from "../../tasks/task-due-date.js";
import { getTaskPriorityLabel } from "../../tasks/task-priority.js";
import {
  getPreferredColorSchemeSnapshot,
  subscribeToPreferredColorScheme,
} from "../../tasks/task-status-color.js";
import {
  resolveTaskDueDateUrgencyColor,
  TaskDueDateIcon,
} from "./task-due-date-icon.js";
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
  const colorScheme = useSyncExternalStore(
    subscribeToPreferredColorScheme,
    getPreferredColorSchemeSnapshot,
    () => "dark" as const,
  );
  const lateLabelColor =
    urgency === "overdue"
      ? resolveTaskDueDateUrgencyColor(urgency, colorScheme)
      : undefined;

  return (
    <span className="bos-property-label" title={label}>
      <TaskDueDateIcon active urgency={urgency} />
      <span style={lateLabelColor ? { color: lateLabelColor } : undefined}>
        {label}
      </span>
    </span>
  );
}
