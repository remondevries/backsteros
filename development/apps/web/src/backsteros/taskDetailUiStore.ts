import { create } from "zustand";

import type { BacksterosCodebaseProject } from "./types";

/**
 * `taskId` null = create-task empty state for the given project.
 * `taskId` string = existing task detail.
 */
export type BacksterosTaskDetailSelection = {
  readonly taskId: string | null;
  readonly project: BacksterosCodebaseProject;
};

interface BacksterosTaskDetailUiState {
  readonly selection: BacksterosTaskDetailSelection | null;
  /** Whether the detail panel is currently shown (selection can remain while hidden). */
  readonly visible: boolean;
  readonly openTaskDetail: (selection: {
    readonly taskId: string;
    readonly project: BacksterosCodebaseProject;
  }) => void;
  readonly openCreateTaskDetail: (
    project: BacksterosCodebaseProject,
    options?: { readonly reveal?: boolean },
  ) => void;
  readonly closeTaskDetail: () => void;
  readonly toggleTaskDetail: () => void;
  readonly clearTaskDetail: () => void;
}

export const useBacksterosTaskDetailUiStore = create<BacksterosTaskDetailUiState>((set) => ({
  selection: null,
  visible: false,
  openTaskDetail: (selection) =>
    set({ selection: { taskId: selection.taskId, project: selection.project }, visible: true }),
  openCreateTaskDetail: (project, options) =>
    set((state) => {
      const sameCreate =
        state.selection?.taskId === null && state.selection.project.id === project.id;
      if (sameCreate && !options?.reveal) {
        return {
          selection: { taskId: null, project },
          visible: state.visible,
        };
      }
      return {
        selection: { taskId: null, project },
        visible: true,
      };
    }),
  closeTaskDetail: () => set({ visible: false }),
  toggleTaskDetail: () =>
    set((state) => {
      if (!state.selection) return state;
      return { visible: !state.visible };
    }),
  clearTaskDetail: () => set({ selection: null, visible: false }),
}));
