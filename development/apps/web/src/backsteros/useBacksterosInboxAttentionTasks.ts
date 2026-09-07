import { useCallback } from "react";

import { backsterosEntityListFingerprint } from "./backsterosEntityFingerprint";
import { createBacksterosSharedQuery, useBacksterosSharedQuery } from "./backsterosQueryStore";
import { fetchBacksterosInboxAttentionTasks } from "./client";
import { isBacksterosInboxAttentionStatus, isBacksterosInboxDueTask } from "./inboxDue";
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

export function useBacksterosInboxAttentionTasks(enabled: boolean): {
  readonly state: BacksterosProjectTasksState;
  readonly reload: () => void;
  readonly patchLocalTask: (
    taskId: string,
    patch: Partial<Pick<BacksterosTask, "status" | "title" | "priority" | "dueDate">>,
  ) => void;
} {
  const snapshot = useBacksterosSharedQuery(inboxQuery, enabled);
  const reload = useCallback(() => inboxQuery.reload(), []);

  const patchLocalTask = useCallback(
    (
      taskId: string,
      patch: Partial<Pick<BacksterosTask, "status" | "title" | "priority" | "dueDate">>,
    ) => {
      inboxQuery.patchReadyData((tasks) => {
        let changed = false;
        const next = tasks.flatMap((task) => {
          if (task.id !== taskId) return [task];
          changed = true;
          const updated = { ...task, ...patch };
          if (
            isBacksterosInboxAttentionStatus(updated.status) ||
            isBacksterosInboxDueTask(updated)
          ) {
            return [updated];
          }
          return [];
        });
        return changed ? next : tasks;
      });
    },
    [],
  );

  return {
    state: toTasksState(snapshot),
    reload,
    patchLocalTask,
  };
}

/** Test helper. */
export function getBacksterosInboxAttentionQueryDebugStats() {
  return inboxQuery.getDebugStats();
}
