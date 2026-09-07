import { create } from "zustand";

interface BacksterosAgentPresenceState {
  readonly remoteWorkingTaskIds: ReadonlySet<string>;
  readonly setRemoteWorkingTaskIds: (taskIds: ReadonlySet<string>) => void;
  /** Drop one id immediately (local work ended / in_review) — don't wait for poll. */
  readonly clearRemoteWorkingTaskId: (taskId: string) => void;
  /** Add one id immediately from SSE — don't wait for poll. */
  readonly addRemoteWorkingTaskId: (taskId: string) => void;
}

const EMPTY: ReadonlySet<string> = new Set();

export const useBacksterosAgentPresenceStore = create<BacksterosAgentPresenceState>((set, get) => ({
  remoteWorkingTaskIds: EMPTY,
  setRemoteWorkingTaskIds: (taskIds) =>
    set({
      remoteWorkingTaskIds: taskIds.size === 0 ? EMPTY : taskIds,
    }),
  clearRemoteWorkingTaskId: (taskId) => {
    const current = get().remoteWorkingTaskIds;
    if (!current.has(taskId)) return;
    const next = new Set(current);
    next.delete(taskId);
    set({ remoteWorkingTaskIds: next.size === 0 ? EMPTY : next });
  },
  addRemoteWorkingTaskId: (taskId) => {
    const id = taskId.trim();
    if (!id) return;
    const current = get().remoteWorkingTaskIds;
    if (current.has(id)) return;
    const next = new Set(current);
    next.add(id);
    set({ remoteWorkingTaskIds: next });
  },
}));
