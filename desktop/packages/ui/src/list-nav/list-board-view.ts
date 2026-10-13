export const LIST_BOARD_VIEW_SEARCH_PARAM = "view";

export const LIST_BOARD_VIEWS = ["list", "board"] as const;

export type ListBoardView = (typeof LIST_BOARD_VIEWS)[number];

export const DEFAULT_LIST_BOARD_VIEW: ListBoardView = "list";

export const TASKS_LIST_BOARD_STORAGE_KEY = "circle:project-tasks-view";

export const PROJECTS_LIST_BOARD_STORAGE_KEY = "circle:projects-list-view";

export function isListBoardView(value: string): value is ListBoardView {
  return (LIST_BOARD_VIEWS as readonly string[]).includes(value);
}

export function parseListBoardView(
  value: string | null | undefined,
  storageKey: string,
): ListBoardView {
  const trimmed = value?.trim();
  if (trimmed && isListBoardView(trimmed)) {
    return trimmed;
  }

  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored && isListBoardView(stored)) {
        return stored;
      }
    } catch {
      // Ignore storage errors.
    }
  }

  return DEFAULT_LIST_BOARD_VIEW;
}

/** URL search param only — no localStorage fallback (for keyboard shortcut toggles). */
export function parseListBoardViewFromSearchParam(
  value: string | null | undefined,
): ListBoardView {
  return value?.trim() === "board" ? "board" : DEFAULT_LIST_BOARD_VIEW;
}

export function persistListBoardView(view: ListBoardView, storageKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, view);
  } catch {
    // Ignore storage errors.
  }
}

export function parseListBoardViewFromLocation(
  pathname: string,
  search = "",
  storageKey: string,
): ListBoardView {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const viewParam = new URLSearchParams(query).get(LIST_BOARD_VIEW_SEARCH_PARAM);
  return parseListBoardView(viewParam, storageKey);
}
