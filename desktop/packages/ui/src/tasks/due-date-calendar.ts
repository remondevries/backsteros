import { formatLocalYmd, parseYmdLocal } from "./task-due-date.js";

export const DUE_DATE_CALENDAR_WEEKDAY_LABELS = [
  "Mo",
  "Tu",
  "We",
  "Th",
  "Fr",
  "Sa",
  "Su",
] as const;

const MONTH_TITLE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

/** Monday-start month grid: 6 weeks × 7 days (null = outside month). */
export type DueDateCalendarCell = {
  ymd: string;
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
};

export function shiftCalendarMonth(ymdOrDate: string | Date, delta: number): Date {
  const base =
    typeof ymdOrDate === "string"
      ? (parseYmdLocal(ymdOrDate.slice(0, 7) + "-01") ?? new Date())
      : new Date(ymdOrDate.getFullYear(), ymdOrDate.getMonth(), 1);
  return new Date(base.getFullYear(), base.getMonth() + delta, 1);
}

export function formatCalendarMonthTitle(month: Date): string {
  return MONTH_TITLE_FORMATTER.format(
    new Date(month.getFullYear(), month.getMonth(), 1),
  );
}

export function buildDueDateCalendarGrid(
  month: Date,
  selectedYmd: string | null | undefined,
  today: Date = new Date(),
): DueDateCalendarCell[] {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstOfMonth = new Date(year, monthIndex, 1);
  // JS Sunday=0 … Saturday=6 → Monday-start offset 0…6
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const start = new Date(year, monthIndex, 1 - mondayOffset);
  const todayYmd = formatLocalYmd(today);
  const selected = (selectedYmd ?? "").trim().slice(0, 10) || null;

  const cells: DueDateCalendarCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + i,
    );
    const ymd = formatLocalYmd(date);
    cells.push({
      ymd,
      day: date.getDate(),
      inCurrentMonth: date.getMonth() === monthIndex,
      isToday: ymd === todayYmd,
      isSelected: selected != null && ymd === selected,
    });
  }
  return cells;
}
