import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

import {
  parseBacksterosCodebaseListTab,
  type BacksterosCodebaseListTab,
} from "./codebaseListTabs";

const STORAGE_KEY = "t3code:backsteros-codebase-project-tab";

type CodebaseProjectTabState = {
  readonly tab: BacksterosCodebaseListTab;
  readonly setTab: (tab: BacksterosCodebaseListTab) => void;
};

/**
 * Sticky workbench tab across project switches (j/k preview, Enter, etc.).
 * Persists so the same list tab (e.g. Tasks) stays open while browsing projects.
 */
export const useBacksterosCodebaseProjectTabStore = create<CodebaseProjectTabState>()(
  persist(
    (set) => ({
      tab: "overview",
      setTab: (tab) => set({ tab }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ tab: state.tab }),
      merge: (persisted, current) => {
        const raw =
          persisted && typeof persisted === "object"
            ? (persisted as { readonly tab?: unknown }).tab
            : undefined;
        const tab = parseBacksterosCodebaseListTab(raw) ?? current.tab;
        return { ...current, tab };
      },
    },
  ),
);

export function getBacksterosCodebaseProjectTab(): BacksterosCodebaseListTab {
  return useBacksterosCodebaseProjectTabStore.getState().tab;
}

export function rememberBacksterosCodebaseProjectTab(tab: BacksterosCodebaseListTab): void {
  useBacksterosCodebaseProjectTabStore.getState().setTab(tab);
}
