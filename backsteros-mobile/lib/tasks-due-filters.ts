/** Mirrors `@backsteros/ui` tasks-due-filters, plus an `all` option for mobile. */

import {
  endOfLocalDayIso,
  formatLocalYmd,
  getTaskDueDateYmd,
} from "./task-due-date";

export const TASKS_DUE_FILTERS = [
  "today",
  "tomorrow",
  "this-week",
  "next-week",
  "all",
] as const;

export type TasksDueFilter = (typeof TASKS_DUE_FILTERS)[number];

export const DEFAULT_TASKS_DUE_FILTER: TasksDueFilter = "all";

export const TASKS_DUE_FILTER_LABELS: Record<TasksDueFilter, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  "this-week": "This week",
  "next-week": "Next week",
  all: "All",
};

const INACTIVE_TASK_STATUSES = new Set([
  "completed",
  "canceled",
  "duplicated",
]);

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
    case "all":
      return "No tasks yet.";
  }
}

/**
 * Default due timestamp when composing from a tasks due-filter tab.
 * `all` → no due date; otherwise end-of-day ISO for the filter’s default day.
 */
export function getDefaultDueDateIsoForTasksDueFilter(
  filter: TasksDueFilter,
  referenceDate: Date = new Date(),
): string | null {
  if (filter === "all") return null;

  const todayYmd = formatLocalYmd(referenceDate);
  let ymd: string;
  switch (filter) {
    case "today":
      ymd = todayYmd;
      break;
    case "tomorrow":
      ymd = addCalendarDaysYmd(todayYmd, 1);
      break;
    case "this-week":
      ymd = todayYmd;
      break;
    case "next-week":
      ymd = addCalendarDaysYmd(getMondayYmdOfWeek(todayYmd), 7);
      break;
  }

  const [year, month, day] = ymd.split("-").map(Number);
  if (!year || !month || !day) return null;
  return endOfLocalDayIso(new Date(year, month - 1, day));
}

export function isTasksDueFilter(value: string): value is TasksDueFilter {
  return (TASKS_DUE_FILTERS as readonly string[]).includes(value);
}

function parseYmdLocal(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [year, month, day] = ymd.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function addCalendarDaysYmd(ymd: string, days: number): string {
  const parsed = parseYmdLocal(ymd);
  if (!parsed) return ymd;
  parsed.setDate(parsed.getDate() + days);
  return formatLocalYmd(parsed);
}

/** Monday-start week, same as desktop `@backsteros/ui`. */
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
  if (filter === "all") return true;

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
    due_date?: Date | number | string | null;
    status?: string | null;
  },
>(tasks: readonly T[], filter: TasksDueFilter, referenceDate?: Date): T[] {
  if (filter === "all") {
    return [...tasks];
  }
  return tasks.filter((task) => {
    if (task.status && INACTIVE_TASK_STATUSES.has(task.status)) {
      return false;
    }
    return taskDueDateMatchesFilter(task.due_date, filter, referenceDate);
  });
}
