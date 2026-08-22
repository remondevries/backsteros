import { migrateLegacyTaskStatus } from "./task-status.js";

/** Local field overrides that must survive intermediate sync snapshots. */
export type TaskListOptimisticPatch = {
  status?: string;
  priority?: number;
  dueDate?: number | null;
  projectKey?: string | null;
  projectName?: string | null;
  assigneeId?: string | null;
  ownerInitials?: string | null;
  sortOrder?: number;
};

type TaskListOptimisticRow = {
  id: string;
  status: string;
  priority?: number;
  dueDate?: number | Date | null;
  projectKey?: string | null;
  projectName?: string | null;
  assigneeId?: string | null;
  sortOrder?: number;
};

function dueDateMs(value: number | Date | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function patchHasFields(patch: TaskListOptimisticPatch): boolean {
  return Object.keys(patch).length > 0;
}

/**
 * Drop pending fields that the server snapshot has already confirmed.
 * Returns the same Map reference when nothing changed.
 */
export function pruneConfirmedTaskOptimisticPatches<
  T extends TaskListOptimisticRow,
>(
  serverTasks: T[],
  pending: Map<string, TaskListOptimisticPatch>,
): Map<string, TaskListOptimisticPatch> {
  if (pending.size === 0) return pending;

  const serverById = new Map(serverTasks.map((task) => [task.id, task]));
  let changed = false;
  const next = new Map<string, TaskListOptimisticPatch>();

  for (const [taskId, patch] of pending) {
    const serverTask = serverById.get(taskId);
    if (!serverTask) {
      changed = true;
      continue;
    }

    const kept: TaskListOptimisticPatch = { ...patch };

    if (
      kept.status !== undefined &&
      migrateLegacyTaskStatus(serverTask.status) ===
        migrateLegacyTaskStatus(kept.status)
    ) {
      delete kept.status;
      changed = true;
    }

    if (
      kept.priority !== undefined &&
      (serverTask.priority ?? 0) === kept.priority
    ) {
      delete kept.priority;
      changed = true;
    }

    if (
      kept.dueDate !== undefined &&
      dueDateMs(serverTask.dueDate) === kept.dueDate
    ) {
      delete kept.dueDate;
      changed = true;
    }

    if (
      kept.projectKey !== undefined &&
      (serverTask.projectKey ?? null) === kept.projectKey
    ) {
      delete kept.projectKey;
      delete kept.projectName;
      changed = true;
    }

    if (
      kept.assigneeId !== undefined &&
      (serverTask.assigneeId ?? null) === kept.assigneeId
    ) {
      delete kept.assigneeId;
      delete kept.ownerInitials;
      changed = true;
    }

    if (
      kept.sortOrder !== undefined &&
      (serverTask.sortOrder ?? 0) === kept.sortOrder
    ) {
      delete kept.sortOrder;
      changed = true;
    }

    if (!patchHasFields(kept)) {
      changed = true;
      continue;
    }

    next.set(taskId, kept);
  }

  return changed ? next : pending;
}

/** Overlay unconfirmed local edits onto the latest server rows. */
export function applyTaskOptimisticPatches<T extends { id: string }>(
  serverTasks: T[],
  pending: Map<string, TaskListOptimisticPatch>,
): T[] {
  if (pending.size === 0) return serverTasks;

  return serverTasks.map((task) => {
    const patch = pending.get(task.id);
    if (!patch) return task;
    return { ...task, ...patch };
  });
}

export function mergeTaskOptimisticPatch(
  pending: Map<string, TaskListOptimisticPatch>,
  taskId: string,
  patch: TaskListOptimisticPatch,
): Map<string, TaskListOptimisticPatch> {
  const next = new Map(pending);
  next.set(taskId, { ...next.get(taskId), ...patch });
  return next;
}
