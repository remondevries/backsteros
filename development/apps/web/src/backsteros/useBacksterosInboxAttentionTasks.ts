import { useCallback } from "react";

import { backsterosEntityListFingerprint } from "./backsterosEntityFingerprint";
import { createBacksterosSharedQuery, useBacksterosSharedQuery } from "./backsterosQueryStore";
import { fetchBacksterosInboxAttentionTasks } from "./client";
import { isBacksterosInboxAttentionStatus, isBacksterosInboxDueTask } from "./inboxDue";
import { applyTaskSortOrderPatches, type BacksterosTaskSortPatch } from "./task-reorder";
import type { BacksterosTask } from "./types";
import type { BacksterosProjectTasksState } from "./useBacksterosProjectTasks";

/** Inbox attention is a 6-request fan-out; poll slower than project lists. */
export const BACKSTEROS_INBOX_SOFT_POLL_INTERVAL_MS = 8_000;

const inboxQuery = createBacksterosSharedQuery({
  fetch: fetchBacksterosInboxAttentionTasks,
  fingerprint: backsterosEntityListFingerprint,
  errorMessage: "Failed to load BacksterOS inbox",
  softPollIntervalMs: BACKSTEROS_INBOX_SOFT_POLL_INTERVAL_MS,
});

function toTasksState(
  snapshot: ReturnType<typeof inboxQuery.getSnapshot>,
): BacksterosProjectTasksState {
  if (snapshot.status === "ready") {
    return { status: "ready", tasks: snapshot.data };
  }
  return snapshot;
}

type LocalTaskPatch = Partial<
  Pick<BacksterosTask, "status" | "title" | "priority" | "dueDate" | "sortOrder">
>;

export function useBacksterosInboxAttentionTasks(enabled: boolean): {
  readonly state: BacksterosProjectTasksState;
  readonly reload: () => void;
  readonly patchLocalTask: (taskId: string, patch: LocalTaskPatch) => void;
  readonly applySortOrderPatches: (patches: readonly BacksterosTaskSortPatch[]) => void;
} {
  const snapshot = useBacksterosSharedQuery(inboxQuery, enabled);
  const reload = useCallback(() => inboxQuery.reload(), []);

  const patchLocalTask = useCallback((taskId: string, patch: LocalTaskPatch) => {
    inboxQuery.patchReadyData((tasks) => {
      let changed = false;
      const next = tasks.flatMap((task) => {
        if (task.id !== taskId) return [task];
        changed = true;
        const updated = { ...task, ...patch };
        if (isBacksterosInboxAttentionStatus(updated.status) || isBacksterosInboxDueTask(updated)) {
          return [updated];
        }
        return [];
      });
      return changed ? next : tasks;
    });
  }, []);

  const applySortOrderPatches = useCallback((patches: readonly BacksterosTaskSortPatch[]) => {
    if (patches.length === 0) return;
    inboxQuery.patchReadyData((tasks) => applyTaskSortOrderPatches(tasks, patches));
  }, []);

  return {
    state: toTasksState(snapshot),
    reload,
    patchLocalTask,
    applySortOrderPatches,
  };
}

/** Test helper. */
export function getBacksterosInboxAttentionQueryDebugStats() {
  return inboxQuery.getDebugStats();
}
