import type { BacksterosApiClient } from "@backsteros/api-client";
import { Platform } from "react-native";

import {
  fetchAllMonthTransactions,
  fetchFinancialCategories,
} from "../lib/finance-api";
import { buildNonCashflowCategoryIdSet } from "../lib/cashflow-exclusion";
import {
  buildMonthIncomeExpenseDailyPoints,
  densifySeriesForSmoothLine,
} from "../lib/finance-chart-series";
import {
  asOfForMonthKey,
  currentMonthKey,
  formatCents,
  formatMonthLabel,
  formatSignedCents,
  trailingMonthKeys,
} from "../lib/finance-format";
import type {
  HomeGlanceFinanceInput,
  HomeGlanceFinanceMonthSnapshot,
} from "./home-glance-model";

/** How many months the Finance tab can step through offline. */
export const HOME_GLANCE_FINANCE_MONTH_COUNT = 6;

/** Minimal HTTP surface used by finance-api helpers (same as Whoop loader). */
type FinanceApiClient = {
  requestJson: <T>(path: string, init?: RequestInit) => Promise<T>;
};

function encodeSeries(values: readonly number[]): string {
  return values.map((value) => String(Math.round(value * 100) / 100)).join(",");
}

function balanceColorForCents(cents: number): string {
  if (cents > 0) return "#22c55e";
  if (cents < 0) return "#ef4444";
  return "#FFFFFF";
}

async function loadMonthSnapshot(
  client: FinanceApiClient,
  monthKey: string,
): Promise<HomeGlanceFinanceMonthSnapshot> {
  const api = client as BacksterosApiClient;
  const asOf = asOfForMonthKey(monthKey);

  const [transactions, categories] = await Promise.all([
    fetchAllMonthTransactions(api, monthKey).catch(() => []),
    fetchFinancialCategories(api).catch(() => []),
  ]);

  const nonCashflowCategoryIds = buildNonCashflowCategoryIdSet(categories);
  const points = buildMonthIncomeExpenseDailyPoints({
    transactions,
    asOf,
    nonCashflowCategoryIds,
  });

  const incomeValues: number[] = [];
  const expenseValues: number[] = [];
  let incomeTotalCents = 0;
  let expenseTotalCents = 0;

  for (const point of points) {
    incomeValues.push(point.income);
    expenseValues.push(point.expense);
    incomeTotalCents += Math.round(point.income * 100);
    expenseTotalCents += Math.round(point.expense * 100);
  }

  const balanceCents = incomeTotalCents - expenseTotalCents;
  const smoothIncome = densifySeriesForSmoothLine(incomeValues);
  const smoothExpense = densifySeriesForSmoothLine(expenseValues);

  return {
    monthKey,
    monthLabel: formatMonthLabel(monthKey),
    incomeTotalLabel: formatCents(incomeTotalCents),
    balanceTotalLabel: formatSignedCents(balanceCents),
    balanceColor: balanceColorForCents(balanceCents),
    expenseTotalLabel: formatCents(expenseTotalCents),
    incomeSeries: encodeSeries(smoothIncome),
    expenseSeries: encodeSeries(smoothExpense),
    dayCount: Math.max(smoothIncome.length, smoothExpense.length),
  };
}

function emptyMonthSnapshot(monthKey: string): HomeGlanceFinanceMonthSnapshot {
  return {
    monthKey,
    monthLabel: formatMonthLabel(monthKey),
    incomeTotalLabel: formatCents(0),
    balanceTotalLabel: formatSignedCents(0),
    balanceColor: balanceColorForCents(0),
    expenseTotalLabel: formatCents(0),
    incomeSeries: "",
    expenseSeries: "",
    dayCount: 0,
  };
}

/**
 * Trailing months of account income / expenses for the large widget Finance
 * tab (cashflow credits and debits across all accounts).
 */
export async function loadHomeGlanceFinance(
  client: FinanceApiClient | null | undefined,
): Promise<HomeGlanceFinanceInput> {
  const current = currentMonthKey();
  const monthKeys = trailingMonthKeys(current, HOME_GLANCE_FINANCE_MONTH_COUNT);
  const emptyMonths = monthKeys.map(emptyMonthSnapshot);
  const empty: HomeGlanceFinanceInput = {
    months: emptyMonths,
    selectedIndex: Math.max(0, emptyMonths.length - 1),
    viewMoreUrl: "backsteros-v2://finance",
  };

  if (Platform.OS !== "ios" || !client) {
    return empty;
  }

  try {
    const months = await Promise.all(
      monthKeys.map((monthKey) => loadMonthSnapshot(client, monthKey)),
    );
    return {
      months,
      selectedIndex: Math.max(0, months.length - 1),
      viewMoreUrl: "backsteros-v2://finance",
    };
  } catch {
    return empty;
  }
}
