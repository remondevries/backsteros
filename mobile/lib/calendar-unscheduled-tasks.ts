import { migrateLegacyTaskStatus } from "./task-status";

const HIDDEN_CALENDAR_TASK_STATUSES = new Set(["canceled", "duplicated"]);

const TERMINAL_CALENDAR_STATUSES = new Set([
  "completed",
  "canceled",
  "duplicated",
]);

export type CalendarUnscheduledTaskRow = {
  id: string;
  title: string | null;
  status: string | null;
  due_date?: string | null;
  habit_id?: string | null;
  project_name?: string | null;
  project_key?: string | null;
  display_id?: string | null;
  sort_order?: number | null;
};

function isHabitLinkedTask(task: CalendarUnscheduledTaskRow): boolean {
  return Boolean(task.habit_id?.trim());
}

function isTerminalCalendarTaskStatus(status: string | null | undefined): boolean {
  return TERMINAL_CALENDAR_STATUSES.has(migrateLegacyTaskStatus(status));
}

function isHiddenCalendarTaskStatus(status: string | null | undefined): boolean {
  return HIDDEN_CALENDAR_TASK_STATUSES.has(migrateLegacyTaskStatus(status));
}

function shouldIncludeTaskInCalendarUi(task: CalendarUnscheduledTaskRow): boolean {
  if (isHiddenCalendarTaskStatus(task.status)) return false;
  if (isHabitLinkedTask(task)) return false;
  return true;
}

/** Open tasks without a due date — candidates for scheduling on the calendar. */
export function unscheduledCalendarTasks<T extends CalendarUnscheduledTaskRow>(
  tasks: readonly T[],
): T[] {
  return tasks.filter(
    (task) =>
      shouldIncludeTaskInCalendarUi(task) &&
      (task.due_date == null || task.due_date === "") &&
      !isTerminalCalendarTaskStatus(task.status),
  );
}
