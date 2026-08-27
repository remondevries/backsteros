import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

export const LIST_BOARD_VIEWS = ["list", "board"] as const;

export type ListBoardView = (typeof LIST_BOARD_VIEWS)[number];

export const DEFAULT_LIST_BOARD_VIEW: ListBoardView = "list";

/** Mirrors desktop `list-board-view.ts` storage keys. */
export const TASKS_LIST_BOARD_STORAGE_KEY = "circle:project-tasks-view";
export const PROJECTS_LIST_BOARD_STORAGE_KEY = "circle:projects-list-view";
export const ORGANIZATION_PROJECTS_LIST_BOARD_STORAGE_KEY =
  "circle:organization-projects-view";

export function isListBoardView(value: string): value is ListBoardView {
  return (LIST_BOARD_VIEWS as readonly string[]).includes(value);
}

const memory = new Map<string, ListBoardView>();

export async function loadListBoardView(
  storageKey: string,
): Promise<ListBoardView> {
  const cached = memory.get(storageKey);
  if (cached) return cached;
  try {
    const stored = await SecureStore.getItemAsync(storageKey);
    if (stored && isListBoardView(stored)) {
      memory.set(storageKey, stored);
      return stored;
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_LIST_BOARD_VIEW;
}

export async function persistListBoardView(
  view: ListBoardView,
  storageKey: string,
): Promise<void> {
  memory.set(storageKey, view);
  try {
    await SecureStore.setItemAsync(storageKey, view);
  } catch {
    // ignore storage errors
  }
}

export function useListBoardView(storageKey: string): {
  view: ListBoardView;
  setView: (next: ListBoardView) => void;
  toggleView: () => void;
  ready: boolean;
} {
  const [view, setViewState] = useState<ListBoardView>(
    () => memory.get(storageKey) ?? DEFAULT_LIST_BOARD_VIEW,
  );
  const [ready, setReady] = useState(() => memory.has(storageKey));

  useEffect(() => {
    let cancelled = false;
    void loadListBoardView(storageKey).then((stored) => {
      if (cancelled) return;
      setViewState(stored);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const setView = useCallback(
    (next: ListBoardView) => {
      setViewState(next);
      void persistListBoardView(next, storageKey);
    },
    [storageKey],
  );

  const toggleView = useCallback(() => {
    setView(view === "board" ? "list" : "board");
  }, [setView, view]);

  return { view, setView, toggleView, ready };
}
