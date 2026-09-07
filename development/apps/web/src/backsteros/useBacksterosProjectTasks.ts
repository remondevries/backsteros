import { useCallback, useEffect, useState } from "react";

import { backsterosEntityListFingerprint } from "./backsterosEntityFingerprint";
import { createBacksterosSharedQuery, type BacksterosSharedQuery } from "./backsterosQueryStore";
import { fetchBacksterosProjectTasks } from "./client";
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
      fetch: (signal) => fetchBacksterosProjectTasks(projectId, signal),
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

export function useBacksterosProjectTasks(projectId: string | null): {
  readonly state: BacksterosProjectTasksState;
  readonly reload: () => void;
  readonly patchLocalTask: (
    taskId: string,
    patch: Partial<Pick<BacksterosTask, "status" | "title" | "priority" | "dueDate">>,
  ) => void;
} {
  const [state, setState] = useState<BacksterosProjectTasksState>({ status: "idle" });

  useEffect(() => {
    if (!projectId) {
      setState({ status: "idle" });
      return;
    }
    const query = getProjectTasksQuery(projectId);
    setState(toTasksState(query.getSnapshot()));
    return query.subscribe(() => {
      setState(toTasksState(query.getSnapshot()));
    });
  }, [projectId]);

  const reload = useCallback(() => {
    if (!projectId) return;
    getProjectTasksQuery(projectId).reload();
  }, [projectId]);

  const patchLocalTask = useCallback(
    (
      taskId: string,
      patch: Partial<Pick<BacksterosTask, "status" | "title" | "priority" | "dueDate">>,
    ) => {
      if (!projectId) return;
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

  return { state, reload, patchLocalTask };
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
