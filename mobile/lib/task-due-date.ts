/** Local calendar-day helpers for Today filtering (shared YMD via contracts). */

import {
  formatLocalYmd,
  getTaskDueDateYmd,
  parseYmdLocal,
} from "@backsteros/contracts";

export { formatLocalYmd, getTaskDueDateYmd, parseYmdLocal };

const INACTIVE_STATUSES = new Set(["completed", "canceled", "duplicated"]);

/** Tasks whose due calendar date matches a journal `YYYY-MM-DD` slug. */
export function filterTasksDueOnJournalDate<
  T extends { due_date?: Date | number | string | null },
>(tasks: readonly T[], dateSlug: string, timeZone?: string): T[] {
  return tasks.filter(
    (task) => getTaskDueDateYmd(task.due_date, timeZone) === dateSlug,
  );
}

export function isTaskDueToday(
  dueDate: Date | number | string | null | undefined,
  referenceDate: Date = new Date(),
): boolean {
  const dueYmd = getTaskDueDateYmd(dueDate);
  if (!dueYmd) return false;
  return dueYmd === formatLocalYmd(referenceDate);
}

export function isActiveTaskStatus(status: string | null | undefined): boolean {
  if (status == null || status === "") return true;
  return !INACTIVE_STATUSES.has(status);
}

/** End of local calendar day as ISO — for GET /api/v1/tasks/due?before= */
export function endOfLocalDayIso(referenceDate: Date = new Date()): string {
  const end = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
    23,
    59,
    59,
    999,
  );
  return end.toISOString();
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export type TaskDueDateUrgency = "overdue" | "due_today" | "due_soon";

export function formatDueLabel(
  dueDate: Date | number | string | null | undefined,
): string {
  return formatTaskDueMetaLabel(dueDate) ?? "—";
}

/** Same relative labels as desktop `@backsteros/ui` `formatTaskDueMetaLabel`. */
export function formatTaskDueMetaLabel(
  dueDate: Date | number | string | null | undefined,
): string | null {
  const ymd = getTaskDueDateYmd(dueDate);
  if (!ymd) return null;
  if (ymd === formatLocalYmd(new Date())) return "Today";

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (ymd === formatLocalYmd(tomorrow)) return "Tomorrow";

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (ymd === formatLocalYmd(yesterday)) return "Yesterday";

  const [, month, day] = ymd.split("-").map(Number);
  if (!month || !day) return ymd;
  return `${MONTH_NAMES[month - 1]} ${day}`;
}

export function getTaskDueDateUrgency(
  dueDate: Date | number | string | null | undefined,
  referenceDate: Date = new Date(),
  options?: { status?: string | null },
): TaskDueDateUrgency | null {
  const status = options?.status;
  if (
    status === "completed" ||
    status === "canceled" ||
    status === "duplicated"
  ) {
    return null;
  }
  const ymd = getTaskDueDateYmd(dueDate);
  if (!ymd) return null;

  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dueStart = new Date(y, m - 1, d);
  const refStart = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );
  const diffDays = Math.round(
    (dueStart.getTime() - refStart.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "due_today";
  if (diffDays <= 3) return "due_soon";
  return null;
}
