import type {
  FinancialGoal,
  FinancialGoalSavingMode,
  FinancialTransaction,
} from "@backsteros/contracts";

export type GoalChartPoint = {
  /** Period key used as the Nivo x value (stable, sortable). */
  x: string;
  /** Display label for axis ticks. */
  label: string;
  /** Cumulative amount in euros (Nivo prefers numbers). */
  y: number;
};

export type GoalChartSeries = {
  id: "projected" | "actual";
  data: GoalChartPoint[];
};

function normalizeSavingMode(
  value: string | null | undefined,
): FinancialGoalSavingMode {
  if (value === "daily" || value === "weekly" || value === "yearly") {
    return value;
  }
  return "monthly";
}

function parseCalendarDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatCalendarDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addPeriods(
  start: Date,
  mode: FinancialGoalSavingMode,
  count: number,
): Date {
  const next = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  if (mode === "daily") {
    next.setDate(next.getDate() + count);
  } else if (mode === "weekly") {
    next.setDate(next.getDate() + count * 7);
  } else if (mode === "yearly") {
    next.setFullYear(next.getFullYear() + count);
  } else {
    next.setMonth(next.getMonth() + count);
  }
  return next;
}

function periodIndexOnOrBefore(
  start: Date,
  asOf: Date,
  mode: FinancialGoalSavingMode,
): number {
  const startDay = startOfLocalDay(start);
  const day = startOfLocalDay(asOf);
  if (day < startDay) return -1;
  if (mode === "daily") {
    return Math.floor((day.getTime() - startDay.getTime()) / 86_400_000);
  }
  if (mode === "weekly") {
    return Math.floor(
      (day.getTime() - startDay.getTime()) / (7 * 86_400_000),
    );
  }
  if (mode === "yearly") {
    let periods = day.getFullYear() - startDay.getFullYear();
    const anniversary = new Date(
      day.getFullYear(),
      startDay.getMonth(),
      startDay.getDate(),
    );
    if (day < anniversary) periods -= 1;
    return Math.max(0, periods);
  }
  return (
    (day.getFullYear() - startDay.getFullYear()) * 12 +
    (day.getMonth() - startDay.getMonth())
  );
}

function formatMonthLabel(date: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short" }).format(date);
  } catch {
    return String(date.getMonth() + 1);
  }
}

function formatPeriodLabel(
  date: Date,
  mode: FinancialGoalSavingMode,
  index: number,
): string {
  if (mode === "daily") {
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
      }).format(date);
    } catch {
      return formatCalendarDate(date);
    }
  }
  if (mode === "weekly") {
    return `W${index + 1}`;
  }
  if (mode === "yearly") {
    return String(date.getFullYear());
  }
  // Monthly charts: month name only — never include day or year digits.
  return formatMonthLabel(date);
}

function centsToEuros(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Credits (positive) count toward the goal; debits reduce progress.
 */
function transactionSavedDeltaCents(tx: FinancialTransaction): number {
  return tx.amountCents;
}

export type BuildGoalChartSeriesInput = {
  goal: Pick<
    FinancialGoal,
    | "goalAmountCents"
    | "startDate"
    | "endDate"
    | "contributionCents"
    | "savingMode"
  >;
  transactions: FinancialTransaction[];
  asOf?: Date;
};

/**
 * Builds projected (plan) and actual (linked transactions) cumulative series
 * bucketed by the goal's saving mode across the goal duration.
 */
export function buildGoalChartSeries({
  goal,
  transactions,
  asOf = new Date(),
}: BuildGoalChartSeriesInput): GoalChartSeries[] | null {
  const goalAmount =
    goal.goalAmountCents != null && goal.goalAmountCents > 0
      ? goal.goalAmountCents
      : null;
  const contribution =
    goal.contributionCents != null && goal.contributionCents > 0
      ? goal.contributionCents
      : null;
  const start = parseCalendarDate(goal.startDate);
  if (!goalAmount || !contribution || !start) return null;

  const mode = normalizeSavingMode(goal.savingMode);
  const startDay = startOfLocalDay(start);
  const today = startOfLocalDay(asOf);
  const periodsToGoal = Math.max(1, Math.ceil(goalAmount / contribution));
  const contributionEnd = addPeriods(startDay, mode, periodsToGoal);
  const explicitEnd = parseCalendarDate(goal.endDate);
  const explicitEndDay = explicitEnd ? startOfLocalDay(explicitEnd) : null;

  // Period end date owns the chart horizon when set; otherwise fall back to
  // the contribution schedule (and always include "today" for actuals).
  let chartEnd =
    explicitEndDay && explicitEndDay >= startDay
      ? explicitEndDay
      : contributionEnd;
  if (today > chartEnd) {
    chartEnd = today;
  }

  const endPeriodIndex = Math.max(
    0,
    periodIndexOnOrBefore(startDay, chartEnd, mode),
  );
  const totalPeriods = explicitEndDay
    ? endPeriodIndex
    : Math.max(periodsToGoal, endPeriodIndex);

  const projected: GoalChartPoint[] = [];
  for (let i = 0; i <= totalPeriods; i++) {
    const date = addPeriods(startDay, mode, i);
    const cumulative = Math.min(goalAmount, i * contribution);
    projected.push({
      x: formatCalendarDate(date),
      label: formatPeriodLabel(date, mode, i),
      y: centsToEuros(cumulative),
    });
  }

  const sortedTx = [...transactions].sort((a, b) =>
    a.bookedOn === b.bookedOn
      ? a.id.localeCompare(b.id)
      : a.bookedOn.localeCompare(b.bookedOn),
  );

  let running = 0;
  const savedByPeriod = new Map<number, number>();
  for (const tx of sortedTx) {
    const booked = parseCalendarDate(tx.bookedOn);
    if (!booked) continue;
    const index = periodIndexOnOrBefore(startDay, booked, mode);
    if (index < 0) continue;
    running += transactionSavedDeltaCents(tx);
    savedByPeriod.set(index, Math.max(0, running));
  }

  const actual: GoalChartPoint[] = [];
  let lastKnown = 0;
  const lastActualPeriod = periodIndexOnOrBefore(startDay, today, mode);
  for (let i = 0; i <= totalPeriods; i++) {
    if (savedByPeriod.has(i)) {
      lastKnown = savedByPeriod.get(i)!;
    }
    // Only draw actual through today (and any earlier periods).
    if (i > lastActualPeriod) break;
    const date = addPeriods(startDay, mode, i);
    actual.push({
      x: formatCalendarDate(date),
      label: formatPeriodLabel(date, mode, i),
      y: centsToEuros(Math.min(goalAmount, lastKnown)),
    });
  }

  // Ensure actual starts at 0 on the goal start even with no transactions.
  if (actual.length === 0) {
    actual.push({
      x: formatCalendarDate(startDay),
      label: formatPeriodLabel(startDay, mode, 0),
      y: 0,
    });
  }

  return [
    { id: "projected", data: projected },
    { id: "actual", data: actual },
  ];
}

export function goalChartHasPlan(
  goal: Pick<
    FinancialGoal,
    "goalAmountCents" | "startDate" | "contributionCents"
  >,
): boolean {
  return (
    goal.goalAmountCents != null &&
    goal.goalAmountCents > 0 &&
    goal.contributionCents != null &&
    goal.contributionCents > 0 &&
    Boolean(goal.startDate)
  );
}
