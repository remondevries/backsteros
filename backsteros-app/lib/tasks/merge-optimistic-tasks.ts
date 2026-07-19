import { migrateLegacyTaskStatus } from "@/lib/task-status";

type TaskWithOrdering = {
  id: string;
  status: string;
  sortOrder: number;
};

/**
 * Merge server rows with local optimistic edits and keep local-only creates.
 *
 * Uses a three-way merge against `previousServerTasks` so remote updates win
 * when the local row was not edited. Preferring local whenever it differs from
 * the new server snapshot (two-way) blocked live updates from other clients.
 */
export function mergeServerTasksWithOptimistic<T extends TaskWithOrdering>(
  serverTasks: T[],
  localTasks: T[],
  previousServerTasks: T[] = serverTasks,
): T[] {
  const localById = new Map(localTasks.map((task) => [task.id, task]));
  const previousById = new Map(
    previousServerTasks.map((task) => [task.id, task]),
  );
  const serverIds = new Set(serverTasks.map((task) => task.id));

  const merged = serverTasks.map((serverTask) => {
    const localTask = localById.get(serverTask.id);
    if (!localTask) {
      return serverTask;
    }

    const previousTask = previousById.get(serverTask.id);
    if (!previousTask) {
      return serverTask;
    }

    const localStatus = migrateLegacyTaskStatus(localTask.status);
    const serverStatus = migrateLegacyTaskStatus(serverTask.status);
    const previousStatus = migrateLegacyTaskStatus(previousTask.status);

    const localEditedStatus = localStatus !== previousStatus;
    const serverEditedStatus = serverStatus !== previousStatus;
    const localEditedSort = localTask.sortOrder !== previousTask.sortOrder;
    const serverEditedSort = serverTask.sortOrder !== previousTask.sortOrder;

    const keepLocalStatus = localEditedStatus && !serverEditedStatus;
    const keepLocalSort = localEditedSort && !serverEditedSort;

    if (!keepLocalStatus && !keepLocalSort) {
      return serverTask;
    }

    return {
      ...serverTask,
      status: keepLocalStatus ? localTask.status : serverTask.status,
      sortOrder: keepLocalSort ? localTask.sortOrder : serverTask.sortOrder,
    };
  });

  const appended = localTasks.filter((task) => !serverIds.has(task.id));
  if (appended.length === 0) {
    return merged;
  }

  return [...merged, ...appended];
}
