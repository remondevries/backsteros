import { migrateLegacyTaskStatus } from "@/lib/task-status";

type TaskWithOrdering = {
  id: string;
  status: string;
  sortOrder: number;
};

/** Merge server rows with local optimistic edits and keep local-only creates visible. */
export function mergeServerTasksWithOptimistic<T extends TaskWithOrdering>(
  serverTasks: T[],
  localTasks: T[],
): T[] {
  const localById = new Map(localTasks.map((task) => [task.id, task]));
  const serverIds = new Set(serverTasks.map((task) => task.id));

  const merged = serverTasks.map((serverTask) => {
    const localTask = localById.get(serverTask.id);
    if (!localTask) {
      return serverTask;
    }

    const localStatus = migrateLegacyTaskStatus(localTask.status);
    const serverStatus = migrateLegacyTaskStatus(serverTask.status);
    const statusChanged = localStatus !== serverStatus;
    const sortOrderChanged = localTask.sortOrder !== serverTask.sortOrder;

    if (statusChanged || sortOrderChanged) {
      return {
        ...serverTask,
        status: localTask.status,
        sortOrder: localTask.sortOrder,
      };
    }

    return serverTask;
  });

  const appended = localTasks.filter((task) => !serverIds.has(task.id));
  if (appended.length === 0) {
    return merged;
  }

  return [...merged, ...appended];
}
