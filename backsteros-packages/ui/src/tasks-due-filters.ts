import { formatLocalYmd, parseYmdLocal } from "./task-due-date.js";

export const TASKS_DUE_FILTERS = [
  "today",
  "tomorrow",
  "this-week",
  "next-week",
] as const;

export type TasksDueFilter = (typeof TASKS_DUE_FILTERS)[number];

export const DEFAULT_TASKS_DUE_FILTER: TasksDueFilter = "today";

export const TASKS_DUE_FILTER_LABELS: Record<TasksDueFilter, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  "this-week": "This week",
  "next-week": "Next week",
};

export const INACTIVE_TASK_STATUSES = [
  "completed",
  "canceled",
  "duplicated",
] as const;

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

export function getTaskDueDateYmd(
  dueDate: Date | number | string | null | undefined,
  timeZone?: string,
): string | null {
  if (dueDate == null) return null;
  if (typeof dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim())) {
    return dueDate.trim();
  }
  const date =
    dueDate instanceof Date
      ? dueDate
      : typeof dueDate === "number"
        ? new Date(dueDate)
        : new Date(dueDate);
  if (Number.isNaN(date.getTime())) return null;
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(date);
      const year = parts.find((part) => part.type === "year")?.value;
      const month = parts.find((part) => part.type === "month")?.value;
      const day = parts.find((part) => part.type === "day")?.value;
      if (year && month && day) return `${year}-${month}-${day}`;
    } catch {
      // Invalid stored timezone: fall back to the machine calendar.
    }
  }
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
  }
}

export function filterTasksByDueFilter<
  T extends {
    dueDate: Date | number | string | null | undefined;
    status?: string;
  },
>(tasks: readonly T[], filter: TasksDueFilter, referenceDate?: Date): T[] {
  return tasks.filter((task) => {
    if (
      task.status &&
      (INACTIVE_TASK_STATUSES as readonly string[]).includes(task.status)
    ) {
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
): string {
  const params = new URLSearchParams();
  if (due !== DEFAULT_TASKS_DUE_FILTER) {
    params.set(TASKS_DUE_SEARCH_PARAM, due);
  }
  if (view === "board") {
    params.set("view", "board");
  }
  const query = params.toString();
  return query ? `/tasks?${query}` : "/tasks";
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
