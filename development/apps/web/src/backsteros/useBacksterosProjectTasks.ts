import { useCallback, useEffect, useRef, useState } from "react";

import { fetchBacksterosProjectTasks } from "./client";
import type { BacksterosTask } from "./types";
import {
  stableJsonFingerprint,
  useBacksterosSoftPoll,
} from "./useBacksterosSoftPoll";

export type BacksterosProjectTasksState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly tasks: readonly BacksterosTask[] }
  | { readonly status: "error"; readonly message: string };

export function useBacksterosProjectTasks(projectId: string | null): {
  readonly state: BacksterosProjectTasksState;
  readonly reload: () => void;
  readonly patchLocalTask: (
    taskId: string,
    patch: Partial<Pick<BacksterosTask, "status" | "title" | "priority" | "dueDate">>,
  ) => void;
} {
  const [state, setState] = useState<BacksterosProjectTasksState>({ status: "idle" });
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);
  const stateRef = useRef(state);
  stateRef.current = state;

  const patchLocalTask = useCallback(
    (
      taskId: string,
      patch: Partial<Pick<BacksterosTask, "status" | "title" | "priority" | "dueDate">>,
    ) => {
      setState((current) => {
        if (current.status !== "ready") return current;
        let changed = false;
        const tasks = current.tasks.map((task) => {
          if (task.id !== taskId) return task;
          changed = true;
          return { ...task, ...patch };
        });
        return changed ? { ...current, tasks } : current;
      });
    },
    [],
  );

  useEffect(() => {
    if (!projectId) {
      setState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setState((current) => (current.status === "ready" ? current : { status: "loading" }));

    void fetchBacksterosProjectTasks(projectId, controller.signal)
      .then((tasks) => {
        if (controller.signal.aborted) return;
        setState({ status: "ready", tasks });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Failed to load BacksterOS tasks";
        setState({ status: "error", message });
      });

    return () => controller.abort();
  }, [projectId, reloadToken]);

  useBacksterosSoftPoll(Boolean(projectId) && state.status === "ready", async () => {
    if (!projectId) return;
    const current = stateRef.current;
    if (current.status !== "ready") return;
    const tasks = await fetchBacksterosProjectTasks(projectId);
    if (stableJsonFingerprint(tasks) === stableJsonFingerprint(current.tasks)) return;
    setState({ status: "ready", tasks });
  });

  return { state, reload, patchLocalTask };
}
