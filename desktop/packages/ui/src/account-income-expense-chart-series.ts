import type {
  BankAccountCashflowMonth,
  FinancialTransaction,
} from "@backsteros/contracts";

import { isCashflowTransaction } from "./cashflow-exclusion.js";

export type AccountChartPoint = {
  /** Period key used as the Nivo x value (`YYYY-MM` or `YYYY-MM-DD`). */
  x: string;
  /** Display label for axis ticks. */
  label: string;
  /** Optional richer label for tooltips (falls back to `label`). */
  tooltipLabel?: string;
  /**
   * Period total in euros. `null` keeps the x tick (e.g. future months on a
   * full-year axis) without extending the line.
   */
  y: number | null;
};

export type AccountChartSeries = {
  id: "income" | "expense";
  data: AccountChartPoint[];
};

function centsToEuros(cents: number): number {
  return Math.round(cents) / 100;
}

function formatMonthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function formatMonthLabel(year: number, monthIndex: number): string {
  const date = new Date(year, monthIndex, 1);
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short" }).format(date);
  } catch {
    return String(monthIndex + 1);
  }
}

function parseBookedMonth(
  bookedOn: string,
): { year: number; monthIndex: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookedOn)) return null;
  const year = Number(bookedOn.slice(0, 4));
  const monthIndex = Number(bookedOn.slice(5, 7)) - 1;
  if (!Number.isFinite(year) || monthIndex < 0 || monthIndex > 11) return null;
  return { year, monthIndex };
}

function parseBookedDay(
  bookedOn: string,
): { year: number; monthIndex: number; day: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookedOn)) return null;
  const year = Number(bookedOn.slice(0, 4));
  const monthIndex = Number(bookedOn.slice(5, 7)) - 1;
  const day = Number(bookedOn.slice(8, 10));
  if (
    !Number.isFinite(year) ||
    monthIndex < 0 ||
    monthIndex > 11 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  return { year, monthIndex, day };
}

function formatDayKey(year: number, monthIndex: number, day: number): string {
  return `${formatMonthKey(year, monthIndex)}-${String(day).padStart(2, "0")}`;
}

function formatDayLabel(year: number, monthIndex: number, day: number): string {
  const date = new Date(year, monthIndex, day);
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
    }).format(date);
  } catch {
    return String(day);
  }
}

function formatDayTick(day: number): string {
  return String(day);
}

export type BuildAccountIncomeExpenseChartSeriesInput = {
  transactions: FinancialTransaction[];
  /** Defaults to today — drives which calendar year and last month to include. */
  asOf?: Date;
  /** Category ids with kind transfer or listing excluded. */
  nonCashflowCategoryIds?: ReadonlySet<string>;
};

/**
 * Builds monthly income (credits) and expense (debits as positive totals) for
 * the calendar year of `asOf`, from January through the current month.
 */
export function buildAccountIncomeExpenseChartSeries({
  transactions,
  asOf = new Date(),
  nonCashflowCategoryIds = new Set(),
}: BuildAccountIncomeExpenseChartSeriesInput): AccountChartSeries[] {
  const year = asOf.getFullYear();
  const lastMonthIndex = asOf.getMonth();

  const incomeByMonth = new Array<number>(12).fill(0);
  const expenseByMonth = new Array<number>(12).fill(0);

  for (const tx of transactions) {
    const booked = parseBookedMonth(tx.bookedOn);
    if (!booked || booked.year !== year) continue;
    if (booked.monthIndex > lastMonthIndex) continue;
    if (!isCashflowTransaction(tx, nonCashflowCategoryIds)) continue;
    if (tx.amountCents > 0) {
      incomeByMonth[booked.monthIndex]! += tx.amountCents;
    } else if (tx.amountCents < 0) {
      expenseByMonth[booked.monthIndex]! += Math.abs(tx.amountCents);
    }
  }

  const income: AccountChartPoint[] = [];
  const expense: AccountChartPoint[] = [];
  for (let monthIndex = 0; monthIndex <= lastMonthIndex; monthIndex++) {
    const x = formatMonthKey(year, monthIndex);
    const label = formatMonthLabel(year, monthIndex);
    income.push({
      x,
      label,
      y: centsToEuros(incomeByMonth[monthIndex]!),
    });
    expense.push({
      x,
      label,
      y: centsToEuros(expenseByMonth[monthIndex]!),
    });
  }

  return [
    { id: "income", data: income },
    { id: "expense", data: expense },
  ];
}

export type BuildAccountIncomeExpenseChartSeriesFromCashflowInput = {
  year: number;
  months: BankAccountCashflowMonth[];
  asOf?: Date;
  /**
   * When true, include all 12 month ticks for `year`. Line values after the
   * current month (when `year` is the asOf year) are `null` so the series ends
   * instead of dropping to 0 for months with no data yet.
   * Default: only through the current month when `year` is the asOf year.
   */
  fullYear?: boolean;
};

/**
 * Builds chart series from a server cashflow aggregate (no Tier C rows needed).
 */
export function buildAccountIncomeExpenseChartSeriesFromCashflow({
  year,
  months,
  asOf = new Date(),
  fullYear = false,
}: BuildAccountIncomeExpenseChartSeriesFromCashflowInput): AccountChartSeries[] {
  const dataLastMonthIndex =
    asOf.getFullYear() === year
      ? asOf.getMonth()
      : year < asOf.getFullYear()
        ? 11
        : 0;
  const axisLastMonthIndex = fullYear ? 11 : dataLastMonthIndex;

  const incomeByMonth = new Array<number>(12).fill(0);
  const expenseByMonth = new Array<number>(12).fill(0);
  for (const row of months) {
    if (!row.month.startsWith(`${year}-`)) continue;
    const monthIndex = Number(row.month.slice(5, 7)) - 1;
    if (monthIndex < 0 || monthIndex > 11) continue;
    incomeByMonth[monthIndex] = row.incomeCents;
    expenseByMonth[monthIndex] = row.expenseCents;
  }

  const income: AccountChartPoint[] = [];
  const expense: AccountChartPoint[] = [];
  for (let monthIndex = 0; monthIndex <= axisLastMonthIndex; monthIndex++) {
    const x = formatMonthKey(year, monthIndex);
    const label = formatMonthLabel(year, monthIndex);
    const hasData = monthIndex <= dataLastMonthIndex;
    income.push({
      x,
      label,
      y: hasData ? centsToEuros(incomeByMonth[monthIndex]!) : null,
    });
    expense.push({
      x,
      label,
      y: hasData ? centsToEuros(expenseByMonth[monthIndex]!) : null,
    });
  }

  return [
    { id: "income", data: income },
    { id: "expense", data: expense },
  ];
}

export type BuildMonthIncomeExpenseDailyChartSeriesInput = {
  transactions: FinancialTransaction[];
  /** Defaults to today — drives which calendar month and last day to include. */
  asOf?: Date;
  /** Category ids with kind transfer or listing excluded. */
  nonCashflowCategoryIds?: ReadonlySet<string>;
};

/**
 * Builds daily income (credits) and expense (debits as positive totals) for
 * the calendar month of `asOf`, from the 1st through today.
 */
export function buildMonthIncomeExpenseDailyChartSeries({
  transactions,
  asOf = new Date(),
  nonCashflowCategoryIds = new Set(),
}: BuildMonthIncomeExpenseDailyChartSeriesInput): AccountChartSeries[] {
  const year = asOf.getFullYear();
  const monthIndex = asOf.getMonth();
  const lastDay = asOf.getDate();

  const incomeByDay = new Array<number>(lastDay).fill(0);
  const expenseByDay = new Array<number>(lastDay).fill(0);

  for (const tx of transactions) {
    const booked = parseBookedDay(tx.bookedOn);
    if (!booked) continue;
    if (booked.year !== year || booked.monthIndex !== monthIndex) continue;
    if (booked.day < 1 || booked.day > lastDay) continue;
    if (!isCashflowTransaction(tx, nonCashflowCategoryIds)) continue;
    const index = booked.day - 1;
    if (tx.amountCents > 0) {
      incomeByDay[index]! += tx.amountCents;
    } else if (tx.amountCents < 0) {
      expenseByDay[index]! += Math.abs(tx.amountCents);
    }
  }

  const income: AccountChartPoint[] = [];
  const expense: AccountChartPoint[] = [];
  for (let day = 1; day <= lastDay; day++) {
    const x = formatDayKey(year, monthIndex, day);
    const label = formatDayTick(day);
    const tooltipLabel = formatDayLabel(year, monthIndex, day);
    income.push({
      x,
      label,
      y: centsToEuros(incomeByDay[day - 1]!),
      tooltipLabel,
    });
    expense.push({
      x,
      label,
      y: centsToEuros(expenseByDay[day - 1]!),
      tooltipLabel,
    });
  }

  return [
    { id: "income", data: income },
    { id: "expense", data: expense },
  ];
}

export function accountChartHasYearActivity(
  series: AccountChartSeries[],
): boolean {
  return series.some((line) =>
    line.data.some((point) => point.y != null && point.y > 0),
  );
}

/**
 * Sums income/expense months across accounts (same `YYYY-MM` keys).
 */
export function aggregateBankAccountCashflowMonths(
  sources: BankAccountCashflowMonth[][],
): BankAccountCashflowMonth[] {
  const byMonth = new Map<
    string,
    { incomeCents: number; expenseCents: number }
  >();
  for (const months of sources) {
    for (const row of months) {
      const prev = byMonth.get(row.month) ?? {
        incomeCents: 0,
        expenseCents: 0,
      };
      byMonth.set(row.month, {
        incomeCents: prev.incomeCents + row.incomeCents,
        expenseCents: prev.expenseCents + row.expenseCents,
      });
    }
  }
  return [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([month, cents]) => ({
      month,
      incomeCents: cents.incomeCents,
      expenseCents: cents.expenseCents,
    }));
}
