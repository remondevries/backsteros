/** Local calendar-day helpers mirroring BacksterOS desktop due-date UX. */

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

export const BACKSTEROS_NO_DUE_DATE_VALUE = "__no_due_date__";
export const BACKSTEROS_PICK_DUE_DATE_VALUE = "__pick_due_date__";

export type BacksterosDueDateUrgency = "overdue" | "due_today" | "due_soon";

export function formatLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseYmdLocal(ymd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
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
  if (typeof dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim())) {
    return dueDate.trim();
  }
  const date =
    dueDate instanceof Date
      ? dueDate
      : typeof dueDate === "number"
        ? new Date(dueDate)
        : new Date(dueDate);
  if (Number.isNaN(date.getTime())) return "";
  return formatLocalYmd(date);
}

/** Convert UI YMD / Date / ISO into an API datetime string. */
export function toApiDueDateIso(dueDate: Date | string | null | undefined): string | null {
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

export function formatTaskDueMetaLabel(
  dueDate: Date | number | string | null | undefined,
): string | null {
  const ymd = formatDueDateInputValue(dueDate);
  if (!ymd) return null;
  const date = parseYmdLocal(ymd);
  if (!date) return null;

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

export function getTaskDueDateUrgency(
  dueDate: Date | number | string | null | undefined,
  referenceDate: Date = new Date(),
  options?: { readonly status?: string | null },
): BacksterosDueDateUrgency | null {
  const status = options?.status ?? null;
  if (status === "completed" || status === "canceled" || status === "duplicated") {
    return null;
  }
  const ymd = formatDueDateInputValue(dueDate);
  if (!ymd) return null;
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

export type BacksterosDueDateOption = {
  readonly value: string;
  readonly label: string;
};

export function buildTaskDueDateDropdownOptions(
  currentDueDate: string | null | undefined,
  now = new Date(),
): readonly BacksterosDueDateOption[] {
  const today = formatLocalYmd(now);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = formatLocalYmd(tomorrowDate);
  const nextWeekDate = new Date(now);
  nextWeekDate.setDate(nextWeekDate.getDate() + 7);
  const nextWeek = formatLocalYmd(nextWeekDate);

  const presets: BacksterosDueDateOption[] = [
    { value: today, label: "Today" },
    { value: tomorrow, label: "Tomorrow" },
    { value: nextWeek, label: "In one week" },
  ];

  const current = formatDueDateInputValue(currentDueDate);
  if (current && !presets.some((entry) => entry.value === current)) {
    presets.unshift({
      value: current,
      label: formatTaskDueMetaLabel(current) ?? current,
    });
  }

  return [
    ...presets,
    { value: BACKSTEROS_PICK_DUE_DATE_VALUE, label: "Pick a date…" },
    { value: BACKSTEROS_NO_DUE_DATE_VALUE, label: "No due date" },
  ];
}
