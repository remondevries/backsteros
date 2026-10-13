"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

import { toggleMarkdownTaskListItem } from "./markdown-task-list.js";

export type MarkdownTaskListInteract = {
  /**
   * Toggle by DOM order among interactive checkboxes in the preview root.
   * Avoids render-phase index allocation (broken under React Strict Mode).
   */
  onToggleAtElement: (element: HTMLElement) => void;
};

const MarkdownTaskListInteractContext =
  createContext<MarkdownTaskListInteract | null>(null);

export function useMarkdownTaskListInteract(): MarkdownTaskListInteract | null {
  return useContext(MarkdownTaskListInteractContext);
}

export function MarkdownTaskListInteractProvider({
  body,
  onChange,
  children,
}: {
  body: string;
  onChange?: (nextBody: string) => void;
  children: ReactNode;
}): ReactNode {
  const bodyRef = useRef(body);
  bodyRef.current = body;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onToggleAtElement = useCallback((element: HTMLElement) => {
    if (!onChangeRef.current) return;
    const root =
      element.closest("[data-markdown-task-list-root]") ??
      element.closest("[data-content-preview-links]") ??
      element.closest(".document-markdown");
    if (!(root instanceof HTMLElement)) return;

    const buttons = [
      ...root.querySelectorAll<HTMLElement>(".md-task-checkbox--interactive"),
    ];
    const index = buttons.indexOf(element);
    if (index < 0) return;

    const next = toggleMarkdownTaskListItem(bodyRef.current, index);
    if (next == null || next === bodyRef.current) return;
    onChangeRef.current(next);
  }, []);

  const value = useMemo((): MarkdownTaskListInteract | null => {
    if (!onChange) return null;
    return { onToggleAtElement };
  }, [onChange, onToggleAtElement]);

  return (
    <MarkdownTaskListInteractContext.Provider value={value}>
      {children}
    </MarkdownTaskListInteractContext.Provider>
  );
}
