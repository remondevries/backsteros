import {
  DEFAULT_TASKS_DUE_FILTER,
  isTasksDueFilter,
  type TasksDueFilter,
} from "@backsteros/ui";

/** Browser URL for the tasks list. */
export const TASKS_LIST_PATH = "/tasks" as const;

/** TanStack route id (`shell` layout + `tasks` segment). */
export const TASKS_LIST_ROUTE = "/shell/tasks" as const;

export type TasksListSearch = {
  due: TasksDueFilter;
  view?: "list" | "board";
};

/** Typed search for `/tasks` — replaces manual URLSearchParams parsing (5b spike). */
export function validateTasksListSearch(
  search: Record<string, unknown>,
): TasksListSearch {
  const dueRaw = typeof search.due === "string" ? search.due.trim() : "";
  const due = isTasksDueFilter(dueRaw) ? dueRaw : DEFAULT_TASKS_DUE_FILTER;
  const view = search.view === "board" ? ("board" as const) : undefined;
  return { due, view };
}
