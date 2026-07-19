import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "./task-status.js";

export type TaskLikeForGrouping = {
  status: string;
  sortOrder?: number;
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
    tasks: (buckets.get(status) ?? []).sort(
      (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
    ),
  }));

  if (options?.includeEmpty) {
    return groups;
  }

  return groups.filter((group) => group.tasks.length > 0);
}
