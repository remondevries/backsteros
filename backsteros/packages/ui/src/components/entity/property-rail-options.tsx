import type { ReactNode } from "react";

import { getTaskPriorityLabel, TASK_PRIORITY_ORDER } from "../../tasks/task-priority.js";
import {
  getTaskStatusLabel,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../../tasks/task-status.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { TaskPriorityIcon } from "../tasks/task-priority-icon.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";

/** Shared Date coercion for property rails (due dates, etc.). */
export function toPropertyDate(
  value: number | Date | string | null | undefined,
): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function buildTaskStatusDropdownOptions(options?: {
  inboxUpdatedAt?: number | Date | string | null;
}): SearchableDropdownOption<TaskStatus>[] {
  return TASK_STATUS_ORDER.map((value) => ({
    value,
    label: getTaskStatusLabel(value),
    searchTerms: `${value.replaceAll("_", " ")} ${getTaskStatusLabel(value)}`,
    icon: (
      <TaskStatusIcon
        status={value}
        size={14}
        inboxUpdatedAt={options?.inboxUpdatedAt}
      />
    ) as ReactNode,
  }));
}

export function buildTaskPriorityDropdownOptions(): SearchableDropdownOption<string>[] {
  return TASK_PRIORITY_ORDER.map((value) => ({
    value: String(value),
    label: getTaskPriorityLabel(value),
    icon: (<TaskPriorityIcon priority={value} size={14} />) as ReactNode,
  }));
}
