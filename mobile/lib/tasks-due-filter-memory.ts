import {
  DEFAULT_TASKS_DUE_FILTER,
  type TasksDueFilter,
} from "./tasks-due-filters";

/** In-memory last Tasks due-filter tab — survives list remounts after opening a task. */
let rememberedDueFilter: TasksDueFilter = DEFAULT_TASKS_DUE_FILTER;

export function rememberTasksDueFilter(filter: TasksDueFilter): void {
  rememberedDueFilter = filter;
}

export function getRememberedTasksDueFilter(): TasksDueFilter {
  return rememberedDueFilter;
}
