export type BacksterosTaskLikeForReorder = {
  readonly id: string;
  readonly sortOrder?: number;
};

export type BacksterosTaskSortPatch = {
  readonly id: string;
  readonly sortOrder: number;
};

/**
 * Reindex tasks in a single status group after a same-status drag reorder.
 * Uses stride 10 to leave room for inserts (parity with projects / desktop).
 */
export function taskSortOrderPatchesForGroup(
  orderedTasks: readonly BacksterosTaskLikeForReorder[],
): readonly BacksterosTaskSortPatch[] {
  return orderedTasks.map((task, index) => ({
    id: task.id,
    sortOrder: index * 10,
  }));
}

/** Apply sortOrder patches onto a full task list (other rows unchanged). */
export function applyTaskSortOrderPatches<
  T extends { readonly id: string; readonly sortOrder?: number },
>(tasks: readonly T[], patches: readonly BacksterosTaskSortPatch[]): T[] {
  if (patches.length === 0) return [...tasks];
  const byId = new Map(patches.map((patch) => [patch.id, patch.sortOrder]));
  return tasks.map((task) => {
    const sortOrder = byId.get(task.id);
    if (sortOrder === undefined) return task;
    return { ...task, sortOrder };
  });
}
