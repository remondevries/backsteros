import {
  isoWeekNumber,
  startOfWeekYmd,
} from "../habits/habit-month-grid";

export type TimetrackingDayItem = {
  ymd: string;
  label: string;
  isToday: boolean;
};

export type TimetrackingWeekGroup = {
  weekKey: string;
  weekNumber: number;
  days: TimetrackingDayItem[];
};

export type TimetrackingMonthGroup = {
  monthKey: string;
  monthLabel: string;
  weeks: TimetrackingWeekGroup[];
};

export type TimetrackingPeriod =
  | { kind: "day"; ymd: string }
  | { kind: "week"; weekKey: string; weekNumber: number }
  | { kind: "month"; monthKey: string; monthLabel: string };

function parseYmd(ymd: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function parseMonthKey(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDaysYmd(ymd: string, delta: number): string {
  const parsed = parseYmd(ymd);
  if (!parsed) return ymd;
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  date.setUTCDate(date.getUTCDate() + delta);
  return formatYmd(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

export function todayYmd(now = new Date()): string {
  return formatYmd(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function timetrackingPeriodIncludesYmd(
  period: TimetrackingPeriod | null | undefined,
  ymd: string | null | undefined,
): boolean {
  if (!period || !ymd) return !period;
  if (period.kind === "day") return ymd === period.ymd;
  if (period.kind === "week") return startOfWeekYmd(ymd) === period.weekKey;
  return ymd.slice(0, 7) === period.monthKey;
}

export function formatTimetrackingPeriodLabel(period: TimetrackingPeriod): string {
  if (period.kind === "day") return dayLabel(period.ymd);
  if (period.kind === "week") return `Week ${period.weekNumber}`;
  return period.monthLabel;
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;
const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

function dayLabel(ymd: string): string {
  const parsed = parseYmd(ymd);
  if (!parsed) return ymd;
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  return `${WEEKDAY_SHORT[date.getUTCDay()]} ${parsed.day} ${MONTH_SHORT[parsed.month - 1]} ${parsed.year}`;
}

function monthLabel(year: number, month: number): string {
  return `${MONTH_LONG[month - 1]} ${year}`;
}

export function buildTimetrackingDayGroups(options?: {
  endYmd?: string;
  monthsBack?: number;
  todayYmd?: string;
}): TimetrackingMonthGroup[] {
  const endYmd = options?.endYmd ?? todayYmd();
  const today = options?.todayYmd ?? todayYmd();
  const monthsBack = Math.max(1, options?.monthsBack ?? 3);
  const end = parseYmd(endYmd);
  if (!end) return [];

  const startMonthIndex = end.year * 12 + (end.month - 1) - (monthsBack - 1);
  const startYear = Math.floor(startMonthIndex / 12);
  const startMonth = (startMonthIndex % 12) + 1;
  let cursor = formatYmd(startYear, startMonth, 1);
  if (cursor > endYmd) return [];

  const days: TimetrackingDayItem[] = [];
  while (cursor <= endYmd) {
    days.push({
      ymd: cursor,
      label: dayLabel(cursor),
      isToday: cursor === today,
    });
    cursor = addDaysYmd(cursor, 1);
  }
  days.reverse();

  const months: TimetrackingMonthGroup[] = [];
  let currentMonth: TimetrackingMonthGroup | null = null;
  let currentWeek: TimetrackingWeekGroup | null = null;

  for (const day of days) {
    const parsed = parseYmd(day.ymd);
    if (!parsed) continue;
    const monthKey = `${parsed.year}-${String(parsed.month).padStart(2, "0")}`;
    if (!currentMonth || currentMonth.monthKey !== monthKey) {
      currentMonth = {
        monthKey,
        monthLabel: monthLabel(parsed.year, parsed.month),
        weeks: [],
      };
      months.push(currentMonth);
      currentWeek = null;
    }

    const weekKey = startOfWeekYmd(day.ymd);
    const weekNumber = isoWeekNumber(day.ymd);
    if (!currentWeek || currentWeek.weekKey !== weekKey) {
      currentWeek = { weekKey, weekNumber, days: [] };
      currentMonth.weeks.push(currentWeek);
    }
    currentWeek.days.push(day);
  }

  return months;
}

export function periodForYmd(ymd: string): TimetrackingPeriod {
  return { kind: "day", ymd };
}

export function periodForWeekKey(weekKey: string): TimetrackingPeriod {
  return {
    kind: "week",
    weekKey,
    weekNumber: isoWeekNumber(weekKey),
  };
}

export function periodForMonthKey(monthKey: string): TimetrackingPeriod | null {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return null;
  return {
    kind: "month",
    monthKey,
    monthLabel: monthLabel(parsed.year, parsed.month),
  };
}
