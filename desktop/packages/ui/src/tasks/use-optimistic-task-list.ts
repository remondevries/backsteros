"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  applyTaskOptimisticPatches,
  mergeTaskOptimisticPatch,
  pruneConfirmedTaskOptimisticPatches,
  type TaskListOptimisticPatch,
} from "./merge-task-list-optimistic.js";

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

/**
 * Keep list rows on the latest local edit while intermediate sync snapshots
 * arrive (e.g. rapid status switches on desktop PowerSync).
 */
export function useOptimisticTaskList<T extends TaskListOptimisticRow>(
  serverTasks: T[],
) {
  const [pending, setPending] = useState(
    () => new Map<string, TaskListOptimisticPatch>(),
  );

  useEffect(() => {
    setPending((current) =>
      pruneConfirmedTaskOptimisticPatches(serverTasks, current),
    );
  }, [serverTasks]);

  const tasks = useMemo(
    () => applyTaskOptimisticPatches(serverTasks, pending),
    [pending, serverTasks],
  );

  const patchTask = useCallback(
    (taskId: string, patch: TaskListOptimisticPatch) => {
      setPending((current) =>
        mergeTaskOptimisticPatch(current, taskId, patch),
      );
    },
    [],
  );

  return { tasks, patchTask };
}
