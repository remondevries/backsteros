import { useCallback, useEffect, useState } from "react";

import { backsterosEntityListFingerprint } from "./backsterosEntityFingerprint";
import { createBacksterosSharedQuery, type BacksterosSharedQuery } from "./backsterosQueryStore";
import { fetchBacksterosProjectTasks } from "./client";
import { applyPendingBacksterosTaskStatuses, pendingStatusPatch } from "./pendingTaskStatus";
import { settleBoundChatsForCompletedTasks } from "./settleTaskChatOnComplete";
import { applyTaskSortOrderPatches, type BacksterosTaskSortPatch } from "./task-reorder";
import { upsertBacksterosTaskInList } from "./taskListUpsert";
import type { BacksterosTask } from "./types";

export type BacksterosProjectTasksState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly tasks: readonly BacksterosTask[] }
  | { readonly status: "error"; readonly message: string };

const projectTasksQueries = new Map<string, BacksterosSharedQuery<readonly BacksterosTask[]>>();

function getProjectTasksQuery(projectId: string): BacksterosSharedQuery<readonly BacksterosTask[]> {
  let query = projectTasksQueries.get(projectId);
  if (!query) {
    query = createBacksterosSharedQuery({
      fetch: async (signal) => {
        const tasks = applyPendingBacksterosTaskStatuses(
          await fetchBacksterosProjectTasks(projectId, signal),
        );
        settleBoundChatsForCompletedTasks(tasks);
        return tasks;
      },
      fingerprint: backsterosEntityListFingerprint,
      errorMessage: "Failed to load BacksterOS tasks",
    });
    projectTasksQueries.set(projectId, query);
  }
  return query;
}

function toTasksState(
  snapshot: ReturnType<BacksterosSharedQuery<readonly BacksterosTask[]>["getSnapshot"]>,
): BacksterosProjectTasksState {
  if (snapshot.status === "ready") {
    return { status: "ready", tasks: snapshot.data };
  }
  return snapshot;
}

type LocalTaskPatch = Partial<
  Pick<BacksterosTask, "status" | "title" | "priority" | "dueDate" | "sortOrder">
>;

export function useBacksterosProjectTasks(projectId: string | null): {
  readonly state: BacksterosProjectTasksState;
  readonly reload: () => void;
  readonly patchLocalTask: (taskId: string, patch: LocalTaskPatch) => void;
  readonly applySortOrderPatches: (patches: readonly BacksterosTaskSortPatch[]) => void;
} {
  const [state, setState] = useState<BacksterosProjectTasksState>({ status: "idle" });

  useEffect(() => {
    if (!projectId) {
      setState({ status: "idle" });
      return;
    }
    const query = getProjectTasksQuery(projectId);
    // Subscribe before reading the snapshot so we cannot miss the synchronous
    // "loading" emit when this is the first subscriber.
    const unsubscribe = query.subscribe(() => {
      setState(toTasksState(query.getSnapshot()));
    });
    setState(toTasksState(query.getSnapshot()));
    return unsubscribe;
  }, [projectId]);

  const reload = useCallback(() => {
    if (!projectId) return;
    getProjectTasksQuery(projectId).reload();
  }, [projectId]);

  const patchLocalTask = useCallback(
    (taskId: string, patch: LocalTaskPatch) => {
      if (!projectId) return;
      pendingStatusPatch(taskId, patch);
      getProjectTasksQuery(projectId).patchReadyData((tasks) => {
        let changed = false;
        const next = tasks.map((task) => {
          if (task.id !== taskId) return task;
          changed = true;
          return { ...task, ...patch };
        });
        return changed ? next : tasks;
      });
    },
    [projectId],
  );

  const applySortOrderPatches = useCallback(
    (patches: readonly BacksterosTaskSortPatch[]) => {
      if (!projectId || patches.length === 0) return;
      getProjectTasksQuery(projectId).patchReadyData((tasks) =>
        applyTaskSortOrderPatches(tasks, patches),
      );
    },
    [projectId],
  );

  return { state, reload, patchLocalTask, applySortOrderPatches };
}

/**
 * Patch status in shared project-task caches (all known projects, or one).
 * Used by status publish so the left rail updates without depending on which
 * React tree currently subscribed `patchLocalTask`.
 */
export function patchBacksterosProjectTaskStatusLocal(
  taskId: string,
  status: string,
  projectId?: string | null,
): void {
  pendingStatusPatch(taskId, { status });
  const apply = (tasks: readonly BacksterosTask[]): readonly BacksterosTask[] => {
    let changed = false;
    const next = tasks.map((task) => {
      if (task.id !== taskId) return task;
      changed = true;
      return { ...task, status };
    });
    return changed ? next : tasks;
  };

  if (projectId) {
    getProjectTasksQuery(projectId).patchReadyData(apply);
    return;
  }
  for (const query of projectTasksQueries.values()) {
    query.patchReadyData(apply);
  }
}

/**
 * Optimistically insert/replace a task in the shared project list cache so the
 * left rail updates without waiting on soft-poll.
 */
export function upsertBacksterosProjectTaskLocal(task: BacksterosTask): void {
  if (!task.projectId) return;
  pendingStatusPatch(task.id, { status: task.status });
  getProjectTasksQuery(task.projectId).patchReadyData((tasks) =>
    upsertBacksterosTaskInList(tasks, task),
  );
}

/** Test helper. */
export function getBacksterosProjectTasksQueryDebugStats(projectId: string) {
  return (
    projectTasksQueries.get(projectId)?.getDebugStats() ?? {
      subscriberCount: 0,
      softPollActive: false,
    }
  );
}
