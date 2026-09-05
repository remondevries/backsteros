import { create } from "zustand";

interface BacksterosAgentPresenceState {
  readonly remoteWorkingTaskIds: ReadonlySet<string>;
  readonly setRemoteWorkingTaskIds: (taskIds: ReadonlySet<string>) => void;
}

const EMPTY: ReadonlySet<string> = new Set();

export const useBacksterosAgentPresenceStore = create<BacksterosAgentPresenceState>(
  (set) => ({
    remoteWorkingTaskIds: EMPTY,
    setRemoteWorkingTaskIds: (taskIds) =>
      set({
        remoteWorkingTaskIds: taskIds.size === 0 ? EMPTY : taskIds,
      }),
  }),
);
