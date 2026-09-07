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
  /**
   * Task whose description editor is in Edit mode. Used to block kickoff send so
   * the first message always includes the latest flushed description.
   */
  readonly descriptionEditingTaskId: string | null;
  readonly openTaskDetail: (selection: {
    readonly taskId: string;
    readonly project: BacksterosCodebaseProject;
  }) => void;
  readonly openCreateTaskDetail: (
    project: BacksterosCodebaseProject,
    options?: { readonly reveal?: boolean },
  ) => void;
  readonly setTaskDetailProject: (project: BacksterosCodebaseProject) => void;
  readonly closeTaskDetail: () => void;
  readonly toggleTaskDetail: () => void;
  readonly clearTaskDetail: () => void;
  readonly setDescriptionEditing: (taskId: string | null, editing: boolean) => void;
}

export const useBacksterosTaskDetailUiStore = create<BacksterosTaskDetailUiState>((set) => ({
  selection: null,
  visible: false,
  descriptionEditingTaskId: null,
  openTaskDetail: (selection) =>
    set((state) => ({
      selection: { taskId: selection.taskId, project: selection.project },
      visible: true,
      descriptionEditingTaskId:
        state.descriptionEditingTaskId === selection.taskId ? state.descriptionEditingTaskId : null,
    })),
  openCreateTaskDetail: (project, options) =>
    set((state) => {
      const sameCreate =
        state.selection?.taskId === null && state.selection.project.id === project.id;
      if (sameCreate && !options?.reveal) {
        return {
          selection: { taskId: null, project },
          visible: state.visible,
          descriptionEditingTaskId: null,
        };
      }
      return {
        selection: { taskId: null, project },
        visible: true,
        descriptionEditingTaskId: null,
      };
    }),
  setTaskDetailProject: (project) =>
    set((state) => {
      if (!state.selection) return state;
      if (state.selection.project.id === project.id) return state;
      return {
        ...state,
        selection: { ...state.selection, project },
      };
    }),
  closeTaskDetail: () => set({ visible: false, descriptionEditingTaskId: null }),
  toggleTaskDetail: () =>
    set((state) => {
      if (!state.selection) return state;
      const visible = !state.visible;
      return {
        visible,
        descriptionEditingTaskId: visible ? state.descriptionEditingTaskId : null,
      };
    }),
  clearTaskDetail: () => set({ selection: null, visible: false, descriptionEditingTaskId: null }),
  setDescriptionEditing: (taskId, editing) =>
    set((state) => {
      if (!editing) {
        if (state.descriptionEditingTaskId == null) return state;
        if (taskId != null && state.descriptionEditingTaskId !== taskId) return state;
        return { descriptionEditingTaskId: null };
      }
      if (taskId == null) return state;
      if (state.descriptionEditingTaskId === taskId) return state;
      return { descriptionEditingTaskId: taskId };
    }),
}));
