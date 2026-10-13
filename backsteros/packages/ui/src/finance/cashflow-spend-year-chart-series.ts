import type { FinancialCategory } from "@backsteros/contracts";

import {
  DEFAULT_ENTITY_ICON_COLOR,
  getEntityIconColor,
} from "../entity/entity-icon.js";

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
} & Record<string, string | number | boolean>;

export type CashflowSpendYearSeries = {
  year: number;
  asOf: string;
  data: CashflowSpendBarRow[];
  keys: string[];
  labels: Record<string, string>;
  colors: Record<string, string>;
  ytdExpenseCents: number;
  priorYtdExpenseCents: number;
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

function parseAsOfParts(asOf: string): { year: number; month: number } {
  const [y, m] = asOf.split("-").map(Number);
  return { year: y || 0, month: m || 1 };
}

/**
 * Last calendar month that may show real values for `year`.
 * Extends through today when browsing an earlier month so later bars stay visible.
 */
function resolveVisibleThroughMonth(
  year: number,
  asOf: string,
  now = new Date(),
): number {
  const asOfParts = parseAsOfParts(asOf);
  let through = asOfParts.year === year ? asOfParts.month : asOfParts.year < year ? 0 : 12;
  if (now.getFullYear() > year) {
    through = 12;
  } else if (now.getFullYear() === year) {
    through = Math.max(through, now.getMonth() + 1);
  }
  return Math.min(12, Math.max(0, through));
}

function monthShortLabel(year: number, monthIndex: number): string {
  const date = new Date(year, monthIndex, 1);
  const month = date.toLocaleDateString(undefined, { month: "short" });
  return monthIndex === 0 ? `${month} ${year}` : month;
}

function monthLongLabel(year: number, monthIndex: number): string {
  const date = new Date(year, monthIndex, 1);
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function resolveRootCategoryId(
  categoryId: string | null,
  byId: Map<string, FinancialCategory>,
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

/**
 * Build stacked monthly spend series: top root categories by YTD spend, plus
 * Uncategorized / Other when needed. Future months are zeroed.
 */
export function buildCashflowSpendYearSeries(input: {
  year: number;
  asOf: string;
  categoryMonths: CashflowCategoryMonthSpend[];
  categories: FinancialCategory[];
  ytdExpenseCents: number;
  priorYtdExpenseCents: number;
  /** Max named category stacks before collapsing into Other (default 5). */
  topN?: number;
  /** Override “now” for tests / clock injection. */
  now?: Date;
}): CashflowSpendYearSeries {
  const topN = input.topN ?? 5;
  const asOfParts = parseAsOfParts(input.asOf);
  const visibleThroughMonth = resolveVisibleThroughMonth(
    input.year,
    input.asOf,
    input.now,
  );
  const byId = new Map(input.categories.map((row) => [row.id, row]));

  /** rootKey → month → euros */
  const totals = new Map<string, Map<string, number>>();
  const ytdByRoot = new Map<string, number>();

  for (const row of input.categoryMonths) {
    const monthIndex = Number(row.month.slice(5)) - 1;
    const isFuture = monthIndex + 1 > visibleThroughMonth;
    if (isFuture) continue;

    const rootKey = resolveRootCategoryId(row.categoryId, byId);
    // Net-spend polarity from the API: only stack positive outflow.
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

  // Top N real categories by spend, then uncategorized, then other.
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
      getEntityIconColor(category?.icon) ??
      FALLBACK_PALETTE[paletteIndex % FALLBACK_PALETTE.length] ??
      DEFAULT_ENTITY_ICON_COLOR;
    paletteIndex += 1;
  }

  const overflowSet = new Set(overflowKeys);
  const data: CashflowSpendBarRow[] = [];

  for (let index = 0; index < 12; index += 1) {
    const month = `${input.year}-${String(index + 1).padStart(2, "0")}`;
    const isFutureMonth = index + 1 > visibleThroughMonth;
    const isCurrentMonth =
      asOfParts.year === input.year && index + 1 === asOfParts.month;

    const row: CashflowSpendBarRow = {
      month,
      monthLabel: monthShortLabel(input.year, index),
      tooltipLabel: monthLongLabel(input.year, index),
      isCurrentMonth,
      isFutureMonth,
    };

    for (const key of keys) {
      row[key] = 0;
    }

    if (!isFutureMonth) {
      for (const [rootKey, monthMap] of totals) {
        const value = monthMap.get(month) ?? 0;
        if (value <= 0) continue;
        if (keys.includes(rootKey)) {
          row[rootKey] = Number(row[rootKey] ?? 0) + value;
        } else if (overflowSet.has(rootKey) && hasOther) {
          row[CASHFLOW_SPEND_OTHER_KEY] =
            Number(row[CASHFLOW_SPEND_OTHER_KEY] ?? 0) + value;
        }
      }
    }

    data.push(row);
  }

  return {
    year: input.year,
    asOf: input.asOf,
    data,
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
  return series.data.some((row) =>
    series.keys.some((key) => Number(row[key] ?? 0) > 0),
  );
}
