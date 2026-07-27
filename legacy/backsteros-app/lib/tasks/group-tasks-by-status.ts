import type { Task } from "@/lib/db/schema";
import {
  groupTasksByStatus as groupTasksByStatusShared,
  type TaskStatusGroup as SharedTaskStatusGroup,
} from "@backsteros/ui";

export type TaskStatusGroup<T extends Task = Task> = SharedTaskStatusGroup<T>;

export function groupTasksByStatus<T extends Task>(
  tasks: T[],
): TaskStatusGroup<T>[] {
  return groupTasksByStatusShared(tasks, { includeEmpty: true });
}
