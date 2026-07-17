import {
  formatCalendarYmd,
  formatLocalYmd,
  getTaskCalendarTimezone,
  parseYmdLocal,
} from "@/lib/task-due-date";
import {
  PROJECT_TASK_VIEW_SEARCH_PARAM,
  type ProjectTaskView,
} from "@/lib/project-task-view";

function resolveCalendarTimezone(timeZone?: string): string {
  return timeZone ?? getTaskCalendarTimezone();
}

export const TASKS_DUE_SEARCH_PARAM = "due";

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

/** Task statuses excluded from the Tasks due-date lists (Today, Tomorrow, etc.). */
export const INACTIVE_TASK_STATUSES = [
  "completed",
  "canceled",
  "duplicated",
] as const;

/** Task statuses excluded from journal due-task views when completed tasks are included. */
export const JOURNAL_EXCLUDED_TASK_STATUSES = ["canceled", "duplicated"] as const;

export type TasksDueDateRange = {
  start: Date;
  end: Date;
};

export function isTasksDueFilter(value: string): value is TasksDueFilter {
  return (TASKS_DUE_FILTERS as readonly string[]).includes(value);
}

export function parseTasksDueFilter(
  value: string | null | undefined,
): TasksDueFilter {
  const trimmed = value?.trim();
  if (trimmed && isTasksDueFilter(trimmed)) {
    return trimmed;
  }

  return DEFAULT_TASKS_DUE_FILTER;
}

export function getTasksDueFilterLabel(filter: TasksDueFilter): string {
  return TASKS_DUE_FILTER_LABELS[filter];
}

export function getTasksDueListHref(
  dueFilter: TasksDueFilter = DEFAULT_TASKS_DUE_FILTER,
): string {
  return buildTasksDueHref({ due: dueFilter });
}

export function buildTasksDueHref(options?: {
  due?: TasksDueFilter;
  view?: ProjectTaskView;
}): string {
  const params = new URLSearchParams();
  const due = options?.due ?? DEFAULT_TASKS_DUE_FILTER;
  const view = options?.view;

  if (due !== DEFAULT_TASKS_DUE_FILTER) {
    params.set(TASKS_DUE_SEARCH_PARAM, due);
  }

  if (view === "board") {
    params.set(PROJECT_TASK_VIEW_SEARCH_PARAM, "board");
  }

  const query = params.toString();
  return query ? `/tasks?${query}` : "/tasks";
}

export function getTasksViewHref(
  dueFilter: TasksDueFilter = DEFAULT_TASKS_DUE_FILTER,
  options?: {
    view?: ProjectTaskView;
  },
): string {
  return buildTasksDueHref({
    due: dueFilter,
    view: options?.view,
  });
}

/** List routes only (`/tasks` or legacy `/tasks/today`), not task detail paths. */
export function isTasksDueListPathname(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/tasks") {
    return true;
  }

  return TASKS_DUE_FILTERS.some((filter) => path === `/tasks/${filter}`);
}

export function parseTasksDueFilterFromLocation(
  pathname: string,
  search = "",
): TasksDueFilter {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (TASKS_DUE_FILTERS.some((filter) => path === `/tasks/${filter}`)) {
    return parseTasksDueFilterFromPathname(pathname) ?? DEFAULT_TASKS_DUE_FILTER;
  }

  const query = search.startsWith("?") ? search.slice(1) : search;
  return parseTasksDueFilter(
    new URLSearchParams(query).get(TASKS_DUE_SEARCH_PARAM),
  );
}

export function isTasksPagePathname(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/tasks") {
    return true;
  }

  return TASKS_DUE_FILTERS.some(
    (filter) => path === `/tasks/${filter}` || path.startsWith(`/tasks/${filter}/`),
  );
}

export function parseTasksDueFilterFromPathname(
  pathname: string,
): TasksDueFilter | null {
  const match = pathname.match(/^\/tasks\/([^/]+)/);
  if (!match) {
    return null;
  }

  const candidate = match[1]!;
  if (isTasksDueFilter(candidate)) {
    return candidate;
  }

  return null;
}

/** Canonical tab location for tasks due-date list routes (`/tasks` + `?due=`). */
export function getCanonicalTasksDueTabLocation(
  pathname: string,
  search = "",
): string | null {
  if (!isTasksDueListPathname(pathname)) {
    return null;
  }

  const query = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  const pathFilter = parseTasksDueFilterFromPathname(pathname);
  const queryFilter = parseTasksDueFilter(params.get(TASKS_DUE_SEARCH_PARAM));
  const dueFilter = pathFilter ?? queryFilter;

  params.delete(TASKS_DUE_SEARCH_PARAM);
  if (dueFilter !== DEFAULT_TASKS_DUE_FILTER) {
    params.set(TASKS_DUE_SEARCH_PARAM, dueFilter);
  }

  const nextQuery = params.toString();
  return nextQuery ? `/tasks?${nextQuery}` : "/tasks";
}

export function appendTasksDueQuery(
  href: string,
  dueFilter: TasksDueFilter | null | undefined,
): string {
  if (!dueFilter) {
    return href;
  }

  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}${TASKS_DUE_SEARCH_PARAM}=${dueFilter}`;
}

function addLocalDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function addCalendarDaysYmd(ymd: string, days: number): string {
  const parsed = parseYmdLocal(ymd);
  if (!parsed) {
    return ymd;
  }

  parsed.setDate(parsed.getDate() + days);
  return formatLocalYmd(parsed);
}

function getMondayYmdOfWeek(referenceYmd: string): string {
  const date = parseYmdLocal(referenceYmd);
  if (!date) {
    return referenceYmd;
  }

  const weekday = date.getDay();
  const daysFromMonday = weekday === 0 ? -6 : 1 - weekday;
  date.setDate(date.getDate() + daysFromMonday);
  return formatLocalYmd(date);
}

function ymdHalfOpenRange(startYmd: string, days: number): TasksDueDateRange {
  const start = parseYmdLocal(startYmd) ?? new Date();
  const end =
    parseYmdLocal(addCalendarDaysYmd(startYmd, days)) ?? addLocalDays(start, days);
  return { start, end };
}

/** Span covering today through the end of next week (mobile due-task library query). */
export function getTasksDueLibraryQueryRange(
  referenceDate: Date = new Date(),
  timeZone?: string,
): TasksDueDateRange {
  const today = getTasksDueDateRange("today", referenceDate, timeZone);
  const nextWeek = getTasksDueDateRange("next-week", referenceDate, timeZone);
  return { start: today.start, end: nextWeek.end };
}

export function getTasksDueDateRange(
  filter: TasksDueFilter,
  referenceDate: Date = new Date(),
  timeZone?: string,
): TasksDueDateRange {
  const tz = resolveCalendarTimezone(timeZone);
  const todayYmd = formatCalendarYmd(referenceDate, tz);

  switch (filter) {
    case "today":
      return ymdHalfOpenRange(todayYmd, 1);
    case "tomorrow":
      return ymdHalfOpenRange(addCalendarDaysYmd(todayYmd, 1), 1);
    case "this-week":
      return ymdHalfOpenRange(getMondayYmdOfWeek(todayYmd), 7);
    case "next-week": {
      const startYmd = addCalendarDaysYmd(getMondayYmdOfWeek(todayYmd), 7);
      return ymdHalfOpenRange(startYmd, 7);
    }
  }
}

export function getDefaultDueDateYmdForTasksDueFilter(
  filter: TasksDueFilter,
  referenceDate: Date = new Date(),
  timeZone?: string,
): string {
  const todayYmd = formatCalendarYmd(referenceDate, resolveCalendarTimezone(timeZone));

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

/** Calendar date (`YYYY-MM-DD`) for a due value in the app timezone (Settings → General). */
export function getTaskDueDateYmd(
  dueDate: Date | number | string | null | undefined,
  timeZone?: string,
): string | null {
  const tz = resolveCalendarTimezone(timeZone);
  if (typeof dueDate === "string") {
    const trimmed = dueDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }

  const dueMs = taskDueTimestampMs(dueDate);
  if (dueMs == null) {
    return null;
  }

  return formatCalendarYmd(new Date(dueMs), tz);
}

export function taskDueTimestampMs(
  dueDate: Date | number | string | null | undefined,
): number | null {
  if (dueDate == null) {
    return null;
  }

  if (dueDate instanceof Date) {
    const ms = dueDate.getTime();
    return Number.isNaN(ms) ? null : ms;
  }

  if (typeof dueDate === "number" && Number.isFinite(dueDate)) {
    return dueDate;
  }

  if (typeof dueDate === "string") {
    const trimmed = dueDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const parsed = parseYmdLocal(trimmed);
      return parsed ? parsed.getTime() : null;
    }

    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/** True when a task's due calendar date matches the filter in the app timezone. */
export function taskDueDateMatchesFilter(
  dueDate: Date | number | string | null | undefined,
  filter: TasksDueFilter,
  referenceDate: Date = new Date(),
  timeZone?: string,
): boolean {
  const tz = resolveCalendarTimezone(timeZone);
  const dueYmd = getTaskDueDateYmd(dueDate, tz);
  if (!dueYmd) {
    return false;
  }

  const todayYmd = formatCalendarYmd(referenceDate, tz);

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

/** True when a due timestamp falls in a local half-open date range. */
export function taskDueTimestampInRange(
  dueMs: number,
  start: Date,
  end: Date,
): boolean {
  return dueMs >= start.getTime() && dueMs < end.getTime();
}

export function taskDueDateInRange(
  dueDate: Date | number | string | null | undefined,
  range: TasksDueDateRange,
  timeZone?: string,
): boolean {
  const tz = resolveCalendarTimezone(timeZone);
  const dueYmd = getTaskDueDateYmd(dueDate, tz);
  if (!dueYmd) {
    return false;
  }

  const startYmd = formatCalendarYmd(range.start, tz);
  const endYmd = formatCalendarYmd(new Date(range.end.getTime() - 1), tz);
  return dueYmd >= startYmd && dueYmd <= endYmd;
}

export function filterTasksByDueFilter<
  T extends { dueDate: Date | number | string | null | undefined },
>(
  tasks: T[],
  filter: TasksDueFilter,
  referenceDate: Date = new Date(),
  timeZone?: string,
): T[] {
  return tasks.filter((task) =>
    taskDueDateMatchesFilter(task.dueDate, filter, referenceDate, timeZone),
  );
}
