import {
  listTimetrackingChartDayYmds,
  type TimetrackingPeriod,
} from "./calendar-timetracking-days.js";
import type { TimetrackingEntry } from "./calendar-timetracking-entries.js";

export type TimetrackingHoursChartPoint = {
  /** Day key (`YYYY-MM-DD`) used as the Nivo x value. */
  x: string;
  /** Short axis tick (weekday for weeks, day number for months). */
  label: string;
  /** Richer tooltip heading. */
  tooltipLabel: string;
  /** Hours tracked that day (seconds / 3600). */
  y: number;
};

export type TimetrackingHoursChartSeries = {
  id: "hours";
  data: TimetrackingHoursChartPoint[];
};

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

function parseYmd(ymd: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function formatAxisLabel(ymd: string, period: TimetrackingPeriod): string {
  const parsed = parseYmd(ymd);
  if (!parsed) return ymd;
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  if (period.kind === "month") {
    return String(parsed.day);
  }
  return WEEKDAY_SHORT[date.getUTCDay()] ?? String(parsed.day);
}

function formatTooltipLabel(ymd: string): string {
  const parsed = parseYmd(ymd);
  if (!parsed) return ymd;
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  const weekday = WEEKDAY_SHORT[date.getUTCDay()] ?? "";
  return `${weekday} ${parsed.day} ${MONTH_SHORT[parsed.month - 1]} ${parsed.year}`;
}

/**
 * Daily hours series for the selected Timetracking period.
 * Buckets by schedule date (`groupDateYmd`); days with no entries are 0.
 */
export function buildTimetrackingHoursChartSeries(input: {
  entries: readonly TimetrackingEntry[];
  period: TimetrackingPeriod | null | undefined;
}): TimetrackingHoursChartSeries | null {
  const { entries, period } = input;
  if (!period) return null;
  const dayYmds = listTimetrackingChartDayYmds(period);
  if (dayYmds.length === 0) return null;

  const secondsByDay = new Map<string, number>();
  for (const ymd of dayYmds) secondsByDay.set(ymd, 0);

  for (const entry of entries) {
    const ymd = entry.groupDateYmd;
    if (!ymd || !secondsByDay.has(ymd)) continue;
    secondsByDay.set(
      ymd,
      (secondsByDay.get(ymd) ?? 0) + Math.max(0, entry.trackedDurationSeconds),
    );
  }

  return {
    id: "hours",
    data: dayYmds.map((ymd) => {
      const seconds = secondsByDay.get(ymd) ?? 0;
      return {
        x: ymd,
        label: formatAxisLabel(ymd, period),
        tooltipLabel: formatTooltipLabel(ymd),
        y: seconds / 3600,
      };
    }),
  };
}

export function timetrackingHoursChartHasActivity(
  series: TimetrackingHoursChartSeries | null | undefined,
): boolean {
  if (!series) return false;
  return series.data.some((point) => point.y > 0);
}

/** Axis / tooltip hours label — compact, e.g. `2.5h` or `45m`. */
export function formatTimetrackingChartHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0h";
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes}m`;
  }
  const rounded = hours >= 10 ? Math.round(hours) : Math.round(hours * 10) / 10;
  return `${rounded}h`;
}
