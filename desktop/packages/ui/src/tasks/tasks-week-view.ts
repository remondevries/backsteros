import { formatLocalYmd, parseYmdLocal } from "./task-due-date.js";
import { groupTasksByStatus } from "./group-tasks-by-status.js";
import { getTaskDueDateYmd, type TasksDueFilter } from "./tasks-due-filters.js";
import type { TaskStatus } from "./task-status.js";
import { migrateLegacyTaskStatus } from "./task-status.js";

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

export function isTasksDueWeekFilter(
  filter: TasksDueFilter,
): filter is "this-week" | "next-week" {
  return filter === "this-week" || filter === "next-week";
}

export type TasksWeekDay = {
  ymd: string;
  label: string;
};

export function getTasksDueFilterWeekDays(
  filter: TasksDueFilter,
  referenceDate: Date = new Date(),
): TasksWeekDay[] {
  if (!isTasksDueWeekFilter(filter)) {
    return [];
  }

  const todayYmd = formatLocalYmd(referenceDate);
  const weekStartYmd =
    filter === "this-week"
      ? getMondayYmdOfWeek(todayYmd)
      : addCalendarDaysYmd(getMondayYmdOfWeek(todayYmd), 7);

  return Array.from({ length: 7 }, (_, index) => {
    const ymd = addCalendarDaysYmd(weekStartYmd, index);
    return {
      ymd,
      label: formatTasksWeekDayColumnLabel(ymd, referenceDate),
    };
  });
}

export function formatTasksWeekDayColumnLabel(
  ymd: string,
  referenceDate: Date = new Date(),
): string {
  const date = parseYmdLocal(ymd);
  if (!date) return ymd;

  const todayYmd = formatLocalYmd(referenceDate);
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const day = date.getDate();

  if (ymd === todayYmd) {
    return `Today · ${weekday} ${day}`;
  }

  return `${weekday} ${day}`;
}

export function formatTasksWeekDayListLabel(
  ymd: string,
  referenceDate: Date = new Date(),
): string {
  const date = parseYmdLocal(ymd);
  if (!date) return ymd;

  const todayYmd = formatLocalYmd(referenceDate);
  const formatted = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  if (ymd === todayYmd) {
    return `Today · ${formatted}`;
  }

  return formatted;
}

export function weekDayCollapseKey(dayYmd: string): string {
  return `day:${dayYmd}`;
}

export function weekDayStatusCollapseKey(
  dayYmd: string,
  status: TaskStatus | string,
): string {
  return `day:${dayYmd}:status:${migrateLegacyTaskStatus(String(status))}`;
}

export function resolveTaskWeekDayKey<
  T extends { dueDate: Date | number | string | null | undefined },
>(task: T, weekDayYmds: readonly string[]): string {
  const dueYmd = getTaskDueDateYmd(task.dueDate);
  if (dueYmd && weekDayYmds.includes(dueYmd)) {
    return dueYmd;
  }
  return weekDayYmds[0] ?? "";
}

export type TasksWeekDayGroup<T> = {
  dayYmd: string;
  label: string;
  tasks: T[];
};

export function groupTasksByWeekDay<
  T extends { dueDate: Date | number | string | null | undefined },
>(tasks: readonly T[], weekDays: readonly TasksWeekDay[]): TasksWeekDayGroup<T>[] {
  const weekDayYmds = weekDays.map((day) => day.ymd);
  const buckets = new Map<string, T[]>(
    weekDayYmds.map((ymd) => [ymd, [] as T[]]),
  );

  for (const task of tasks) {
    const key = resolveTaskWeekDayKey(task, weekDayYmds);
    if (!key) continue;
    buckets.get(key)?.push(task);
  }

  return weekDays.map((day) => ({
    dayYmd: day.ymd,
    label: day.label,
    tasks: buckets.get(day.ymd) ?? [],
  }));
}

export type TasksWeekDayStatusSection<T> = {
  status: TaskStatus;
  label: string;
  tasks: T[];
};

export function groupTasksByWeekDayStatus<
  T extends {
    dueDate: Date | number | string | null | undefined;
    status: string;
  },
>(tasks: readonly T[], weekDays: readonly TasksWeekDay[]) {
  return groupTasksByWeekDay(tasks, weekDays).map((day) => ({
    ...day,
    statusGroups: groupTasksByStatus(day.tasks, { includeEmpty: false }),
  }));
}

export type TaskDayColumnReorderRequest = {
  taskId: string;
  dayYmd: string;
  beforeTaskId: string | null;
};

export type TaskLikeForDayReorder = {
  id: string;
  dueDate: Date | number | string | null | undefined;
  sortOrder?: number;
};

export function taskDayColumnReorderPatches(
  tasks: readonly TaskLikeForDayReorder[],
  request: TaskDayColumnReorderRequest,
  weekDayYmds: readonly string[],
): Array<{ id: string; sortOrder: number }> {
  const dayTasks = tasks
    .filter((task) => resolveTaskWeekDayKey(task, weekDayYmds) === request.dayYmd)
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));

  const movingTask = dayTasks.find((task) => task.id === request.taskId);
  if (!movingTask) {
    return [];
  }

  const withoutMoving = dayTasks.filter((task) => task.id !== request.taskId);
  let nextOrder: TaskLikeForDayReorder[];

  if (!request.beforeTaskId) {
    nextOrder = [...withoutMoving, movingTask];
  } else {
    const insertIndex = withoutMoving.findIndex(
      (task) => task.id === request.beforeTaskId,
    );
    nextOrder =
      insertIndex === -1
        ? [...withoutMoving, movingTask]
        : [
            ...withoutMoving.slice(0, insertIndex),
            movingTask,
            ...withoutMoving.slice(insertIndex),
          ];
  }

  return nextOrder.map((task, index) => ({
    id: task.id,
    sortOrder: index * 10,
  }));
}
