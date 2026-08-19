import type {
  FinanceAssetsDebt,
  FinanceAssetsDebtRange,
  FinancialTransaction,
  WorkspaceCashflow,
} from "@backsteros/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { buildNonCashflowCategoryIdSet } from "./cashflow-exclusion";
import {
  fetchAllMonthTransactions,
  fetchAssetsDebt,
  fetchTransactions,
  fetchWorkspaceCashflow,
} from "./finance-api";
import {
  buildMonthIncomeExpenseDailyPoints,
  type CategoryMonthSpend,
  type IncomeExpenseDailyPoint,
} from "./finance-chart-series";
import { asOfForMonthKey } from "./finance-format";
import { useFinanceCategories } from "./use-finance-categories";
import { useMobileApiClient } from "./use-mobile-api-client";

const REVIEW_PREVIEW_LIMIT = 3;

type CashflowSlice = {
  months: WorkspaceCashflow["months"];
  categoryMonths: CategoryMonthSpend[];
};

export type FinanceReviewPreview = {
  transactions: FinancialTransaction[];
  total: number;
};

/**
 * Dashboard aggregates: daily income/expense for the selected month, review
 * preview, assets/debt, and category months for the top-categories widget.
 */
export function useFinanceDashboard(input: {
  monthKey: string;
  assetsRange: FinanceAssetsDebtRange;
}) {
  const { monthKey, assetsRange } = input;
  const client = useMobileApiClient();
  const categories = useFinanceCategories();

  const [cashflow, setCashflow] = useState<CashflowSlice | null>(null);
  const [cashflowLoading, setCashflowLoading] = useState(true);
  const [monthTransactions, setMonthTransactions] = useState<
    FinancialTransaction[]
  >([]);
  const [monthChartLoading, setMonthChartLoading] = useState(true);
  const [review, setReview] = useState<FinanceReviewPreview | null>(null);
  const [assetsDebt, setAssetsDebt] = useState<FinanceAssetsDebt | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cashflowEpochRef = useRef(0);
  const loadCashflow = useCallback(async () => {
    const epoch = ++cashflowEpochRef.current;
    setCashflowLoading(true);
    try {
      const year = Number(monthKey.slice(0, 4));
      const slice = await fetchWorkspaceCashflow(client, year);
      if (cashflowEpochRef.current !== epoch) return;
      setCashflow({
        months: slice.months,
        categoryMonths: slice.categoryMonths,
      });
      setError(null);
    } catch (reason) {
      if (cashflowEpochRef.current !== epoch) return;
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (cashflowEpochRef.current === epoch) setCashflowLoading(false);
    }
  }, [client, monthKey]);

  const monthTxEpochRef = useRef(0);
  const loadMonthTransactions = useCallback(async () => {
    const epoch = ++monthTxEpochRef.current;
    setMonthChartLoading(true);
    try {
      const rows = await fetchAllMonthTransactions(client, monthKey);
      if (monthTxEpochRef.current !== epoch) return;
      setMonthTransactions(rows);
    } catch {
      if (monthTxEpochRef.current !== epoch) return;
      setMonthTransactions([]);
    } finally {
      if (monthTxEpochRef.current === epoch) setMonthChartLoading(false);
    }
  }, [client, monthKey]);

  const loadReview = useCallback(async () => {
    try {
      const page = await fetchTransactions(client, {
        uncategorized: true,
        limit: REVIEW_PREVIEW_LIMIT,
        includeTotal: true,
      });
      setReview({
        transactions: page.transactions,
        total: page.total ?? page.transactions.length,
      });
    } catch {
      // Widget stays hidden on failure; dashboard still renders.
    }
  }, [client]);

  const assetsEpochRef = useRef(0);
  const loadAssetsDebt = useCallback(async () => {
    const epoch = ++assetsEpochRef.current;
    try {
      const response = await fetchAssetsDebt(client, assetsRange);
      if (assetsEpochRef.current !== epoch) return;
      setAssetsDebt(response);
    } catch {
      // Keep the previous range's chart on transient failures.
    }
  }, [assetsRange, client]);

  useEffect(() => {
    void loadCashflow();
  }, [loadCashflow]);

  useEffect(() => {
    void loadMonthTransactions();
  }, [loadMonthTransactions]);

  useEffect(() => {
    void loadReview();
  }, [loadReview]);

  useEffect(() => {
    void loadAssetsDebt();
  }, [loadAssetsDebt]);

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadCashflow(),
        loadMonthTransactions(),
        loadReview(),
        loadAssetsDebt(),
        categories.reload(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [
    categories,
    loadAssetsDebt,
    loadCashflow,
    loadMonthTransactions,
    loadReview,
  ]);

  const nonCashflowCategoryIds = useMemo(
    () => buildNonCashflowCategoryIdSet(categories.rows),
    [categories.rows],
  );

  const asOf = useMemo(() => asOfForMonthKey(monthKey), [monthKey]);

  const monthIncomeExpensePoints = useMemo(
    (): IncomeExpenseDailyPoint[] =>
      buildMonthIncomeExpenseDailyPoints({
        transactions: monthTransactions,
        asOf,
        nonCashflowCategoryIds,
      }),
    [asOf, monthTransactions, nonCashflowCategoryIds],
  );

  const monthCashflow = useMemo(
    () => cashflow?.months.find((entry) => entry.month === monthKey) ?? null,
    [cashflow, monthKey],
  );

  const categoryMonths = cashflow?.categoryMonths ?? [];

  return {
    monthIncomeExpensePoints,
    monthChartLoading,
    monthCashflow,
    categoryMonths,
    review,
    assetsDebt,
    categories: categories.rows,
    loading: cashflowLoading && !cashflow,
    refreshing,
    error,
    reload,
  };
}
