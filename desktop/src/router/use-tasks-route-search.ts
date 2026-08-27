import {
  parseListBoardView,
  TASKS_LIST_BOARD_STORAGE_KEY,
  type TasksDueFilter,
} from "@backsteros/ui";

import { validateTasksListSearch } from "./routes/tasks.route";
import { useShellLocation } from "../lib/shell-route-keep-alive";

/**
 * Typed `/tasks` search from the shell location (frozen while hidden)
 * so this hook does not subscribe to the live router off-route.
 */
export function useTasksRouteSearch(): {
  dueFilter: TasksDueFilter;
  view: "list" | "board";
} {
  const shell = useShellLocation();
  const searchStr = shell.searchStr ?? "";
  const raw = Object.fromEntries(
    new URLSearchParams(
      searchStr.startsWith("?") ? searchStr.slice(1) : searchStr,
    ).entries(),
  );
  const { due, view: viewParam } = validateTasksListSearch(raw);
  const view =
    viewParam ?? parseListBoardView(undefined, TASKS_LIST_BOARD_STORAGE_KEY);
  return { dueFilter: due, view };
}
