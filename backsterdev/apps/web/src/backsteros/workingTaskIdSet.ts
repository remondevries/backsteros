const EMPTY_WORKING_TASK_IDS: ReadonlySet<string> = new Set();

/** True when both sets contain the same task ids (order-independent). */
export function sameWorkingTaskIdSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}

/**
 * Return `next` unless it matches `previous` by membership — keeps React
 * deps / memos from churning when shells update but the working set does not.
 */
export function stabilizeWorkingTaskIdSet(
  previous: ReadonlySet<string> | null | undefined,
  next: ReadonlySet<string>,
): ReadonlySet<string> {
  if (next.size === 0) return EMPTY_WORKING_TASK_IDS;
  if (previous && sameWorkingTaskIdSet(previous, next)) return previous;
  return next;
}

/**
 * Sorted membership key for effect deps (avoids Set reference identity).
 * Exported for focused tests.
 */
export function workingTaskIdsKey(taskIds: ReadonlySet<string>): string {
  if (taskIds.size === 0) return "";
  return [...taskIds].sort().join("\0");
}
