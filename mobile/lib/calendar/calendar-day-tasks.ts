import { getTaskDueDateYmd } from "../task-due-date";
import { migrateLegacyTaskStatus } from "../task-status";

const HIDDEN_CALENDAR_TASK_STATUSES = new Set(["canceled", "duplicated"]);

export type CalendarDayTaskRow = {
  id: string;
  title: string | null;
  status: string | null;
  due_date?: string | null;
  due_end_date?: string | null;
  habit_id?: string | null;
  project_name?: string | null;
  project_key?: string | null;
  number?: number | null;
};

function isHiddenCalendarTaskStatus(status: string | null | undefined): boolean {
  return HIDDEN_CALENDAR_TASK_STATUSES.has(migrateLegacyTaskStatus(status));
}

/** Tasks with a due date on the selected calendar day (excludes habit day tasks). */
export function tasksDueOnCalendarDay<T extends CalendarDayTaskRow>(
  tasks: readonly T[],
  ymd: string,
): T[] {
  return tasks.filter((task) => {
    if (task.habit_id?.trim()) return false;
    if (isHiddenCalendarTaskStatus(task.status)) return false;
    return getTaskDueDateYmd(task.due_date) === ymd;
  });
}

export function formatCalendarTaskTime(
  dueDate: string | null | undefined,
  dueEndDate: string | null | undefined,
): string {
  if (!dueDate) return "";
  const start = new Date(dueDate);
  if (Number.isNaN(start.getTime())) return "";
  const hasTimedEnd =
    dueEndDate &&
    !Number.isNaN(new Date(dueEndDate).getTime()) &&
    new Date(dueEndDate).getTime() > start.getTime();
  if (!hasTimedEnd) return "All day";
  const startLabel = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const end = new Date(dueEndDate!);
  const endLabel = end.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${startLabel} – ${endLabel}`;
}
