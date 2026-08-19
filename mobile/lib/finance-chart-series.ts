import type {
  BankAccountCashflowMonth,
  FinanceAssetsDebt,
  FinancialTransaction,
} from "@backsteros/contracts";

import { isCashflowTransaction } from "./cashflow-exclusion";
import {
  categoryIconDisplay,
  type FinanceCategoryRow,
} from "./finance-categories";
import { formatMonthShort } from "./finance-format";

/**
 * Chart series builders for the finance dashboard. Mirrors the shape of
 * desktop's `category-spend-chart-series` (`@backsteros/ui`) but adapted to
 * the workspace cashflow endpoint — reimplemented because mobile shares
 * contracts only, no visual UI code.
 */

/** Distinct stack palette (finance accents, readable on pure black). */
export const SPEND_STACK_COLORS = [
  "#ee7a47",
  "#5aa9e6",
  "#7fc8a9",
  "#c792ea",
  "#ffd166",
  "#f27d9d",
  "#8d9dad",
] as const;

export const SPEND_OTHER_KEY = "__other__";
export const SPEND_UNCATEGORIZED_KEY = "__uncategorized__";

export type CategoryMonthSpend = {
  /** `YYYY-MM` */
  month: string;
  categoryId: string | null;
  /** Net spend; positive = outflow. */
  expenseCents: number;
};

export type MonthlySpendRow = {
  month: string;
  monthLabel: string;
  /** Stack values in cents, aligned with `keys`. */
  values: number[];
  totalCents: number;
};

export type MonthlySpendSeries = {
  rows: MonthlySpendRow[];
  keys: string[];
  labels: Record<string, string>;
  colors: Record<string, string>;
};

function resolveSpendRootId(
  categoryId: string,
  byId: Map<string, FinanceCategoryRow>,
): string | null {
  let current = byId.get(categoryId);
  if (!current) return null;
  const guard = new Set<string>();
  while (current.parentId && byId.has(current.parentId)) {
    if (guard.has(current.id)) break;
    guard.add(current.id);
    current = byId.get(current.parentId)!;
  }
  if (current.listing === "excluded") return null;
  if (current.kind === "transfer") return null;
  return current.id;
}

/**
 * Stacked monthly spend by root category, capped to the top `topN` roots
 * plus Other and Uncategorized buckets. Positive outflow only.
 */
export function buildMonthlySpendSeries(input: {
  categoryMonths: readonly CategoryMonthSpend[];
  categories: readonly FinanceCategoryRow[];
  /** Display window, oldest first (`YYYY-MM`). */
  months: readonly string[];
  topN?: number;
}): MonthlySpendSeries {
  const { categoryMonths, categories, months, topN = 5 } = input;
  const byId = new Map(categories.map((category) => [category.id, category]));

  // month → rootKey → cents
  const totals = new Map<string, Map<string, number>>();
  for (const month of months) totals.set(month, new Map());

  const rootTotals = new Map<string, number>();
  for (const entry of categoryMonths) {
    if (entry.expenseCents <= 0) continue;
    const bucket = totals.get(entry.month);
    if (!bucket) continue;
    let key: string | null;
    if (entry.categoryId == null) {
      key = SPEND_UNCATEGORIZED_KEY;
    } else {
      key = resolveSpendRootId(entry.categoryId, byId);
    }
    if (!key) continue;
    bucket.set(key, (bucket.get(key) ?? 0) + entry.expenseCents);
    rootTotals.set(key, (rootTotals.get(key) ?? 0) + entry.expenseCents);
  }

  const rankedRoots = [...rootTotals.entries()]
    .filter(([key]) => key !== SPEND_UNCATEGORIZED_KEY)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);

  const topRoots = rankedRoots.slice(0, topN);
  const overflowRoots = new Set(rankedRoots.slice(topN));
  const hasUncategorized = (rootTotals.get(SPEND_UNCATEGORIZED_KEY) ?? 0) > 0;

  const keys = [
    ...topRoots,
    ...(overflowRoots.size > 0 ? [SPEND_OTHER_KEY] : []),
    ...(hasUncategorized ? [SPEND_UNCATEGORIZED_KEY] : []),
  ];

  const labels: Record<string, string> = {};
  const colors: Record<string, string> = {};
  const usedColors = new Set<string>();
  keys.forEach((key, index) => {
    if (key === SPEND_OTHER_KEY) {
      labels[key] = "Other";
      colors[key] = "rgba(255, 255, 255, 0.28)";
    } else if (key === SPEND_UNCATEGORIZED_KEY) {
      labels[key] = "Uncategorized";
      colors[key] = "rgba(255, 255, 255, 0.14)";
    } else {
      const category = byId.get(key);
      labels[key] = category?.name ?? "Category";
      // Prefer the category's own icon color (desktop parity), keep distinct.
      const preferred = categoryIconDisplay(category?.icon).color;
      let color =
        preferred && !usedColors.has(preferred.toLowerCase())
          ? preferred
          : null;
      if (!color) {
        for (let step = 0; step < SPEND_STACK_COLORS.length; step++) {
          const candidate =
            SPEND_STACK_COLORS[(index + step) % SPEND_STACK_COLORS.length]!;
          if (!usedColors.has(candidate.toLowerCase())) {
            color = candidate;
            break;
          }
        }
      }
      color = color ?? SPEND_STACK_COLORS[index % SPEND_STACK_COLORS.length]!;
      colors[key] = color;
      usedColors.add(color.toLowerCase());
    }
  });

  const rows: MonthlySpendRow[] = months.map((month) => {
    const bucket = totals.get(month) ?? new Map<string, number>();
    let otherCents = 0;
    for (const [key, cents] of bucket) {
      if (overflowRoots.has(key)) otherCents += cents;
    }
    const values = keys.map((key) => {
      if (key === SPEND_OTHER_KEY) return otherCents;
      return bucket.get(key) ?? 0;
    });
    return {
      month,
      monthLabel: formatMonthShort(month),
      values,
      totalCents: values.reduce((sum, cents) => sum + cents, 0),
    };
  });

  return { rows, keys, labels, colors };
}

export type DashboardTopCategory = {
  id: string;
  name: string;
  icon: string | null;
  spentCents: number;
  /** 0 = top-level category, 1 = subcategory (Categories page nesting). */
  depth: 0 | 1;
};

function sortCategoriesByOrder(
  rows: readonly FinanceCategoryRow[],
): FinanceCategoryRow[] {
  return [...rows].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Dashboard “Top categories” list: main → subcategory layout order (not ranked
 * by spend). Parent amounts roll up child spend; empty branches omitted.
 * Desktop `buildTopCategories` parity against workspace cashflow months.
 */
export function buildDashboardTopCategories(input: {
  categories: readonly FinanceCategoryRow[];
  categoryMonths: readonly CategoryMonthSpend[];
  monthKey: string;
}): DashboardTopCategory[] {
  const { categories, categoryMonths, monthKey } = input;
  const spentCentsByCategoryId: Record<string, number> = {};
  for (const entry of categoryMonths) {
    if (entry.month !== monthKey || entry.categoryId == null) continue;
    if (entry.expenseCents === 0) continue;
    spentCentsByCategoryId[entry.categoryId] =
      (spentCentsByCategoryId[entry.categoryId] ?? 0) + entry.expenseCents;
  }

  const byId = new Map(categories.map((category) => [category.id, category]));
  const childrenByParent = new Map<string, FinanceCategoryRow[]>();
  const roots: FinanceCategoryRow[] = [];

  for (const category of categories) {
    if (category.listing === "excluded" || category.kind === "transfer") {
      continue;
    }
    if (category.parentId && byId.has(category.parentId)) {
      const parent = byId.get(category.parentId);
      if (
        !parent ||
        parent.listing === "excluded" ||
        parent.kind === "transfer"
      ) {
        continue;
      }
      const list = childrenByParent.get(category.parentId) ?? [];
      list.push(category);
      childrenByParent.set(category.parentId, list);
    } else if (!category.parentId) {
      roots.push(category);
    }
  }

  const rows: DashboardTopCategory[] = [];
  for (const root of sortCategoriesByOrder(roots)) {
    const children = sortCategoriesByOrder(
      childrenByParent.get(root.id) ?? [],
    );
    const childSpend = children.map((child) => ({
      child,
      spentCents: spentCentsByCategoryId[child.id] ?? 0,
    }));
    const childrenWithSpend = childSpend.filter(
      (row) => row.spentCents !== 0,
    );
    const ownSpend = spentCentsByCategoryId[root.id] ?? 0;
    const rolledSpend =
      ownSpend +
      childrenWithSpend.reduce((sum, row) => sum + row.spentCents, 0);
    if (rolledSpend === 0) continue;

    rows.push({
      id: root.id,
      name: root.name,
      icon: root.icon,
      spentCents: rolledSpend,
      depth: 0,
    });
    for (const { child, spentCents } of childrenWithSpend) {
      rows.push({
        id: child.id,
        name: child.name,
        icon: child.icon,
        spentCents,
        depth: 1,
      });
    }
  }

  return rows;
}

export type IncomeExpenseDailyPoint = {
  index: number;
  /** Calendar day 1…N */
  day: number;
  /** Axis tick (`"1"`, `"2"`, …). */
  label: string;
  /** Tooltip label (`"15 Aug"`). */
  tooltipLabel: string;
  /** Income euros for the day. */
  income: number;
  /** Expense euros for the day (positive outflow). */
  expense: number;
};

function centsToEuros(cents: number): number {
  return Math.round(cents) / 100;
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

function formatDayTooltip(
  year: number,
  monthIndex: number,
  day: number,
): string {
  const short =
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
      monthIndex
    ] ?? String(monthIndex + 1);
  return `${day} ${short}`;
}

/**
 * Daily income (credits) and expense (debits as positive) for the calendar
 * month of `asOf`, from the 1st through that day (desktop dashboard chart).
 */
export function buildMonthIncomeExpenseDailyPoints(input: {
  transactions: readonly FinancialTransaction[];
  asOf?: Date;
  nonCashflowCategoryIds?: ReadonlySet<string>;
}): IncomeExpenseDailyPoint[] {
  const asOf = input.asOf ?? new Date();
  const nonCashflowCategoryIds = input.nonCashflowCategoryIds ?? new Set();
  const year = asOf.getFullYear();
  const monthIndex = asOf.getMonth();
  const lastDay = asOf.getDate();

  const incomeByDay = new Array<number>(lastDay).fill(0);
  const expenseByDay = new Array<number>(lastDay).fill(0);

  for (const tx of input.transactions) {
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

  const points: IncomeExpenseDailyPoint[] = [];
  for (let day = 1; day <= lastDay; day++) {
    points.push({
      index: day - 1,
      day,
      label: String(day),
      tooltipLabel: formatDayTooltip(year, monthIndex, day),
      income: centsToEuros(incomeByDay[day - 1]!),
      expense: centsToEuros(expenseByDay[day - 1]!),
    });
  }
  return points;
}

export function incomeExpenseDailyHasActivity(
  points: readonly IncomeExpenseDailyPoint[],
): boolean {
  return points.some((point) => point.income > 0 || point.expense > 0);
}

export type IncomeExpenseYearPoint = {
  index: number;
  /** Short month label (`Jan`, `Jan 2026` for January). */
  label: string;
  /** Income euros for the month. */
  income: number;
  /** Expense euros for the month (positive outflow). */
  expense: number;
};

const MONTH_SHORT_LABELS = [
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

/**
 * Monthly income/expense line points from server cashflow aggregates.
 * Desktop `buildAccountIncomeExpenseChartSeriesFromCashflow` — Victory cannot
 * use null/NaN y-values (they break the domain), so we only include months
 * through `asOf` (past years get all 12).
 */
export function buildAccountIncomeExpenseYearPoints(input: {
  year: number;
  months: readonly BankAccountCashflowMonth[];
  asOf?: Date;
}): IncomeExpenseYearPoint[] {
  const asOf = input.asOf ?? new Date();
  const dataLastMonthIndex =
    asOf.getFullYear() === input.year
      ? asOf.getMonth()
      : input.year < asOf.getFullYear()
        ? 11
        : -1;
  if (dataLastMonthIndex < 0) return [];

  const incomeByMonth = new Array<number>(12).fill(0);
  const expenseByMonth = new Array<number>(12).fill(0);
  for (const row of input.months) {
    if (!row.month.startsWith(`${input.year}-`)) continue;
    const monthIndex = Number(row.month.slice(5, 7)) - 1;
    if (monthIndex < 0 || monthIndex > 11) continue;
    incomeByMonth[monthIndex] = row.incomeCents;
    expenseByMonth[monthIndex] = row.expenseCents;
  }

  const points: IncomeExpenseYearPoint[] = [];
  for (let monthIndex = 0; monthIndex <= dataLastMonthIndex; monthIndex++) {
    const short = MONTH_SHORT_LABELS[monthIndex] ?? String(monthIndex + 1);
    points.push({
      index: monthIndex,
      label: monthIndex === 0 ? `${short} ${input.year}` : short,
      income: centsToEuros(incomeByMonth[monthIndex]!),
      expense: centsToEuros(expenseByMonth[monthIndex]!),
    });
  }
  return points;
}

export function incomeExpenseYearHasActivity(
  points: readonly IncomeExpenseYearPoint[],
): boolean {
  return points.some((point) => point.income > 0 || point.expense > 0);
}

/** Compact euro axis tick (desktop `formatEuroAxis` parity). */
export function formatIncomeExpenseAxisEuros(value: number): string {
  if (!Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  if (abs >= 1000) {
    const digits = abs >= 10_000 ? 0 : 1;
    const trimmed = Number((value / 1000).toFixed(digits));
    return `€${trimmed}k`;
  }
  return `€${Math.round(value)}`;
}

export type AssetsDebtChartPoint = {
  index: number;
  date: string;
  /** Euros (not cents) so chart axes stay readable. */
  assets: number;
  debt: number;
};

/** Downsampled points for the assets-vs-debt line chart (max ~120 points). */
export function buildAssetsDebtChartPoints(
  response: Pick<FinanceAssetsDebt, "points">,
  maxPoints = 120,
): AssetsDebtChartPoint[] {
  const points = response.points;
  if (points.length === 0) return [];
  const step = Math.max(1, Math.ceil(points.length / maxPoints));
  const sampled = points.filter(
    (_, index) => index % step === 0 || index === points.length - 1,
  );
  return sampled.map((point, index) => ({
    index,
    date: point.date,
    assets: point.assetsCents / 100,
    debt: point.debtCents / 100,
  }));
}

/** Percentage change over the selected range; null when start is zero. */
export function assetsChangePercent(
  response: Pick<FinanceAssetsDebt, "assetsCents" | "startAssetsCents">,
): number | null {
  if (response.startAssetsCents === 0) return null;
  return (
    ((response.assetsCents - response.startAssetsCents) /
      response.startAssetsCents) *
    100
  );
}

/** Moneybird billed income + combined bank-account expenses for the invoices chart. */
export function mergeInvoiceRevenueWithAccountExpenses(
  revenueMonths: readonly BankAccountCashflowMonth[],
  accountMonths: readonly BankAccountCashflowMonth[] | undefined,
): BankAccountCashflowMonth[] {
  const expenseByMonth = new Map(
    (accountMonths ?? []).map((row) => [row.month, row.expenseCents]),
  );
  return revenueMonths.map((row) => ({
    month: row.month,
    incomeCents: row.incomeCents,
    expenseCents: expenseByMonth.get(row.month) ?? 0,
  }));
}

export type InvoiceRevenueChartPoint = {
  index: number;
  /** `YYYY-MM` */
  month: string;
  /**
   * Euro units (cents / 100). `null` for future months in the current year so
   * the axis keeps all 12 ticks while the line ends (desktop `fullYear`).
   */
  invoiced: number | null;
  /** Euro units (cents / 100); expenses as positive. */
  expenses: number | null;
};

/**
 * Dual series for the invoices chart: Moneybird invoiced vs account expenses.
 * Always pads 12 months; future months are `null` so Victory ends the series.
 */
export function buildInvoiceRevenueChartPoints(input: {
  year: number;
  months: readonly BankAccountCashflowMonth[];
  asOf?: Date;
}): InvoiceRevenueChartPoint[] {
  const asOf = input.asOf ?? new Date();
  const lastMonthIndex =
    asOf.getFullYear() === input.year
      ? asOf.getMonth()
      : input.year < asOf.getFullYear()
        ? 11
        : -1;

  const byMonth = new Map(input.months.map((row) => [row.month, row]));
  const points: InvoiceRevenueChartPoint[] = [];
  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    const month = `${input.year}-${String(monthIndex + 1).padStart(2, "0")}`;
    const row = byMonth.get(month);
    const hasData = monthIndex <= lastMonthIndex;
    points.push({
      index: monthIndex,
      month,
      invoiced: hasData ? (row?.incomeCents ?? 0) / 100 : null,
      expenses: hasData ? Math.abs(row?.expenseCents ?? 0) / 100 : null,
    });
  }
  return points;
}
