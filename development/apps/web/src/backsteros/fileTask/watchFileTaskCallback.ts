import { toastManager } from "~/components/ui/toast";

import { useFileTaskCreatingStore } from "../fileTaskCreatingStore";
import { pollFileTaskCallback } from "./wakeFileTaskAgent";

let activeAbort: AbortController | null = null;
let activeRequestId: string | null = null;

/** Poll Cloud Core in the background while the sidebar creating banner is shown. */
export function startFileTaskCallbackWatch(requestId: string): void {
  activeAbort?.abort();
  const abort = new AbortController();
  activeAbort = abort;
  activeRequestId = requestId;

  void (async () => {
    try {
      const result = await pollFileTaskCallback(requestId, { signal: abort.signal });
      if (abort.signal.aborted || activeRequestId !== requestId) return;

      if (!result.ok) {
        const store = useFileTaskCreatingStore.getState();
        if (store.creating?.requestId === requestId) {
          store.dismissCreating();
        }
        toastManager.add({
          type: "error",
          title: "Agent could not file the task",
          description: result.error,
        });
        return;
      }

      useFileTaskCreatingStore.getState().markSuccess({
        requestId,
        taskId: result.taskId ?? null,
        taskRef: result.taskRef ?? null,
        title: result.title ?? null,
        summary: result.summary ?? null,
      });
      toastManager.add({
        type: "success",
        title: result.taskRef ? `Filed ${result.taskRef}` : "Task filed",
        description: result.summary?.trim() || "Agent callback received.",
      });
    } catch (error) {
      if (abort.signal.aborted || activeRequestId !== requestId) return;
      const store = useFileTaskCreatingStore.getState();
      if (store.creating?.requestId === requestId) {
        store.dismissCreating();
      }
      const message = error instanceof Error ? error.message : "An error occurred.";
      toastManager.add({
        type: "error",
        title: "Could not file via agent",
        description: message,
      });
    } finally {
      if (activeAbort === abort) {
        activeAbort = null;
        activeRequestId = null;
      }
    }
  })();
}

export function cancelFileTaskCallbackWatch(requestId?: string): void {
  if (requestId && activeRequestId !== requestId) return;
  activeAbort?.abort();
  activeAbort = null;
  activeRequestId = null;
}
