import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { backsterosEntityListFingerprint } from "./backsterosEntityFingerprint";
import { createBacksterosSharedQuery, useBacksterosSharedQuery } from "./backsterosQueryStore";
import { fetchBacksterosInboxAttentionTasks, fetchBacksterosTask } from "./client";
import { isBacksterosInboxMemberTask, mergeBacksterosInboxTasksWithWorking } from "./inboxDue";
import { applyPendingBacksterosTaskStatuses, pendingStatusPatch } from "./pendingTaskStatus";
import { settleBoundChatsForCompletedTasks } from "./settleTaskChatOnComplete";
import { applyTaskSortOrderPatches, type BacksterosTaskSortPatch } from "./task-reorder";
import { upsertBacksterosTaskInList } from "./taskListUpsert";
import type { BacksterosTask } from "./types";
import type { BacksterosProjectTasksState } from "./useBacksterosProjectTasks";
import { useBacksterosDisplayedWorkingTaskIds } from "./useBacksterosAgentPresence";

/** Inbox attention is a 6-request fan-out; poll slower than project lists. */
export const BACKSTEROS_INBOX_SOFT_POLL_INTERVAL_MS = 8_000;

const EMPTY_WORKING_TASK_ID_SET: ReadonlySet<string> = new Set();
const EMPTY_WORKING_TASKS_BY_ID: ReadonlyMap<string, BacksterosTask> = new Map();

const inboxQuery = createBacksterosSharedQuery({
  fetch: async (signal) => {
    const tasks = applyPendingBacksterosTaskStatuses(
      await fetchBacksterosInboxAttentionTasks(signal),
    );
    settleBoundChatsForCompletedTasks(tasks);
    return tasks;
  },
  fingerprint: backsterosEntityListFingerprint,
  errorMessage: "Failed to load BacksterOS inbox",
  softPollIntervalMs: BACKSTEROS_INBOX_SOFT_POLL_INTERVAL_MS,
});

function toTasksState(
  snapshot: ReturnType<typeof inboxQuery.getSnapshot>,
  tasksOverride?: readonly BacksterosTask[],
): BacksterosProjectTasksState {
  if (snapshot.status === "ready") {
    return { status: "ready", tasks: tasksOverride ?? snapshot.data };
  }
  return snapshot;
}

type LocalTaskPatch = Partial<
  Pick<BacksterosTask, "status" | "title" | "priority" | "dueDate" | "sortOrder">
>;

/**
 * Fetch task rows for live working ids that soft-poll inbox membership misses
 * (e.g. ready_to_start + future due before promote lands). Kept outside the
 * shared query so soft-poll cannot wipe them.
 */
function useBacksterosInboxWorkingTaskExtras(
  enabled: boolean,
  workingTaskIds: ReadonlySet<string>,
  inboxTaskIds: ReadonlySet<string>,
): ReadonlyMap<string, BacksterosTask> {
  const [extrasById, setExtrasById] = useState(EMPTY_WORKING_TASKS_BY_ID);
  const extrasRef = useRef(extrasById);
  extrasRef.current = extrasById;

  useEffect(() => {
    if (!enabled) {
      setExtrasById(EMPTY_WORKING_TASKS_BY_ID);
      return;
    }

    setExtrasById((current) => {
      let changed = false;
      const next = new Map<string, BacksterosTask>();
      for (const [taskId, task] of current) {
        if (!workingTaskIds.has(taskId) || inboxTaskIds.has(taskId)) {
          changed = true;
          continue;
        }
        next.set(taskId, task);
      }
      if (!changed) return current;
      return next.size === 0 ? EMPTY_WORKING_TASKS_BY_ID : next;
    });

    const missing: string[] = [];
    for (const taskId of workingTaskIds) {
      if (inboxTaskIds.has(taskId)) continue;
      if (extrasRef.current.has(taskId)) continue;
      missing.push(taskId);
    }
    if (missing.length === 0) return;

    const controller = new AbortController();
    for (const taskId of missing) {
      void fetchBacksterosTask(taskId, controller.signal)
        .then((detail) => {
          if (controller.signal.aborted) return;
          setExtrasById((current) => {
            if (current.has(taskId)) return current;
            if (!workingTaskIds.has(taskId) || inboxTaskIds.has(taskId)) return current;
            const map = new Map(current);
            map.set(taskId, detail);
            return map;
          });
        })
        .catch(() => {
          // Best-effort; a later working tick can retry.
        });
    }

    return () => {
      controller.abort();
    };
  }, [enabled, workingTaskIds, inboxTaskIds]);

  return extrasById;
}

export function useBacksterosInboxAttentionTasks(enabled: boolean): {
  readonly state: BacksterosProjectTasksState;
  readonly reload: () => void;
  readonly patchLocalTask: (taskId: string, patch: LocalTaskPatch) => void;
  readonly applySortOrderPatches: (patches: readonly BacksterosTaskSortPatch[]) => void;
  readonly workingTaskIds: ReadonlySet<string>;
} {
  const snapshot = useBacksterosSharedQuery(inboxQuery, enabled);
  const workingTaskIds = useBacksterosDisplayedWorkingTaskIds();
  const reload = useCallback(() => inboxQuery.reload(), []);

  const inboxTaskIds = useMemo(() => {
    if (snapshot.status !== "ready") return EMPTY_WORKING_TASK_ID_SET;
    return new Set(snapshot.data.map((task) => task.id));
  }, [snapshot]);

  const workingExtrasById = useBacksterosInboxWorkingTaskExtras(
    enabled,
    workingTaskIds,
    inboxTaskIds,
  );

  const mergedTasks = useMemo(() => {
    if (snapshot.status !== "ready") return undefined;
    return mergeBacksterosInboxTasksWithWorking({
      inboxTasks: snapshot.data,
      workingTasksById: workingExtrasById,
      workingTaskIds,
    });
  }, [snapshot, workingExtrasById, workingTaskIds]);

  const patchLocalTask = useCallback(
    (taskId: string, patch: LocalTaskPatch) => {
      pendingStatusPatch(taskId, patch);
      inboxQuery.patchReadyData((tasks) => {
        let changed = false;
        const next = tasks.flatMap((task) => {
          if (task.id !== taskId) return [task];
          changed = true;
          const updated = { ...task, ...patch };
          if (isBacksterosInboxMemberTask(updated, { workingTaskIds })) {
            return [updated];
          }
          return [];
        });
        return changed ? next : tasks;
      });
    },
    [workingTaskIds],
  );

  const applySortOrderPatches = useCallback((patches: readonly BacksterosTaskSortPatch[]) => {
    if (patches.length === 0) return;
    inboxQuery.patchReadyData((tasks) => applyTaskSortOrderPatches(tasks, patches));
  }, []);

  return {
    state: toTasksState(snapshot, mergedTasks),
    reload,
    patchLocalTask,
    applySortOrderPatches,
    workingTaskIds,
  };
}

/**
 * Patch status in the shared inbox cache. No-ops while the query is not ready.
 */
export function patchBacksterosInboxTaskStatusLocal(taskId: string, status: string): void {
  pendingStatusPatch(taskId, { status });
  inboxQuery.patchReadyData((tasks) => {
    let changed = false;
    const next = tasks.flatMap((task) => {
      if (task.id !== taskId) return [task];
      changed = true;
      const updated = { ...task, status };
      // Membership without live working ids — attention statuses (incl. in_review)
      // stay; others drop if they no longer qualify.
      if (isBacksterosInboxMemberTask(updated)) {
        return [updated];
      }
      return [];
    });
    return changed ? next : tasks;
  });
}

/**
 * Optimistically insert/replace/remove a task in the shared inbox cache.
 * No-ops while the inbox query is not ready (rail not mounted yet).
 */
export function upsertBacksterosInboxTaskLocal(
  task: BacksterosTask,
  workingTaskIds: ReadonlySet<string> = EMPTY_WORKING_TASK_ID_SET,
): void {
  pendingStatusPatch(task.id, { status: task.status });
  inboxQuery.patchReadyData((tasks) => {
    const member = isBacksterosInboxMemberTask(task, { workingTaskIds });
    const index = tasks.findIndex((entry) => entry.id === task.id);
    if (index >= 0) {
      if (!member) {
        return tasks.filter((entry) => entry.id !== task.id);
      }
      return upsertBacksterosTaskInList(tasks, task);
    }
    if (!member) return tasks;
    return upsertBacksterosTaskInList(tasks, task);
  });
}

/** Test helper. */
export function getBacksterosInboxAttentionQueryDebugStats() {
  return inboxQuery.getDebugStats();
}
