import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

import {
  COMPONENT_EDITOR_DEFAULT_APPEARANCE,
  COMPONENT_EDITOR_DEFAULT_CANVAS,
  COMPONENT_EDITOR_DEFAULT_CSS,
  COMPONENT_EDITOR_DEFAULT_HTML,
  componentEditorCanvasColor,
  isComponentEditorAppearance,
  type ComponentEditorAppearance,
  type ComponentEditorCanvasColor,
  type ComponentEditorFramework,
} from "./componentEditorDocument";

export type ComponentEditorTab = "html" | "css";

interface ComponentEditorState {
  html: string;
  css: string;
  framework: ComponentEditorFramework;
  canvas: ComponentEditorCanvasColor;
  appearance: ComponentEditorAppearance;
  activeTab: ComponentEditorTab;
  setHtml: (html: string) => void;
  setCss: (css: string) => void;
  setFramework: (framework: ComponentEditorFramework) => void;
  setCanvas: (canvas: ComponentEditorCanvasColor) => void;
  setAppearance: (appearance: ComponentEditorAppearance) => void;
  setActiveTab: (tab: ComponentEditorTab) => void;
  replaceDocument: (next: {
    html: string;
    css: string;
    framework?: ComponentEditorFramework;
    canvas?: ComponentEditorCanvasColor;
    appearance?: ComponentEditorAppearance;
  }) => void;
}

const STORAGE_KEY = "backsterdev:component-editor:v1";

export const useComponentEditorStore = create<ComponentEditorState>()(
  persist(
    (set) => ({
      html: COMPONENT_EDITOR_DEFAULT_HTML.trimEnd(),
      css: COMPONENT_EDITOR_DEFAULT_CSS.trimEnd(),
      framework: "vanilla",
      canvas: COMPONENT_EDITOR_DEFAULT_CANVAS,
      appearance: COMPONENT_EDITOR_DEFAULT_APPEARANCE,
      activeTab: "html",
      setHtml: (html) => set({ html }),
      setCss: (css) => set({ css }),
      setFramework: (framework) => set({ framework }),
      setCanvas: (canvas) => set({ canvas: componentEditorCanvasColor(canvas) }),
      setAppearance: (appearance) => set({ appearance }),
      setActiveTab: (activeTab) => set({ activeTab }),
      replaceDocument: ({ html, css, framework, canvas, appearance }) =>
        set((state) => ({
          html,
          css,
          framework: framework ?? state.framework,
          canvas: canvas ? componentEditorCanvasColor(canvas) : state.canvas,
          appearance: appearance ?? state.appearance,
        })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({
        html: state.html,
        css: state.css,
        framework: state.framework,
        canvas: state.canvas,
        appearance: state.appearance,
        activeTab: state.activeTab,
      }),
      merge: (persisted, current) => {
        const partial =
          persisted && typeof persisted === "object"
            ? (persisted as Partial<ComponentEditorState>)
            : {};
        const appearance =
          typeof partial.appearance === "string" && isComponentEditorAppearance(partial.appearance)
            ? partial.appearance
            : current.appearance;
        return {
          ...current,
          ...partial,
          canvas: componentEditorCanvasColor(partial.canvas ?? current.canvas),
          appearance,
        };
      },
    },
  ),
);
