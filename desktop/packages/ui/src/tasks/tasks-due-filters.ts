import {
  formatLocalYmd,
  getTaskDueDateYmd,
  parseYmdLocal,
} from "./task-due-date.js";
import { migrateLegacyTaskStatus } from "./task-status.js";

export { getTaskDueDateYmd } from "./task-due-date.js";

export const TASKS_DUE_FILTERS = [
  "today",
  "tomorrow",
  "this-week",
  "next-week",
  "overdue",
] as const;

export type TasksDueFilter = (typeof TASKS_DUE_FILTERS)[number];

export const DEFAULT_TASKS_DUE_FILTER: TasksDueFilter = "today";

export const TASKS_DUE_FILTER_LABELS: Record<TasksDueFilter, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  "this-week": "This week",
  "next-week": "Next week",
  overdue: "Overdue",
};

/** Terminal statuses — excluded from the Overdue tab; other due filters include them. */
export const INACTIVE_TASK_STATUSES = [
  "completed",
  "canceled",
  "duplicated",
] as const;

function isInactiveTaskStatus(status: string | undefined): boolean {
  if (!status) return false;
  return (INACTIVE_TASK_STATUSES as readonly string[]).includes(
    migrateLegacyTaskStatus(status),
  );
}

export function isTasksDueFilter(value: string): value is TasksDueFilter {
  return (TASKS_DUE_FILTERS as readonly string[]).includes(value);
}

export function getTasksDueFilterLabel(filter: TasksDueFilter): string {
  return TASKS_DUE_FILTER_LABELS[filter];
}

export function getTasksDueFilterEmptyMessage(filter: TasksDueFilter): string {
  switch (filter) {
    case "today":
      return "No tasks due today.";
    case "tomorrow":
      return "No tasks due tomorrow.";
    case "this-week":
      return "No tasks due this week.";
    case "next-week":
      return "No tasks due next week.";
    case "overdue":
      return "No overdue tasks.";
  }
}

/** Default due date (YYYY-MM-DD) when creating a task under a due filter. */
export function getDefaultDueDateYmdForTasksDueFilter(
  filter: TasksDueFilter,
  referenceDate: Date = new Date(),
): string {
  const todayYmd = formatLocalYmd(referenceDate);

  switch (filter) {
    case "today":
      return todayYmd;
    case "tomorrow":
      return addCalendarDaysYmd(todayYmd, 1);
    case "this-week":
      return todayYmd;
    case "next-week":
      return todayYmd;
    case "overdue":
      return todayYmd;
  }
}

function addCalendarDaysYmd(ymd: string, days: number): string {
  const parsed = parseYmdLocal(ymd);
  if (!parsed) return ymd;
  parsed.setDate(parsed.getDate() + days);
  return formatLocalYmd(parsed);
}

function getMondayYmdOfWeek(referenceYmd: string): string {
  const date = parseYmdLocal(referenceYmd);
  if (!date) return referenceYmd;
  const weekday = date.getDay();
  const daysFromMonday = weekday === 0 ? -6 : 1 - weekday;
  date.setDate(date.getDate() + daysFromMonday);
  return formatLocalYmd(date);
}

export function taskDueDateMatchesFilter(
  dueDate: Date | number | string | null | undefined,
  filter: TasksDueFilter,
  referenceDate: Date = new Date(),
): boolean {
  const dueYmd = getTaskDueDateYmd(dueDate);
  if (!dueYmd) return false;
  const todayYmd = formatLocalYmd(referenceDate);

  switch (filter) {
    case "today":
      return dueYmd === todayYmd;
    case "tomorrow":
      return dueYmd === addCalendarDaysYmd(todayYmd, 1);
    case "this-week": {
      const weekStartYmd = getMondayYmdOfWeek(todayYmd);
      const weekEndYmd = addCalendarDaysYmd(weekStartYmd, 6);
      return dueYmd >= weekStartYmd && dueYmd <= weekEndYmd;
    }
    case "next-week": {
      const nextWeekStartYmd = addCalendarDaysYmd(
        getMondayYmdOfWeek(todayYmd),
        7,
      );
      const nextWeekEndYmd = addCalendarDaysYmd(nextWeekStartYmd, 6);
      return dueYmd >= nextWeekStartYmd && dueYmd <= nextWeekEndYmd;
    }
    case "overdue":
      return dueYmd < todayYmd;
  }
}

/**
 * Filter tasks by due-date window.
 * Completed / canceled / duplicated stay when their due date matches — except
 * on Overdue, which only shows still-open late tasks.
 */
export function filterTasksByDueFilter<
  T extends {
    dueDate: Date | number | string | null | undefined;
    status?: string;
    listKind?: string;
  },
>(tasks: readonly T[], filter: TasksDueFilter, referenceDate?: Date): T[] {
  return tasks.filter((task) => {
    if (filter === "overdue" && isInactiveTaskStatus(task.status)) {
      return false;
    }
    return taskDueDateMatchesFilter(task.dueDate, filter, referenceDate);
  });
}

export const TASKS_DUE_SEARCH_PARAM = "due";

export function parseTasksDueFilter(
  value: string | null | undefined,
): TasksDueFilter {
  const trimmed = value?.trim();
  if (trimmed && isTasksDueFilter(trimmed)) {
    return trimmed;
  }
  return DEFAULT_TASKS_DUE_FILTER;
}

export function buildTasksDueHref(
  due: TasksDueFilter = DEFAULT_TASKS_DUE_FILTER,
  view: "list" | "board" = "list",
  listPath = "/tasks",
): string {
  const params = new URLSearchParams();
  if (due !== DEFAULT_TASKS_DUE_FILTER) {
    params.set(TASKS_DUE_SEARCH_PARAM, due);
  }
  if (view === "board") {
    params.set("view", "board");
  }
  const query = params.toString();
  const root = listPath.replace(/\/+$/, "") || "/tasks";
  return query ? `${root}?${query}` : root;
}

export function isTasksDueListPathname(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/tasks";
}

export function parseTasksDueFilterFromLocation(
  pathname: string,
  search = "",
): TasksDueFilter | null {
  if (!isTasksDueListPathname(pathname)) {
    return null;
  }
  const query = search.startsWith("?") ? search.slice(1) : search;
  return parseTasksDueFilter(
    new URLSearchParams(query).get(TASKS_DUE_SEARCH_PARAM),
  );
}

export function getCanonicalTasksDueTabLocation(
  pathname: string,
  search = "",
): string | null {
  if (!isTasksDueListPathname(pathname)) {
    return null;
  }
  const due = parseTasksDueFilterFromLocation(pathname, search);
  return due ? buildTasksDueHref(due) : "/tasks";
}
