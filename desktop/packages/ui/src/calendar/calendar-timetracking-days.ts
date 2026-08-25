import {
  isoWeekNumber,
  startOfWeekYmd,
} from "../habits/habit-month-grid.js";

/** Search param for the selected day while in Timetracking mode. */
export const CALENDAR_TIMETRACKING_DATE_PARAM = "date";
/** Search param for a selected ISO week (Monday `YYYY-MM-DD`). */
export const CALENDAR_TIMETRACKING_WEEK_PARAM = "week";
/** Search param for a selected month (`YYYY-MM`). */
export const CALENDAR_TIMETRACKING_MONTH_PARAM = "month";

/** localStorage key for the Timetracking entry detail rail width. */
export const CALENDAR_TIMETRACKING_DETAIL_PANEL_WIDTH_KEY =
  "calendar-timetracking-detail-panel-width";

export type TimetrackingDayItem = {
  ymd: string;
  /** Full local date label, e.g. "Tue 25 Aug 2026". */
  label: string;
  isToday: boolean;
};

export type TimetrackingWeekGroup = {
  /** Stable key: Monday YMD of the week. */
  weekKey: string;
  weekNumber: number;
  days: TimetrackingDayItem[];
};

export type TimetrackingMonthGroup = {
  /** Stable key: `YYYY-MM` */
  monthKey: string;
  monthLabel: string;
  weeks: TimetrackingWeekGroup[];
};

/** Selected range for the Timetracking main list. */
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

export function parseTimetrackingDateParam(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim() ?? "";
  return parseYmd(normalized) ? normalized : null;
}

export function parseTimetrackingWeekParam(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim() ?? "";
  if (!parseYmd(normalized)) return null;
  return startOfWeekYmd(normalized);
}

export function parseTimetrackingMonthParam(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim() ?? "";
  return parseMonthKey(normalized) ? normalized : null;
}

export function readTimetrackingDateFromSearch(search: string): string | null {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  return parseTimetrackingDateParam(
    params.get(CALENDAR_TIMETRACKING_DATE_PARAM),
  );
}

/**
 * Resolve the active Timetracking period from URL search params.
 * Week/month take precedence over day when present.
 */
export function readTimetrackingPeriodFromSearch(
  search: string,
  options?: { fallbackToday?: boolean },
): TimetrackingPeriod | null {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const weekKey = parseTimetrackingWeekParam(
    params.get(CALENDAR_TIMETRACKING_WEEK_PARAM),
  );
  if (weekKey) {
    return {
      kind: "week",
      weekKey,
      weekNumber: isoWeekNumber(weekKey),
    };
  }
  const monthKey = parseTimetrackingMonthParam(
    params.get(CALENDAR_TIMETRACKING_MONTH_PARAM),
  );
  if (monthKey) {
    const parsed = parseMonthKey(monthKey)!;
    return {
      kind: "month",
      monthKey,
      monthLabel: monthLabel(parsed.year, parsed.month),
    };
  }
  const ymd =
    parseTimetrackingDateParam(params.get(CALENDAR_TIMETRACKING_DATE_PARAM)) ??
    (options?.fallbackToday === false ? null : todayYmd());
  if (!ymd) return null;
  return { kind: "day", ymd };
}

/** Whether a schedule `YYYY-MM-DD` falls in the selected period. */
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

const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
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

/**
 * Build month → week → day groups for the Timetracking side panel.
 * Covers `monthsBack` full months ending at `endYmd` (inclusive), newest first.
 */
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

  // Newest first so today stays near the top of the panel.
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
      currentWeek = {
        weekKey,
        weekNumber,
        days: [],
      };
      currentMonth.weeks.push(currentWeek);
    }
    currentWeek.days.push(day);
  }

  return months;
}
