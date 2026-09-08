import { migrateLegacyTaskStatus } from "./task-status.js";

export {
  formatLocalYmd,
  getTaskDueDateYmd,
  parseYmdLocal,
} from "@backsteros/contracts";

import { formatLocalYmd, parseYmdLocal } from "@backsteros/contracts";

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

export function formatDueDateInputValue(
  dueDate: Date | number | string | null | undefined,
): string {
  if (dueDate == null) return "";

  const date =
    dueDate instanceof Date
      ? dueDate
      : typeof dueDate === "number"
        ? new Date(dueDate)
        : new Date(dueDate);

  if (Number.isNaN(date.getTime())) return "";

  return formatLocalYmd(date);
}

/**
 * Local schedule stamp for dense lists: `YYYY-MM-DD @ HH:MM:SS`.
 */
export function formatDueDateTimeStamp(
  dueDate: Date | number | string | null | undefined,
): string {
  if (dueDate == null) return "";

  const date =
    dueDate instanceof Date
      ? dueDate
      : typeof dueDate === "number"
        ? new Date(dueDate)
        : new Date(dueDate);

  if (Number.isNaN(date.getTime())) return "";

  const ymd = formatLocalYmd(date);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${ymd} @ ${hh}:${mm}:${ss}`;
}

export function parseDueDateInputValue(ymd: string): Date | null {
  return parseYmdLocal(ymd.trim().slice(0, 10));
}

/**
 * Normalize UI due dates (YMD calendar strings, Date, or ISO) to values that
 * satisfy API `z.string().datetime()` fields. Compose and dropdowns store
 * local `YYYY-MM-DD`; posting that raw string yields a 400 Zod error.
 */
export function toApiDueDateIso(
  dueDate: Date | string | null | undefined,
): string | null {
  if (dueDate == null) return null;
  if (dueDate instanceof Date) {
    return Number.isNaN(dueDate.getTime()) ? null : dueDate.toISOString();
  }
  const trimmed = dueDate.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const local = parseYmdLocal(trimmed);
    return local ? local.toISOString() : null;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export type TaskDueDateUrgency = "overdue" | "due_today" | "due_soon";

const INACTIVE_DUE_DATE_STATUSES = new Set([
  "completed",
  "canceled",
  "duplicated",
]);

/** Terminal statuses — no overdue / due-soon colors (keep due dates muted). */
export function shouldShowTaskDueDateUrgency(
  status: string | null | undefined,
): boolean {
  if (status == null || status === "") {
    return true;
  }

  return !INACTIVE_DUE_DATE_STATUSES.has(migrateLegacyTaskStatus(status));
}

export function getTaskDueDateUrgency(
  dueDate: Date | number | string | null | undefined,
  referenceDate: Date = new Date(),
  options?: { status?: string | null },
): TaskDueDateUrgency | null {
  if (!shouldShowTaskDueDateUrgency(options?.status)) {
    return null;
  }

  if (dueDate == null) return null;

  let ymd: string;
  if (typeof dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim())) {
    ymd = dueDate.trim();
  } else {
    ymd = formatDueDateInputValue(dueDate);
    if (!ymd) return null;
  }

  const parsed = parseYmdLocal(ymd);
  if (!parsed) return null;

  const refStart = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );
  const diffDays = Math.round(
    (parsed.getTime() - refStart.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "due_today";
  if (diffDays <= 3) return "due_soon";
  return null;
}

export function formatTaskDueMetaLabel(
  dueDate: Date | number | string | null | undefined,
): string | null {
  if (dueDate == null) return null;

  let ymd: string;
  if (typeof dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim())) {
    ymd = dueDate.trim();
  } else {
    const date =
      dueDate instanceof Date
        ? dueDate
        : typeof dueDate === "number"
          ? new Date(dueDate)
          : new Date(dueDate);
    if (Number.isNaN(date.getTime())) return null;
    ymd = formatLocalYmd(date);
  }

  const parsed = parseYmdLocal(ymd);
  if (!parsed) return null;

  const today = formatLocalYmd(new Date());
  if (ymd === today) return "Today";

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (ymd === formatLocalYmd(tomorrow)) return "Tomorrow";

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (ymd === formatLocalYmd(yesterday)) return "Yesterday";

  return `${MONTH_NAMES[parsed.getMonth()]} ${parsed.getDate()}`;
}
