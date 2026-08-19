/**
 * Cash Flow page chart series — desktop
 * `net-income-year-chart-series` / `cashflow-spend-year-chart-series` parity.
 * Mobile shares contracts only, so logic is reimplemented here.
 */

import type { BankAccountCashflowMonth } from "@backsteros/contracts";

import {
  categoryIconDisplay,
  type FinanceCategoryRow,
} from "./finance-categories";

export type NetIncomeYearBarPoint = {
  /** `YYYY-MM` */
  month: string;
  monthLabel: string;
  tooltipLabel: string;
  /** Signed net income in euros. */
  net: number;
  /** Running YTD net in euros through this month. */
  cumulative: number;
  isCurrentMonth: boolean;
  isFutureMonth: boolean;
};

export type NetIncomeYearChartSeries = {
  year: number;
  asOf: string;
  points: NetIncomeYearBarPoint[];
  ytdNetEuros: number;
  priorYtdNetEuros: number;
  changePercent: number | null;
};

export const CASHFLOW_SPEND_OTHER_KEY = "__other__";
export const CASHFLOW_SPEND_UNCATEGORIZED_KEY = "__uncategorized__";

export type CashflowCategoryMonthSpend = {
  month: string;
  categoryId: string | null;
  expenseCents: number;
};

export type CashflowSpendBarRow = {
  month: string;
  monthLabel: string;
  tooltipLabel: string;
  isCurrentMonth: boolean;
  isFutureMonth: boolean;
  /** Stack values in euros, aligned with `keys`. */
  values: number[];
  totalEuros: number;
};

export type CashflowSpendYearSeries = {
  year: number;
  asOf: string;
  rows: CashflowSpendBarRow[];
  keys: string[];
  labels: Record<string, string>;
  colors: Record<string, string>;
  ytdExpenseCents: number;
  priorYtdExpenseCents: number;
};

export type CashflowIncomeBarPoint = {
  month: string;
  monthLabel: string;
  tooltipLabel: string;
  income: number;
  isCurrentMonth: boolean;
  isFutureMonth: boolean;
};

const FALLBACK_PALETTE = [
  "#5B9FD8",
  "#8B5CF6",
  "#F59E0B",
  "#F97316",
  "#64748B",
  "#14B8A6",
  "#EC4899",
] as const;

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

function parseAsOfParts(asOf: string): {
  year: number;
  month: number;
  day: number;
} {
  const [y, m, d] = asOf.split("-").map(Number);
  return {
    year: y || 0,
    month: m || 1,
    day: d || 1,
  };
}

/**
 * Last calendar month that may show real values for `year`.
 * Extends through today when browsing an earlier month in the current year.
 */
export function resolveCashflowVisibleThroughMonth(
  year: number,
  asOf: string,
  now = new Date(),
): number {
  const asOfParts = parseAsOfParts(asOf);
  let through =
    asOfParts.year === year
      ? asOfParts.month
      : asOfParts.year < year
        ? 0
        : 12;
  if (now.getFullYear() > year) {
    through = 12;
  } else if (now.getFullYear() === year) {
    through = Math.max(through, now.getMonth() + 1);
  }
  return Math.min(12, Math.max(0, through));
}

function monthShortLabel(year: number, monthIndex: number): string {
  const month = MONTH_SHORT[monthIndex] ?? String(monthIndex + 1);
  return monthIndex === 0 ? `${month} ${year}` : month;
}

function monthLongLabel(year: number, monthIndex: number): string {
  const month = MONTH_LONG[monthIndex] ?? String(monthIndex + 1);
  return `${month} ${year}`;
}

export function formatCashflowRangeLabel(from: Date, to: Date): string {
  const sameYear = from.getFullYear() === to.getFullYear();
  const fromLabel = `${MONTH_SHORT[from.getMonth()]} ${from.getDate()}${
    sameYear ? "" : ` ${from.getFullYear()}`
  }`;
  const toLabel = `${MONTH_SHORT[to.getMonth()]} ${to.getDate()} ${to.getFullYear()}`;
  return `${fromLabel} – ${toLabel}`;
}

export function cashflowChangePercent(
  ytdCents: number,
  priorYtdCents: number,
): number | null {
  if (priorYtdCents === 0) {
    if (ytdCents === 0) return 0;
    return null;
  }
  return ((ytdCents - priorYtdCents) / Math.abs(priorYtdCents)) * 100;
}

export function formatCashflowChangePercent(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${value.toFixed(digits)}%`;
}

export function buildNetIncomeYearChartSeries(input: {
  year: number;
  asOf: string;
  months: readonly BankAccountCashflowMonth[];
  ytdNetCents: number;
  priorYtdNetCents: number;
  now?: Date;
}): NetIncomeYearChartSeries {
  const asOfParts = parseAsOfParts(input.asOf);
  const visibleThroughMonth = resolveCashflowVisibleThroughMonth(
    input.year,
    input.asOf,
    input.now,
  );
  const byMonth = new Map(input.months.map((row) => [row.month, row]));
  const points: NetIncomeYearBarPoint[] = [];
  let cumulative = 0;

  for (let index = 0; index < 12; index += 1) {
    const month = `${input.year}-${String(index + 1).padStart(2, "0")}`;
    const row = byMonth.get(month);
    const netCents = (row?.incomeCents ?? 0) - (row?.expenseCents ?? 0);
    const net = netCents / 100;
    const isFutureMonth = index + 1 > visibleThroughMonth;
    const isCurrentMonth =
      asOfParts.year === input.year && index + 1 === asOfParts.month;

    if (!isFutureMonth) {
      cumulative += net;
    }

    points.push({
      month,
      monthLabel: monthShortLabel(input.year, index),
      tooltipLabel: monthLongLabel(input.year, index),
      net: isFutureMonth ? 0 : net,
      cumulative,
      isCurrentMonth,
      isFutureMonth,
    });
  }

  return {
    year: input.year,
    asOf: input.asOf,
    points,
    ytdNetEuros: input.ytdNetCents / 100,
    priorYtdNetEuros: input.priorYtdNetCents / 100,
    changePercent: cashflowChangePercent(
      input.ytdNetCents,
      input.priorYtdNetCents,
    ),
  };
}

export function netIncomeYearChartHasData(
  series: NetIncomeYearChartSeries,
): boolean {
  return series.points.some((point) => point.net !== 0);
}

function resolveRootCategoryId(
  categoryId: string | null,
  byId: Map<string, FinanceCategoryRow>,
): string {
  if (!categoryId) return CASHFLOW_SPEND_UNCATEGORIZED_KEY;
  let current = byId.get(categoryId);
  if (!current) return categoryId;
  const seen = new Set<string>();
  while (current.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = byId.get(current.parentId);
    if (!parent) break;
    current = parent;
  }
  return current.id;
}

export function buildCashflowSpendYearSeries(input: {
  year: number;
  asOf: string;
  categoryMonths: readonly CashflowCategoryMonthSpend[];
  categories: readonly FinanceCategoryRow[];
  ytdExpenseCents: number;
  priorYtdExpenseCents: number;
  topN?: number;
  now?: Date;
}): CashflowSpendYearSeries {
  const topN = input.topN ?? 5;
  const asOfParts = parseAsOfParts(input.asOf);
  const visibleThroughMonth = resolveCashflowVisibleThroughMonth(
    input.year,
    input.asOf,
    input.now,
  );
  const byId = new Map(input.categories.map((row) => [row.id, row]));

  const totals = new Map<string, Map<string, number>>();
  const ytdByRoot = new Map<string, number>();

  for (const row of input.categoryMonths) {
    const monthIndex = Number(row.month.slice(5)) - 1;
    if (monthIndex + 1 > visibleThroughMonth) continue;

    const rootKey = resolveRootCategoryId(row.categoryId, byId);
    const euros = Math.max(0, row.expenseCents) / 100;
    if (euros <= 0) continue;
    if (!totals.has(rootKey)) totals.set(rootKey, new Map());
    const monthMap = totals.get(rootKey)!;
    monthMap.set(row.month, (monthMap.get(row.month) ?? 0) + euros);
    ytdByRoot.set(rootKey, (ytdByRoot.get(rootKey) ?? 0) + euros);
  }

  const ranked = [...ytdByRoot.entries()]
    .filter(([, euros]) => euros > 0)
    .sort((a, b) => b[1] - a[1]);

  const realRanked = ranked.filter(
    ([key]) => key !== CASHFLOW_SPEND_UNCATEGORIZED_KEY,
  );
  const topKeys = realRanked.slice(0, topN).map(([key]) => key);
  const overflowKeys = realRanked.slice(topN).map(([key]) => key);
  const hasUncategorized = ytdByRoot.has(CASHFLOW_SPEND_UNCATEGORIZED_KEY);
  const hasOther = overflowKeys.length > 0;

  const keys = [
    ...topKeys,
    ...(hasUncategorized ? [CASHFLOW_SPEND_UNCATEGORIZED_KEY] : []),
    ...(hasOther ? [CASHFLOW_SPEND_OTHER_KEY] : []),
  ];

  const labels: Record<string, string> = {};
  const colors: Record<string, string> = {};
  let paletteIndex = 0;
  for (const key of keys) {
    if (key === CASHFLOW_SPEND_OTHER_KEY) {
      labels[key] = "Other";
      colors[key] = "#64748B";
      continue;
    }
    if (key === CASHFLOW_SPEND_UNCATEGORIZED_KEY) {
      labels[key] = "Uncategorized";
      colors[key] = "#94A3B8";
      continue;
    }
    const category = byId.get(key);
    labels[key] = category?.name ?? "Category";
    colors[key] =
      categoryIconDisplay(category?.icon).color ??
      FALLBACK_PALETTE[paletteIndex % FALLBACK_PALETTE.length]!;
    paletteIndex += 1;
  }

  const overflowSet = new Set(overflowKeys);
  const rows: CashflowSpendBarRow[] = [];

  for (let index = 0; index < 12; index += 1) {
    const month = `${input.year}-${String(index + 1).padStart(2, "0")}`;
    const isFutureMonth = index + 1 > visibleThroughMonth;
    const isCurrentMonth =
      asOfParts.year === input.year && index + 1 === asOfParts.month;
    const values = keys.map(() => 0);

    if (!isFutureMonth) {
      for (const [rootKey, monthMap] of totals) {
        const value = monthMap.get(month) ?? 0;
        if (value <= 0) continue;
        const keyIndex = keys.indexOf(rootKey);
        if (keyIndex >= 0) {
          values[keyIndex] = (values[keyIndex] ?? 0) + value;
        } else if (overflowSet.has(rootKey) && hasOther) {
          const otherIndex = keys.indexOf(CASHFLOW_SPEND_OTHER_KEY);
          if (otherIndex >= 0) {
            values[otherIndex] = (values[otherIndex] ?? 0) + value;
          }
        }
      }
    }

    rows.push({
      month,
      monthLabel: monthShortLabel(input.year, index),
      tooltipLabel: monthLongLabel(input.year, index),
      isCurrentMonth,
      isFutureMonth,
      values,
      totalEuros: values.reduce((sum, value) => sum + value, 0),
    });
  }

  return {
    year: input.year,
    asOf: input.asOf,
    rows,
    keys,
    labels,
    colors,
    ytdExpenseCents: input.ytdExpenseCents,
    priorYtdExpenseCents: input.priorYtdExpenseCents,
  };
}

export function cashflowSpendYearChartHasData(
  series: CashflowSpendYearSeries,
): boolean {
  return series.rows.some((row) => row.totalEuros > 0);
}

export function buildCashflowIncomeYearPoints(input: {
  year: number;
  asOf: string;
  months: readonly BankAccountCashflowMonth[];
  now?: Date;
}): CashflowIncomeBarPoint[] {
  const asOfParts = parseAsOfParts(input.asOf);
  const visibleThrough = resolveCashflowVisibleThroughMonth(
    input.year,
    input.asOf,
    input.now,
  );
  const byMonth = new Map(input.months.map((row) => [row.month, row]));

  return Array.from({ length: 12 }, (_, index) => {
    const month = `${input.year}-${String(index + 1).padStart(2, "0")}`;
    const isFutureMonth = index + 1 > visibleThrough;
    const isCurrentMonth =
      asOfParts.year === input.year && index + 1 === asOfParts.month;
    return {
      month,
      monthLabel: monthShortLabel(input.year, index),
      tooltipLabel: monthLongLabel(input.year, index),
      income: isFutureMonth
        ? 0
        : (byMonth.get(month)?.incomeCents ?? 0) / 100,
      isCurrentMonth,
      isFutureMonth,
    };
  });
}
