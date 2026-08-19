import type { HabitCadence } from "@backsteros/contracts";

import { isHabitDueYmd } from "./habit-cadence.js";

export type HabitGridCellState =
  | "empty"
  | "future"
  | "scheduled"
  | "completed"
  | "canceled"
  | "heat";

export type HabitSortGranularity = "weekly" | "monthly" | "yearly";

export type HabitDayHeatTone = "completed" | "canceled" | "mixed";

export type HabitDayHeatLevel = 1 | 2 | 3 | 4;

export type HabitDayHeatEntry = {
  title: string;
  status: "completed" | "canceled";
};

/** GitHub-style contribution intensity for the All habits grid. */
export type HabitDayHeat = {
  tone: HabitDayHeatTone;
  level: HabitDayHeatLevel;
  completed: number;
  canceled: number;
  entries: HabitDayHeatEntry[];
};

export type HabitGridCell = {
  /** Stable key for the period (day). */
  id: string;
  /** Representative calendar day used for scroll/focus. */
  ymd: string;
  day: number;
  state: HabitGridCellState;
  title?: string;
  heat?: HabitDayHeat | null;
};

export type HabitMonthGrid = {
  year: number;
  month: number;
  label: string;
  /** Optional trailing label (e.g. month name on weekly rows). */
  secondaryLabel?: string;
  daysInMonth: number;
  cells: HabitGridCell[];
};

export type HabitGridInstance = {
  dueYmd: string;
  status: string;
  taskId?: string | null;
  /** Habit/task title — used on the All heatmap tooltip. */
  title?: string | null;
};

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

const WEEK_MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
});

function parseYmd(ymd: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
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

/** Monday-start week containing `ymd`. */
export function startOfWeekYmd(ymd: string): string {
  const parsed = parseYmd(ymd);
  if (!parsed) return ymd;
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return formatYmd(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

/** ISO week number for the Monday-start week containing `ymd`. */
export function isoWeekNumber(ymd: string): number {
  const parsed = parseYmd(ymd);
  if (!parsed) return 1;
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function dayState(
  ymd: string,
  todayYmd: string,
  status: string | undefined,
  activeFromYmd: string | null,
  options?: {
    requireYear?: number;
    cadence?: HabitCadence | null;
    cadenceAnchorYmd?: string | null;
    outcomes?: readonly { dueYmd: string; status: string }[];
  },
): HabitGridCellState {
  const parsed = parseYmd(ymd);
  if (options?.requireYear != null && parsed?.year !== options.requireYear) {
    return "future";
  }
  if (ymd > todayYmd) {
    // Only gate *future* days on the habit start — past/today stay empty so
    // users can backfill forgotten check-offs.
    if (activeFromYmd && ymd < activeFromYmd) return "future";
    const cadence = options?.cadence ?? null;
    const anchor = options?.cadenceAnchorYmd ?? activeFromYmd;
    if (
      cadence &&
      cadence !== "daily" &&
      anchor &&
      isHabitDueYmd(cadence, anchor, ymd, options?.outcomes ?? [])
    ) {
      return "scheduled";
    }
    return "future";
  }
  if (status === "completed") return "completed";
  if (status === "canceled") return "canceled";
  return "empty";
}

function heatLevelForCount(
  count: number,
  maxCount: number,
): HabitDayHeatLevel {
  if (count <= 0) return 1;
  if (maxCount <= 1) return 4;
  const ratio = count / maxCount;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

function dayHeatTone(
  completed: number,
  canceled: number,
): HabitDayHeatTone | null {
  if (completed <= 0 && canceled <= 0) return null;
  if (completed > 0 && canceled <= 0) return "completed";
  if (canceled > 0 && completed <= 0) return "canceled";
  return "mixed";
}

/** Aggregate habit day results into GitHub-style heat (tone + brightness). */
export function buildHabitDayHeatByYmd(
  instances: readonly HabitGridInstance[],
): Map<string, HabitDayHeat> {
  type DayBucket = {
    completed: number;
    canceled: number;
    entries: HabitDayHeatEntry[];
  };
  const buckets = new Map<string, DayBucket>();

  for (const instance of instances) {
    if (!parseYmd(instance.dueYmd)) continue;
    const status =
      instance.status === "completed" || instance.status === "canceled"
        ? instance.status
        : null;
    if (!status) continue;

    let bucket = buckets.get(instance.dueYmd);
    if (!bucket) {
      bucket = { completed: 0, canceled: 0, entries: [] };
      buckets.set(instance.dueYmd, bucket);
    }
    if (status === "completed") bucket.completed += 1;
    else bucket.canceled += 1;
    const title = instance.title?.trim() || "Habit";
    bucket.entries.push({ title, status });
  }

  let maxTotal = 0;
  for (const bucket of buckets.values()) {
    maxTotal = Math.max(maxTotal, bucket.completed + bucket.canceled);
  }

  const heatByYmd = new Map<string, HabitDayHeat>();
  for (const [ymd, bucket] of buckets) {
    const tone = dayHeatTone(bucket.completed, bucket.canceled);
    if (!tone) continue;
    const entries = [...bucket.entries].sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "completed" ? -1 : 1;
      }
      return a.title.localeCompare(b.title);
    });
    heatByYmd.set(ymd, {
      tone,
      level: heatLevelForCount(bucket.completed + bucket.canceled, maxTotal),
      completed: bucket.completed,
      canceled: bucket.canceled,
      entries,
    });
  }
  return heatByYmd;
}

function buildDayCellsInRange(
  startYmd: string,
  endYmd: string,
  todayYmd: string,
  byDueYmd: ReadonlyMap<string, string>,
  activeFromYmd: string | null,
  options?: DayBuildOptions,
): HabitGridCell[] {
  const cells: HabitGridCell[] = [];
  let cursor = startYmd;
  let index = 1;
  while (cursor <= endYmd) {
    const parsed = parseYmd(cursor);
    const heat = options?.heatByYmd?.get(cursor) ?? null;
    const useHeat =
      Boolean(options?.aggregate) &&
      heat != null &&
      cursor <= todayYmd &&
      (!activeFromYmd || cursor >= activeFromYmd) &&
      (options?.requireYear == null || parsed?.year === options.requireYear);

    const state = useHeat
      ? "heat"
      : dayState(
          cursor,
          todayYmd,
          options?.aggregate ? undefined : byDueYmd.get(cursor),
          activeFromYmd,
          options,
        );

    cells.push({
      id: cursor,
      ymd: cursor,
      day: parsed?.day ?? index,
      state,
      title: cursor,
      heat: useHeat ? heat : null,
    });
    cursor = addDaysYmd(cursor, 1);
    index += 1;
  }
  return cells;
}

type DayBuildOptions = {
  requireYear?: number;
  cadence?: HabitCadence | null;
  cadenceAnchorYmd?: string | null;
  outcomes?: readonly { dueYmd: string; status: string }[];
  aggregate?: boolean;
  heatByYmd?: ReadonlyMap<string, HabitDayHeat>;
};

function buildMonthGridsForYear(
  year: number,
  todayYmd: string,
  byDueYmd: ReadonlyMap<string, string>,
  activeFromYmd: string | null,
  options?: DayBuildOptions,
): HabitMonthGrid[] {
  const grids: HabitMonthGrid[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const count = daysInMonth(year, month);
    const cells = buildDayCellsInRange(
      formatYmd(year, month, 1),
      formatYmd(year, month, count),
      todayYmd,
      byDueYmd,
      activeFromYmd,
      options,
    );
    grids.push({
      year,
      month,
      label: MONTH_FORMATTER.format(new Date(year, month - 1, 1)),
      daysInMonth: count,
      cells,
    });
  }
  return grids;
}

function buildWeeklyGridsForYear(
  year: number,
  todayYmd: string,
  byDueYmd: ReadonlyMap<string, string>,
  activeFromYmd: string | null,
  options?: DayBuildOptions,
): HabitMonthGrid[] {
  const yearStart = formatYmd(year, 1, 1);
  const yearEnd = formatYmd(year, 12, 31);
  let weekStart = startOfWeekYmd(yearStart);
  const grids: HabitMonthGrid[] = [];
  while (weekStart <= yearEnd) {
    const weekEnd = addDaysYmd(weekStart, 6);
    const weekNo = isoWeekNumber(weekStart);
    const midWeek = addDaysYmd(weekStart, 3);
    const midParsed = parseYmd(midWeek);
    const cells = buildDayCellsInRange(
      weekStart,
      weekEnd,
      todayYmd,
      byDueYmd,
      activeFromYmd,
      { ...options, requireYear: year },
    );
    grids.push({
      year,
      month: weekNo,
      label: `Week ${weekNo}`,
      secondaryLabel: midParsed
        ? WEEK_MONTH_FORMATTER.format(
            new Date(midParsed.year, midParsed.month - 1, midParsed.day),
          )
        : undefined,
      daysInMonth: cells.length,
      cells,
    });
    weekStart = addDaysYmd(weekStart, 7);
  }
  return grids;
}

function buildYearDayGrid(
  year: number,
  todayYmd: string,
  byDueYmd: ReadonlyMap<string, string>,
  activeFromYmd: string | null,
  options?: DayBuildOptions,
): HabitMonthGrid[] {
  const cells = buildDayCellsInRange(
    formatYmd(year, 1, 1),
    formatYmd(year, 12, 31),
    todayYmd,
    byDueYmd,
    activeFromYmd,
    options,
  );
  return [
    {
      year,
      month: 0,
      label: String(year),
      daysInMonth: cells.length,
      cells,
    },
  ];
}

function indexInstances(
  instances: readonly HabitGridInstance[],
): Map<string, string> {
  const byDueYmd = new Map<string, string>();
  for (const instance of instances) {
    if (!parseYmd(instance.dueYmd)) continue;
    byDueYmd.set(instance.dueYmd, instance.status);
  }
  return byDueYmd;
}

export function earliestHabitInstanceYmd(
  instances: readonly HabitGridInstance[],
): string | null {
  let earliest: string | null = null;
  for (const instance of instances) {
    if (!parseYmd(instance.dueYmd)) continue;
    if (!earliest || instance.dueYmd < earliest) {
      earliest = instance.dueYmd;
    }
  }
  return earliest;
}

export function habitInstanceCounts(instances: readonly HabitGridInstance[]): {
  completed: number;
  canceled: number;
} {
  let completed = 0;
  let canceled = 0;
  for (const instance of instances) {
    if (instance.status === "completed") completed += 1;
    if (instance.status === "canceled") canceled += 1;
  }
  return { completed, canceled };
}

export function buildHabitTimelineGrids(input: {
  instances: readonly HabitGridInstance[];
  todayYmd: string;
  year: number;
  sort: HabitSortGranularity;
  activeFromYmd?: string | null;
  cadence?: HabitCadence | null;
  cadenceAnchorYmd?: string | null;
  /** Aggregate many habits into a contribution-style heatmap (All tab). */
  aggregate?: boolean;
}): HabitMonthGrid[] {
  const {
    instances,
    todayYmd,
    year,
    sort,
    activeFromYmd = earliestHabitInstanceYmd(instances),
    cadence = null,
    cadenceAnchorYmd = activeFromYmd,
    aggregate = false,
  } = input;
  if (!parseYmd(todayYmd) || !Number.isFinite(year)) return [];
  const byDueYmd = aggregate ? new Map<string, string>() : indexInstances(instances);
  const heatByYmd = aggregate ? buildHabitDayHeatByYmd(instances) : undefined;
  const outcomes = aggregate
    ? []
    : instances.map((instance) => ({
        dueYmd: instance.dueYmd,
        status: instance.status,
      }));
  const schedule: DayBuildOptions = {
    cadence: aggregate ? null : cadence,
    cadenceAnchorYmd: aggregate ? null : cadenceAnchorYmd,
    outcomes,
    aggregate,
    heatByYmd,
  };

  if (sort === "weekly") {
    return buildWeeklyGridsForYear(
      year,
      todayYmd,
      byDueYmd,
      activeFromYmd,
      schedule,
    );
  }
  if (sort === "yearly") {
    return buildYearDayGrid(year, todayYmd, byDueYmd, activeFromYmd, schedule);
  }
  return buildMonthGridsForYear(year, todayYmd, byDueYmd, activeFromYmd, schedule);
}

export function buildHabitMonthGrids(
  instances: readonly HabitGridInstance[],
  todayYmd: string,
  year: number,
  activeFromYmd: string | null = earliestHabitInstanceYmd(instances),
): HabitMonthGrid[] {
  return buildHabitTimelineGrids({
    instances,
    todayYmd,
    year,
    sort: "monthly",
    activeFromYmd,
  });
}

export function buildHabitYearMonthGrids(
  todayYmd: string,
  year: number,
): HabitMonthGrid[] {
  return buildHabitTimelineGrids({
    instances: [],
    todayYmd,
    year,
    sort: "monthly",
    activeFromYmd: null,
  });
}

export function focusYmdForHabitSort(
  sort: HabitSortGranularity,
  todayYmd: string,
  year: number,
): string {
  const todayYear = parseYmd(todayYmd)?.year;
  if (todayYear === year) return todayYmd;
  if (sort === "weekly") return startOfWeekYmd(formatYmd(year, 6, 15));
  return formatYmd(year, 6, 15);
}
