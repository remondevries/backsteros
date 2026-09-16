import { create } from "zustand";

import type { BacksterosCodebaseProject } from "./types";

/**
 * File-as-BacksterOS-task overlay (frozen orb next to New task).
 * Independent of create-task `composeProject`.
 */
interface BacksterosFileTaskUiState {
  readonly fileTaskProject: BacksterosCodebaseProject | null;
  readonly openFileTask: (project: BacksterosCodebaseProject) => void;
  readonly closeFileTask: () => void;
}

export const useBacksterosFileTaskUiStore = create<BacksterosFileTaskUiState>((set) => ({
  fileTaskProject: null,
  openFileTask: (project) => set({ fileTaskProject: project }),
  closeFileTask: () => set({ fileTaskProject: null }),
}));

export function isBacksterosFileTaskModalOpen(
  doc: ParentNode | null | undefined = typeof document !== "undefined" ? document : null,
): boolean {
  if (doc == null) return false;
  return doc.querySelector("[data-file-task-modal]") != null;
}
