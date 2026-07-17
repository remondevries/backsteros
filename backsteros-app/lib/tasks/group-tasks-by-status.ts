import type { Task } from "@/lib/db/schema";
import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "@/lib/task-status";

export type TaskStatusGroup<T extends Task = Task> = {
  status: TaskStatus;
  label: string;
  tasks: T[];
};

export function groupTasksByStatus<T extends Task>(tasks: T[]): TaskStatusGroup<T>[] {
  const buckets = new Map<TaskStatus, T[]>();

  for (const status of TASK_STATUS_ORDER) {
    buckets.set(status, []);
  }

  for (const task of tasks) {
    const status = migrateLegacyTaskStatus(task.status);
    buckets.get(status)?.push(task);
  }

  return TASK_STATUS_ORDER.map((status) => ({
    status,
    label: getTaskStatusLabel(status),
    tasks: (buckets.get(status) ?? []).sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.createdAt.getTime() - right.createdAt.getTime(),
    ),
  }));
}
