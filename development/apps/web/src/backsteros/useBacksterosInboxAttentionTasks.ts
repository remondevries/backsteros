import { useCallback, useEffect, useRef, useState } from "react";

import { fetchBacksterosInboxAttentionTasks } from "./client";
import type { BacksterosTask } from "./types";
import type { BacksterosProjectTasksState } from "./useBacksterosProjectTasks";
import {
  stableJsonFingerprint,
  useBacksterosSoftPoll,
} from "./useBacksterosSoftPoll";

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
          // Drop out of inbox when status leaves the attention set.
          if (
            patch.status != null &&
            patch.status !== "triage" &&
            patch.status !== "in_review" &&
            patch.status !== "in_progress" &&
            patch.status !== "on_hold"
          ) {
            return [];
          }
          return [next];
        });
        return changed ? { ...current, tasks } : current;
      });
    },
    [],
  );

  useEffect(() => {
    if (!enabled) {
      setState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setState((current) => (current.status === "ready" ? current : { status: "loading" }));

    void fetchBacksterosInboxAttentionTasks(controller.signal)
      .then((tasks) => {
        if (controller.signal.aborted) return;
        setState({ status: "ready", tasks });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Failed to load BacksterOS inbox";
        setState({ status: "error", message });
      });

    return () => controller.abort();
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
