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
  /** Allocate the next document-order checkbox index during render. */
  allocateIndex: () => number;
  onToggle: (index: number) => void;
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
  const indexRef = useRef(0);
  // Reset allocation each render so indices match source order.
  indexRef.current = 0;

  const bodyRef = useRef(body);
  bodyRef.current = body;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const allocateIndex = useCallback(() => {
    const index = indexRef.current;
    indexRef.current += 1;
    return index;
  }, []);

  const onToggle = useCallback((index: number) => {
    const next = toggleMarkdownTaskListItem(bodyRef.current, index);
    if (next == null || next === bodyRef.current) return;
    onChangeRef.current?.(next);
  }, []);

  const value = useMemo((): MarkdownTaskListInteract | null => {
    if (!onChange) return null;
    return { allocateIndex, onToggle };
  }, [allocateIndex, onChange, onToggle]);

  return (
    <MarkdownTaskListInteractContext.Provider value={value}>
      {children}
    </MarkdownTaskListInteractContext.Provider>
  );
}
