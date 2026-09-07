import { useCallback, useEffect, useRef, useState } from "react";

import { fetchBacksterosInboxAttentionTasks } from "./client";
import { isBacksterosInboxAttentionStatus, isBacksterosInboxDueTask } from "./inboxDue";
import type { BacksterosTask } from "./types";
import type { BacksterosProjectTasksState } from "./useBacksterosProjectTasks";
import { stableJsonFingerprint, useBacksterosSoftPoll } from "./useBacksterosSoftPoll";

export function useBacksterosInboxAttentionTasks(enabled: boolean): {
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
  const requestGenerationRef = useRef(0);

  const patchLocalTask = useCallback(
    (
      taskId: string,
      patch: Partial<Pick<BacksterosTask, "status" | "title" | "priority" | "dueDate">>,
    ) => {
      setState((current) => {
        if (current.status !== "ready") return current;
        let changed = false;
        const tasks = current.tasks.flatMap((task) => {
          if (task.id !== taskId) return [task];
          changed = true;
          const next = { ...task, ...patch };
          if (isBacksterosInboxAttentionStatus(next.status) || isBacksterosInboxDueTask(next)) {
            return [next];
          }
          return [];
        });
        return changed ? { ...current, tasks } : current;
      });
    },
    [],
  );

  useEffect(() => {
    if (!enabled) {
      requestGenerationRef.current += 1;
      setState({ status: "idle" });
      return;
    }

    const generation = ++requestGenerationRef.current;
    const controller = new AbortController();
    setState((current) => (current.status === "ready" ? current : { status: "loading" }));

    void fetchBacksterosInboxAttentionTasks(controller.signal)
      .then((tasks) => {
        if (generation !== requestGenerationRef.current) return;
        setState({ status: "ready", tasks });
      })
      .catch((error: unknown) => {
        if (generation !== requestGenerationRef.current) return;
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Failed to load BacksterOS inbox";
        setState({ status: "error", message });
      });

    return () => {
      controller.abort();
    };
  }, [enabled, reloadToken]);

  useBacksterosSoftPoll(enabled && state.status === "ready", async () => {
    const current = stateRef.current;
    if (current.status !== "ready") return;
    const tasks = await fetchBacksterosInboxAttentionTasks();
    if (stableJsonFingerprint(tasks) === stableJsonFingerprint(current.tasks)) return;
    setState({ status: "ready", tasks });
  });

  return { state, reload, patchLocalTask };
}
