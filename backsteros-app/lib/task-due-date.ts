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

export function formatLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

import { DEFAULT_APP_TIMEZONE } from "@/lib/settings/app-timezone";
import { getClientAppTimezone } from "@/lib/settings/app-timezone-client";

/** IANA timezone for calendar due dates (Settings → General on server; same on client). */
export function getTaskCalendarTimezone(): string {
  if (typeof window !== "undefined") {
    return getClientAppTimezone();
  }

  return DEFAULT_APP_TIMEZONE;
}

/** Calendar `YYYY-MM-DD` for a timestamp in the task due-date timezone. */
export function formatCalendarYmd(
  date: Date,
  timeZone = getTaskCalendarTimezone(),
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function parseYmdLocal(ymd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(year, month - 1, day);
}

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

export function parseDueDateInputValue(ymd: string): Date | null {
  const trimmed = ymd.trim();
  if (!trimmed) return null;
  return parseYmdLocal(trimmed);
}

export function getLocalDayRange(referenceDate: Date = new Date()) {
  const start = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );
  const end = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate() + 1,
  );

  return { start, end };
}

export type TaskDueDateUrgency = "due_today" | "due_soon";

/** Completed work should not keep overdue / due-soon calendar colors. */
export function shouldShowTaskDueDateUrgency(
  status: string | null | undefined,
): boolean {
  if (status == null || status === "") {
    return true;
  }

  return status !== "completed";
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

  if (diffDays <= 0) return "due_today";
  if (diffDays <= 3) return "due_soon";
  return null;
}

export function formatTaskDueMetaLabel(
  dueDate: Date | number | string | null | undefined,
): string | null {
  if (dueDate == null) return null;

  const date =
    dueDate instanceof Date
      ? dueDate
      : typeof dueDate === "number"
        ? new Date(dueDate)
        : new Date(dueDate);

  if (Number.isNaN(date.getTime())) return null;

  const ymd = formatLocalYmd(date);
  const today = formatLocalYmd(new Date());

  if (ymd === today) return "Today";

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (ymd === formatLocalYmd(tomorrow)) return "Tomorrow";

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (ymd === formatLocalYmd(yesterday)) return "Yesterday";

  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
}
