import { getTaskDueDateYmd } from "./tasks-due-filters.js";
import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "./task-status.js";

export type TaskLikeForGrouping = {
  status: string;
  sortOrder?: number;
  dueDate?: Date | number | string | null;
  due_date?: Date | number | string | null;
};

export type TaskStatusGroup<T extends TaskLikeForGrouping = TaskLikeForGrouping> =
  {
    status: TaskStatus;
    label: string;
    tasks: T[];
  };

export type GroupTasksByStatusOptions = {
  /** When true, keep empty status groups (due/project tasks pages). Default false. */
  includeEmpty?: boolean;
};

/** Terminal / archive columns — newest due date first for easier find-back. */
const DUE_DATE_SORT_STATUSES = new Set<TaskStatus>([
  "completed",
  "in_review",
  "canceled",
  "duplicated",
]);

function taskDueDateForSort(task: TaskLikeForGrouping): string | null {
  return getTaskDueDateYmd(task.dueDate ?? task.due_date ?? null);
}

function compareTasksInStatusGroup<T extends TaskLikeForGrouping>(
  status: TaskStatus,
  left: T,
  right: T,
): number {
  if (DUE_DATE_SORT_STATUSES.has(status)) {
    const leftYmd = taskDueDateForSort(left);
    const rightYmd = taskDueDateForSort(right);
    if (leftYmd && rightYmd) {
      const byDue = rightYmd.localeCompare(leftYmd);
      if (byDue !== 0) return byDue;
    } else if (leftYmd) {
      return -1;
    } else if (rightYmd) {
      return 1;
    }
  }

  return (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
}

export function groupTasksByStatus<T extends TaskLikeForGrouping>(
  tasks: readonly T[],
  options?: GroupTasksByStatusOptions,
): TaskStatusGroup<T>[] {
  const buckets = new Map<TaskStatus, T[]>();
  for (const status of TASK_STATUS_ORDER) {
    buckets.set(status, []);
  }

  for (const task of tasks) {
    const status = migrateLegacyTaskStatus(task.status);
    buckets.get(status)?.push(task);
  }

  const groups = TASK_STATUS_ORDER.map((status) => ({
    status,
    label: getTaskStatusLabel(status),
    tasks: (buckets.get(status) ?? []).sort((left, right) =>
      compareTasksInStatusGroup(status, left, right),
    ),
  }));

  if (options?.includeEmpty) {
    return groups;
  }

  return groups.filter((group) => group.tasks.length > 0);
}
