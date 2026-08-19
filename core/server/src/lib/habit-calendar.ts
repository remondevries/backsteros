const HABIT_TERMINAL_STATUSES = new Set([
  "completed",
  "canceled",
  "duplicated",
]);

export const HEALTH_PROJECT_NAME = "Health";
export const HEALTH_PROJECT_KEYS = ["HLT", "HEA", "HL", "HTH"] as const;
export const HABIT_TASK_PRIORITY = 3;
export const DEFAULT_HABIT_TIMEZONE = "Europe/Amsterdam";
export const HABIT_CADENCES = [
  "daily",
  "every_2_days",
  "weekly",
  "monthly",
] as const;
export type HabitCadence = (typeof HABIT_CADENCES)[number];

/** One habit day instance used for every-2-days catch-up scheduling. */
export type HabitDayOutcome = {
  dueYmd: string;
  status: string;
};

export function parseHabitCadence(value: unknown): HabitCadence {
  return HABIT_CADENCES.includes(value as HabitCadence)
    ? (value as HabitCadence)
    : "daily";
}

export function isHealthProjectName(name: string): boolean {
  return name.trim().toLowerCase() === "health";
}

export function isOpenHabitTaskStatus(status: string): boolean {
  return !HABIT_TERMINAL_STATUSES.has(status);
}

export function formatYmdInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("INVALID_TIMEZONE_DATE");
  }
  return `${year}-${month}-${day}`;
}

export function dueDateToYmd(
  dueDate: Date | string | null | undefined,
  timeZone: string,
): string | null {
  if (dueDate == null) return null;
  const date = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return formatYmdInTimeZone(date, timeZone);
  } catch {
    return null;
  }
}

export function ymdStartOfDayIso(ymd: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) {
    throw new Error("INVALID_YMD");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcGuess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const guess = new Date(utcGuess);
  const tzParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(guess);
  const tzHour = Number(tzParts.find((part) => part.type === "hour")?.value ?? 0);
  const tzMin = Number(tzParts.find((part) => part.type === "minute")?.value ?? 0);
  const tzSec = Number(tzParts.find((part) => part.type === "second")?.value ?? 0);
  const offsetMs = ((tzHour * 60 + tzMin) * 60 + tzSec) * 1000;
  let result = new Date(utcGuess - offsetMs);
  if (formatYmdInTimeZone(result, timeZone) !== ymd) {
    for (const hours of [-3, -2, -1, 1, 2, 3]) {
      const candidate = new Date(result.getTime() + hours * 3_600_000);
      if (formatYmdInTimeZone(candidate, timeZone) === ymd) {
        result = candidate;
        break;
      }
    }
  }
  return result.toISOString();
}

export function shouldCancelStaleHabitTask(
  status: string,
  dueYmd: string | null,
  todayYmd: string,
): boolean {
  return Boolean(dueYmd && dueYmd < todayYmd && isOpenHabitTaskStatus(status));
}

function habitDayStatusRank(status: string): number {
  if (status === "completed") return 0;
  if (isOpenHabitTaskStatus(status)) return 1;
  if (status === "canceled") return 2;
  return 3;
}

/**
 * Extra same-day habit tasks to drop when two instances exist for one
 * habit + due YMD (concurrent "ensure today" creates).
 */
export function duplicateHabitDayTaskIdsToRemove(
  tasks: readonly { id: string; status: string }[],
): string[] {
  if (tasks.length <= 1) return [];
  const ranked = [...tasks].sort((a, b) => {
    const byStatus = habitDayStatusRank(a.status) - habitDayStatusRank(b.status);
    if (byStatus !== 0) return byStatus;
    return a.id.localeCompare(b.id);
  });
  return ranked.slice(1).map((task) => task.id);
}

function parseYmdParts(
  ymd: string,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function ymdDayDiff(fromYmd: string, toYmd: string): number | null {
  const from = parseYmdParts(fromYmd);
  const to = parseYmdParts(toYmd);
  if (!from || !to) return null;
  const fromUtc = Date.UTC(from.year, from.month - 1, from.day);
  const toUtc = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

/** Add calendar days to a YMD (UTC date arithmetic). */
export function addDaysToYmd(ymd: string, days: number): string | null {
  const parts = parseYmdParts(ymd);
  if (!parts) return null;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + days);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Next due day for every-2-days with miss catch-up:
 * - completed on D → next is D+2
 * - canceled/missed on D → next is D+1 (do not keep the fixed every-other grid)
 * - open on D → still due on D
 * - no history → first due is the cadence anchor
 *
 * Scheduled open tasks after the latest resolved day are ignored so an early
 * completion resets the rhythm instead of leaving a stale future due date.
 */
export function nextEvery2DaysDueYmd(
  outcomes: readonly HabitDayOutcome[],
  anchorYmd: string,
): string {
  const sorted = [...outcomes]
    .filter((outcome) => parseYmdParts(outcome.dueYmd))
    .sort((a, b) => a.dueYmd.localeCompare(b.dueYmd));
  if (sorted.length === 0) return anchorYmd;

  const latestResolved = [...sorted]
    .reverse()
    .find(
      (outcome) =>
        outcome.status === "completed" ||
        outcome.status === "canceled" ||
        outcome.status === "duplicated",
    );
  if (latestResolved) {
    if (latestResolved.status === "completed") {
      return addDaysToYmd(latestResolved.dueYmd, 2) ?? latestResolved.dueYmd;
    }
    return addDaysToYmd(latestResolved.dueYmd, 1) ?? latestResolved.dueYmd;
  }

  const latestOpen = [...sorted]
    .reverse()
    .find((outcome) => isOpenHabitTaskStatus(outcome.status));
  if (latestOpen) return latestOpen.dueYmd;

  return anchorYmd;
}

/** Whether `ymd` falls on this habit's cadence schedule from `anchorYmd`. */
export function isHabitDueYmd(
  cadence: HabitCadence,
  anchorYmd: string,
  ymd: string,
  outcomes: readonly HabitDayOutcome[] = [],
): boolean {
  if (ymd < anchorYmd) return false;
  if (cadence === "daily") return true;
  if (cadence === "every_2_days") {
    // Project from history: after each due day assume completion (+2) when
    // forecasting future scheduled cells; past outcomes drive catch-up.
    const prior = outcomes.filter((outcome) => outcome.dueYmd < ymd);
    let cursor = nextEvery2DaysDueYmd(prior, anchorYmd);
    while (cursor < ymd) {
      const advanced = addDaysToYmd(cursor, 2);
      if (!advanced || advanced <= cursor) return false;
      cursor = advanced;
    }
    return cursor === ymd;
  }
  if (cadence === "weekly") {
    const diff = ymdDayDiff(anchorYmd, ymd);
    return diff != null && diff % 7 === 0;
  }
  const anchor = parseYmdParts(anchorYmd);
  const today = parseYmdParts(ymd);
  if (!anchor || !today) return false;
  if (today.day === anchor.day) return true;
  const lastDay = daysInMonth(today.year, today.month);
  return today.day === lastDay && anchor.day > lastDay;
}

export function habitNeedsTodayTask(
  existingDueYmds: readonly string[],
  todayYmd: string,
  cadence: HabitCadence = "daily",
  anchorYmd?: string | null,
  outcomes: readonly HabitDayOutcome[] = [],
): boolean {
  if (existingDueYmds.includes(todayYmd)) return false;
  // An open future instance means the next due was postponed — don't spawn today.
  if (
    outcomes.some(
      (outcome) =>
        isOpenHabitTaskStatus(outcome.status) && outcome.dueYmd > todayYmd,
    )
  ) {
    return false;
  }
  const resolvedAnchor =
    anchorYmd && parseYmdParts(anchorYmd)
      ? anchorYmd
      : [...existingDueYmds].sort()[0] ?? todayYmd;

  if (cadence === "every_2_days") {
    // Miss catch-up: if the next due day is today or already overdue, create today.
    const nextDue = nextEvery2DaysDueYmd(outcomes, resolvedAnchor);
    return nextDue <= todayYmd;
  }

  return isHabitDueYmd(cadence, resolvedAnchor, todayYmd, outcomes);
}

export function nextHealthProjectKey(usedKeys: readonly string[]): string {
  const taken = new Set(usedKeys.map((key) => key.toUpperCase()));
  for (const key of HEALTH_PROJECT_KEYS) {
    if (!taken.has(key)) return key;
  }
  for (let index = 1; index < 100; index += 1) {
    const key = `H${String(index).padStart(2, "0")}`;
    if (!taken.has(key)) return key;
  }
  return "HLT";
}
