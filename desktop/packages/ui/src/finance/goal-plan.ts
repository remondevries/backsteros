import type { FinancialGoalSavingMode } from "@backsteros/contracts";

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

/**
 * Number of contribution steps from start → end (at least 1 when end >= start).
 */
export function planPeriodsBetween(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  savingMode: string | null | undefined,
): number | null {
  const start = parseCalendarDate(startDate);
  const end = parseCalendarDate(endDate);
  if (!start || !end) return null;
  const startDay = startOfLocalDay(start);
  const endDay = startOfLocalDay(end);
  if (endDay < startDay) return null;
  const mode = normalizeSavingMode(savingMode);
  return Math.max(1, periodIndexOnOrBefore(startDay, endDay, mode));
}

/**
 * Contribution per period so the goal amount is reached by endDate.
 */
export function deriveContributionCents(input: {
  goalAmountCents: number | null | undefined;
  startDate: string | null | undefined;
  endDate: string | null | undefined;
  savingMode: string | null | undefined;
}): number | null {
  const goalAmount =
    input.goalAmountCents != null && input.goalAmountCents > 0
      ? input.goalAmountCents
      : null;
  if (goalAmount == null) return null;
  const periods = planPeriodsBetween(
    input.startDate,
    input.endDate,
    input.savingMode,
  );
  if (periods == null) return null;
  return Math.max(1, Math.ceil(goalAmount / periods));
}

/**
 * End date so contribution * periods reaches the goal amount.
 */
export function deriveEndDate(input: {
  goalAmountCents: number | null | undefined;
  contributionCents: number | null | undefined;
  startDate: string | null | undefined;
  savingMode: string | null | undefined;
}): string | null {
  const goalAmount =
    input.goalAmountCents != null && input.goalAmountCents > 0
      ? input.goalAmountCents
      : null;
  const contribution =
    input.contributionCents != null && input.contributionCents > 0
      ? input.contributionCents
      : null;
  const start = parseCalendarDate(input.startDate);
  if (goalAmount == null || contribution == null || !start) return null;
  const mode = normalizeSavingMode(input.savingMode);
  const periods = Math.max(1, Math.ceil(goalAmount / contribution));
  return formatCalendarDate(addPeriods(startOfLocalDay(start), mode, periods));
}
