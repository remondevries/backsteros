import type { HabitCadence } from "@backsteros/contracts";

export const HABIT_CADENCE_OPTIONS: ReadonlyArray<{
  value: HabitCadence;
  label: string;
}> = [
  { value: "daily", label: "Every day" },
  { value: "every_2_days", label: "Every 2 days" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Once a month" },
];

export type HabitDayOutcome = {
  dueYmd: string;
  status: string;
};

export function parseHabitCadence(value: unknown): HabitCadence {
  return (
    HABIT_CADENCE_OPTIONS.find((option) => option.value === value)?.value ??
    "daily"
  );
}

export function getHabitCadenceLabel(cadence: HabitCadence): string {
  return (
    HABIT_CADENCE_OPTIONS.find((option) => option.value === cadence)?.label ??
    "Every day"
  );
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

function ymdDayDiff(fromYmd: string, toYmd: string): number | null {
  const from = parseYmdParts(fromYmd);
  const to = parseYmdParts(toYmd);
  if (!from || !to) return null;
  const fromUtc = Date.UTC(from.year, from.month - 1, from.day);
  const toUtc = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

function addDaysToYmd(ymd: string, days: number): string | null {
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

const HABIT_TERMINAL_STATUSES = new Set([
  "completed",
  "canceled",
  "duplicated",
]);

function isOpenHabitTaskStatus(status: string): boolean {
  return !HABIT_TERMINAL_STATUSES.has(status);
}

/**
 * Next due day for every-2-days with miss catch-up:
 * completed → +2 days; missed/canceled → +1 day; weekly is unchanged elsewhere.
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

function nextScheduledCadenceDueYmd(
  cadence: HabitCadence,
  anchorYmd: string,
  fromYmd: string,
  outcomes: readonly HabitDayOutcome[],
): string {
  let cursor = fromYmd;
  for (let step = 0; step < 400; step += 1) {
    if (isHabitDueYmd(cadence, anchorYmd, cursor, outcomes)) {
      return cursor;
    }
    const next = addDaysToYmd(cursor, 1);
    if (!next || next <= cursor) break;
    cursor = next;
  }
  return fromYmd;
}

/** Next due YMD for UI: open task first, otherwise cadence projection. */
export function resolveNextHabitDueYmd(input: {
  cadence: HabitCadence;
  cadenceAnchorYmd: string;
  instances: readonly { dueYmd: string; status: string }[];
  todayYmd: string;
}): string {
  const openDueYmds = input.instances
    .filter((instance) => isOpenHabitTaskStatus(instance.status))
    .map((instance) => instance.dueYmd)
    .filter(Boolean)
    .sort();
  if (openDueYmds[0]) return openDueYmds[0];

  const outcomes = input.instances.map((instance) => ({
    dueYmd: instance.dueYmd,
    status: instance.status,
  }));

  if (input.cadence === "every_2_days") {
    return nextEvery2DaysDueYmd(outcomes, input.cadenceAnchorYmd);
  }

  if (input.cadence === "daily") {
    const completedToday = input.instances.some(
      (instance) =>
        instance.dueYmd === input.todayYmd && instance.status === "completed",
    );
    if (completedToday) {
      return addDaysToYmd(input.todayYmd, 1) ?? input.todayYmd;
    }
    return input.todayYmd;
  }

  return nextScheduledCadenceDueYmd(
    input.cadence,
    input.cadenceAnchorYmd,
    input.todayYmd,
    outcomes,
  );
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
  const day = parseYmdParts(ymd);
  if (!anchor || !day) return false;
  if (day.day === anchor.day) return true;
  const lastDay = daysInMonth(day.year, day.month);
  return day.day === lastDay && anchor.day > lastDay;
}
