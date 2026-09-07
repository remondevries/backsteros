import type { BacksterosApiClient } from "@backsteros/api-client";
import type {
  FinanceAssetsDebt,
  FinanceAssetsDebtRange,
  FinancialCategory,
  FinancialTransaction,
} from "@backsteros/contracts";
import { isBalanceAffectingFinancialSettlement } from "@backsteros/contracts";
import {
  previousMonthKey,
  type FinanceAccountMetrics,
  type FinanceAccountsChromeState,
  type FinanceCategoriesChromeState,
  type FinanceCategoryMetrics,
  type FinanceGoalsChromeState,
  type FinanceNavId,
  type FinanceRecurringMetrics,
  type FinanceRecurringsChromeState,
} from "@backsteros/ui";
import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

export function useFinanceSectionData({
  client,
  navId,
  categories,
  categoriesChrome,
  setGoalsChrome,
  setRecurringsChrome,
  setAccountsChrome,
}: {
  client: BacksterosApiClient;
  navId: FinanceNavId | null;
  categories: FinancialCategory[];
  categoriesChrome: FinanceCategoriesChromeState | null;
  setGoalsChrome: Dispatch<SetStateAction<FinanceGoalsChromeState | null>>;
  setRecurringsChrome: Dispatch<
    SetStateAction<FinanceRecurringsChromeState | null>
  >;
  setAccountsChrome: Dispatch<
    SetStateAction<FinanceAccountsChromeState | null>
  >;
}) {
  const [assetsDebt, setAssetsDebt] = useState<FinanceAssetsDebt | null>(null);
  const [assetsDebtLoading, setAssetsDebtLoading] = useState(false);
  const [assetsDebtRange, setAssetsDebtRange] =
    useState<FinanceAssetsDebtRange>("1M");
  const [categorySpendById, setCategorySpendById] = useState<
    Record<string, number>
  >({});
  const [categorySpendMonth, setCategorySpendMonth] = useState<string | null>(
    null,
  );
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [goalTransactions, setGoalTransactions] = useState<
    FinancialTransaction[]
  >([]);
  const [goalTransactionsLoading, setGoalTransactionsLoading] = useState(false);
  const [selectedRecurringId, setSelectedRecurringId] = useState<string | null>(
    null,
  );
  const [recurringMetrics, setRecurringMetrics] =
    useState<FinanceRecurringMetrics | null>(null);
  const [recurringMetricsLoading, setRecurringMetricsLoading] = useState(false);
  const [monthIncomeCents, setMonthIncomeCents] = useState(0);
  const [categoryMetrics, setCategoryMetrics] =
    useState<FinanceCategoryMetrics | null>(null);
  const [categoryMetricsLoading, setCategoryMetricsLoading] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );
  const [accountCashflowYear, setAccountCashflowYear] = useState(() =>
    new Date().getFullYear(),
  );
  const [accountMetrics, setAccountMetrics] =
    useState<FinanceAccountMetrics | null>(null);
  const [accountMetricsLoading, setAccountMetricsLoading] = useState(false);
  const [accountBalanceById, setAccountBalanceById] = useState<
    Record<string, number>
  >({});
  const [reviewTransactions, setReviewTransactions] = useState<
    FinancialTransaction[]
  >([]);
  const [reviewTotalCount, setReviewTotalCount] = useState(0);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [dashboardSpendLoading, setDashboardSpendLoading] = useState(false);
  const [dashboardMonthTransactions, setDashboardMonthTransactions] = useState<
    FinancialTransaction[]
  >([]);
  const [dashboardPriorMonthTransactions, setDashboardPriorMonthTransactions] =
    useState<FinancialTransaction[]>([]);
  const [dashboardMonthChartLoading, setDashboardMonthChartLoading] =
    useState(false);
  const [dashboardChartMonth, setDashboardChartMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const localMonthKey = useCallback(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const refreshCategorySpend = useCallback(
    async (monthOverride?: string) => {
      // Prefer the current local month; if it has no transactions yet (common
      // right after month rollover / with lagged CSV imports), use the latest
      // month that actually has data so Spent reflects categorized activity.
      let month = monthOverride ?? localMonthKey();
      if (!monthOverride) {
        const probeCurrent = await client.requestJson<{
          transactions: FinancialTransaction[];
        }>(
          `/api/v1/transactions?${new URLSearchParams({
            month,
            limit: "1",
          })}`,
        );
        if (probeCurrent.transactions.length === 0) {
          const latest = await client.requestJson<{
            transactions: FinancialTransaction[];
          }>(`/api/v1/transactions?${new URLSearchParams({ limit: "1" })}`);
          const bookedOn = latest.transactions[0]?.bookedOn;
          if (bookedOn && /^\d{4}-\d{2}/.test(bookedOn)) {
            month = bookedOn.slice(0, 7);
          }
        }
      }

      // Net-spend polarity per category (positive = outflow). Credits in the
      // same category reduce spend so reimbursements lower Restaurant/Rent totals.
      const spent: Record<string, number> = {};
      let cursor: string | null = null;
      do {
        const params = new URLSearchParams({
          month,
          limit: "500",
        });
        if (cursor) params.set("cursor", cursor);
        const body = await client.requestJson<{
          transactions: FinancialTransaction[];
          nextCursor: string | null;
        }>(`/api/v1/transactions?${params}`);
        for (const tx of body.transactions) {
          if (!tx.categoryId || tx.amountCents === 0) continue;
          spent[tx.categoryId] =
            (spent[tx.categoryId] ?? 0) + -tx.amountCents;
        }
        cursor = body.nextCursor;
      } while (cursor);
      setCategorySpendMonth(month);
      setCategorySpendById(spent);
    },
    [client, localMonthKey],
  );

  const handleSpentMonthChange = useCallback(
    (month: string) => {
      setCategorySpendMonth(month);
      void refreshCategorySpend(month).catch(() => {
        setCategorySpendById({});
      });
    },
    [refreshCategorySpend],
  );

  const handleDashboardMonthChange = useCallback((month: string) => {
    setDashboardChartMonth(month);
  }, []);

  useEffect(() => {
    if (navId !== "categories") return;
    void refreshCategorySpend().catch(() => {
      setCategorySpendById({});
      setCategorySpendMonth(null);
    });
  }, [navId, refreshCategorySpend]);

  useEffect(() => {
    if (navId !== "dashboard") return;
    setDashboardSpendLoading(true);
    void refreshCategorySpend(dashboardChartMonth)
      .catch(() => {
        setCategorySpendById({});
        setCategorySpendMonth(null);
      })
      .finally(() => {
        setDashboardSpendLoading(false);
      });
  }, [dashboardChartMonth, navId, refreshCategorySpend]);

  const refreshReviewTransactions = useCallback(async () => {
    setReviewLoading(true);
    try {
      const params = new URLSearchParams({
        uncategorized: "true",
        limit: "50",
        includeTotal: "true",
      });
      const body = await client.requestJson<{
        transactions: FinancialTransaction[];
        total?: number;
      }>(`/api/v1/transactions?${params}`);
      setReviewTransactions(body.transactions);
      setReviewTotalCount(
        typeof body.total === "number"
          ? body.total
          : body.transactions.length,
      );
    } finally {
      setReviewLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (navId !== "dashboard") return;
    void refreshReviewTransactions().catch(() => {
      setReviewTransactions([]);
      setReviewTotalCount(0);
    });
  }, [navId, refreshReviewTransactions]);

  const refreshAccountBalances = useCallback(async () => {
    const body = await client.requestJson<{
      balances: Array<{ bankAccountId: string; balanceCents: number }>;
    }>("/api/v1/bank-accounts/balances");
    const next: Record<string, number> = {};
    for (const row of body.balances) {
      next[row.bankAccountId] = row.balanceCents;
    }
    setAccountBalanceById(next);
  }, [client]);

  const refreshMonthIncome = useCallback(async () => {
    const month = localMonthKey();
    const body = await client.requestJson<{
      month: string;
      incomeCents: number;
    }>(
      `/api/v1/bank-accounts/month-income?month=${encodeURIComponent(month)}`,
    );
    setMonthIncomeCents(body.incomeCents);
  }, [client, localMonthKey]);

  useEffect(() => {
    if (navId !== "dashboard") return;
    let cancelled = false;
    setAssetsDebtLoading(true);
    void (async () => {
      try {
        const body = await client.requestJson<FinanceAssetsDebt>(
          `/api/v1/finance/assets-debt?range=${encodeURIComponent(assetsDebtRange)}`,
        );
        if (!cancelled) setAssetsDebt(body);
      } catch {
        if (!cancelled) setAssetsDebt(null);
      } finally {
        if (!cancelled) setAssetsDebtLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assetsDebtRange, client, navId]);

  useEffect(() => {
    if (navId !== "accounts") return;
    void refreshAccountBalances().catch(() => {
      setAccountBalanceById({});
    });
  }, [navId, refreshAccountBalances]);

  useEffect(() => {
    if (navId !== "goals") return;
    void refreshMonthIncome().catch(() => {
      setMonthIncomeCents(0);
    });
  }, [navId, refreshMonthIncome]);

  const selectedCategoryId =
    navId === "categories" ? (categoriesChrome?.category?.id ?? null) : null;

  const fetchCategoryMetrics = useCallback(
    async (categoryId: string): Promise<FinanceCategoryMetrics> => {
      const childIds = categories
        .filter((row) => row.parentId === categoryId)
        .map((row) => row.id);
      const ids = [categoryId, ...childIds];

      // Net spend per month (YYYY-MM): expenses add, income subtracts.
      const monthTotals = new Map<string, number>();
      const allTransactions: FinancialTransaction[] = [];
      let cursor: string | null = null;
      do {
        const params = new URLSearchParams({
          categoryIds: ids.join(","),
          limit: "500",
        });
        if (cursor) params.set("cursor", cursor);
        const body = await client.requestJson<{
          transactions: FinancialTransaction[];
          nextCursor: string | null;
        }>(`/api/v1/transactions?${params}`);
        for (const tx of body.transactions) {
          allTransactions.push(tx);
          const bookedOn = tx.bookedOn;
          if (!bookedOn || !/^\d{4}-\d{2}/.test(bookedOn)) continue;
          const key = bookedOn.slice(0, 7);
          monthTotals.set(key, (monthTotals.get(key) ?? 0) - tx.amountCents);
        }
        cursor = body.nextCursor;
      } while (cursor);

      allTransactions.sort((a, b) =>
        a.bookedOn < b.bookedOn ? 1 : a.bookedOn > b.bookedOn ? -1 : 0,
      );

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      const yearTotals = new Map<number, number>();
      for (const [key, cents] of monthTotals) {
        const year = Number(key.slice(0, 4));
        yearTotals.set(year, (yearTotals.get(year) ?? 0) + cents);
      }
      const years = [...yearTotals.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([year, cents]) => {
          const elapsedMonths =
            year < currentYear ? 12 : year === currentYear ? currentMonth : 12;
          const avgMonthlyCents =
            elapsedMonths > 0 ? Math.round(cents / elapsedMonths) : 0;
          return { year, spentCents: cents, avgMonthlyCents };
        });

      const months = [...monthTotals.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .slice(-12)
        .map(([month, cents]) => ({ month, spentCents: cents }));

      return { categoryId, months, years, transactions: allTransactions };
    },
    [categories, client],
  );

  useEffect(() => {
    if (!selectedCategoryId) {
      setCategoryMetrics(null);
      setCategoryMetricsLoading(false);
      return;
    }
    let cancelled = false;
    setCategoryMetricsLoading(true);
    void fetchCategoryMetrics(selectedCategoryId)
      .then((metrics) => {
        if (!cancelled) setCategoryMetrics(metrics);
      })
      .catch(() => {
        if (!cancelled) setCategoryMetrics(null);
      })
      .finally(() => {
        if (!cancelled) setCategoryMetricsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCategoryId, fetchCategoryMetrics]);

  const fetchAccountCashflow = useCallback(
    async (accountId: string, year = new Date().getFullYear()) => {
      return client.requestJson<{
        bankAccountId: string;
        year: number;
        months: Array<{
          month: string;
          incomeCents: number;
          expenseCents: number;
        }>;
      }>(
        `/api/v1/bank-accounts/${encodeURIComponent(accountId)}/cashflow?year=${year}`,
      );
    },
    [client],
  );

  useEffect(() => {
    if (navId !== "dashboard") return;
    let cancelled = false;
    const month = dashboardChartMonth;
    const priorMonth = previousMonthKey(month);
    setDashboardMonthTransactions([]);
    setDashboardPriorMonthTransactions([]);
    setDashboardMonthChartLoading(true);

    async function loadMonthTransactions(
      targetMonth: string,
    ): Promise<FinancialTransaction[]> {
      const rows: FinancialTransaction[] = [];
      let cursor: string | null = null;
      do {
        const params = new URLSearchParams({
          month: targetMonth,
          limit: "500",
        });
        if (cursor) params.set("cursor", cursor);
        const body = await client.requestJson<{
          transactions: FinancialTransaction[];
          nextCursor: string | null;
        }>(`/api/v1/transactions?${params}`);
        rows.push(...body.transactions);
        cursor = body.nextCursor;
      } while (cursor);
      return rows;
    }

    void (async () => {
      try {
        const [currentRows, priorRows] = await Promise.all([
          loadMonthTransactions(month),
          priorMonth
            ? loadMonthTransactions(priorMonth)
            : Promise.resolve([] as FinancialTransaction[]),
        ]);
        if (!cancelled) {
          setDashboardMonthTransactions(currentRows);
          setDashboardPriorMonthTransactions(priorRows);
        }
      } catch {
        if (!cancelled) {
          setDashboardMonthTransactions([]);
          setDashboardPriorMonthTransactions([]);
        }
      } finally {
        if (!cancelled) setDashboardMonthChartLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, dashboardChartMonth, navId]);

  const fetchAccountMetrics = useCallback(
    async (
      accountId: string,
      options?: {
        cashflow?: {
          year: number;
          months: Array<{
            month: string;
            incomeCents: number;
            expenseCents: number;
          }>;
        };
      },
    ): Promise<FinanceAccountMetrics> => {
      const year = options?.cashflow?.year ?? new Date().getFullYear();
      const cashflow =
        options?.cashflow ?? (await fetchAccountCashflow(accountId, year));

      const allTransactions: FinancialTransaction[] = [];
      let balanceCents = 0;
      let cursor: string | null = null;
      do {
        const params = new URLSearchParams({ limit: "500" });
        if (cursor) params.set("cursor", cursor);
        const body = await client.requestJson<{
          transactions: FinancialTransaction[];
          nextCursor: string | null;
        }>(
          `/api/v1/bank-accounts/${encodeURIComponent(accountId)}/transactions?${params}`,
        );
        for (const tx of body.transactions) {
          allTransactions.push(tx);
          if (isBalanceAffectingFinancialSettlement(tx.settlementState)) {
            balanceCents += tx.amountCents;
          }
        }
        cursor = body.nextCursor;
      } while (cursor);

      allTransactions.sort((a, b) =>
        a.bookedOn < b.bookedOn ? 1 : a.bookedOn > b.bookedOn ? -1 : 0,
      );

      return {
        accountId,
        balanceCents,
        transactions: allTransactions,
        cashflowYear: cashflow.year,
        cashflowMonths: cashflow.months,
        cashflowLoading: false,
      };
    },
    [client, fetchAccountCashflow],
  );

  useEffect(() => {
    if (!selectedAccountId) {
      setAccountMetrics(null);
      setAccountMetricsLoading(false);
      return;
    }
    let cancelled = false;
    const year = accountCashflowYear;
    const seededBalance = accountBalanceById[selectedAccountId] ?? 0;
    setAccountMetricsLoading(true);
    setAccountMetrics({
      accountId: selectedAccountId,
      balanceCents: seededBalance,
      transactions: [],
      cashflowYear: year,
      cashflowMonths: null,
      cashflowLoading: true,
    });

    void (async () => {
      try {
        const cashflow = await fetchAccountCashflow(selectedAccountId, year);
        if (cancelled) return;
        setAccountMetrics((current) =>
          current?.accountId === selectedAccountId
            ? {
                ...current,
                cashflowYear: cashflow.year,
                cashflowMonths: cashflow.months,
                cashflowLoading: false,
              }
            : current,
        );

        const metrics = await fetchAccountMetrics(selectedAccountId, {
          cashflow,
        });
        if (cancelled) return;
        setAccountMetrics(metrics);
        setAccountBalanceById((current) => ({
          ...current,
          [metrics.accountId]: metrics.balanceCents,
        }));
      } catch {
        if (!cancelled) {
          setAccountMetrics((current) =>
            current?.accountId === selectedAccountId
              ? { ...current, cashflowLoading: false }
              : null,
          );
        }
      } finally {
        if (!cancelled) setAccountMetricsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Seed balance from the map at selection time only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedAccountId,
    accountCashflowYear,
    fetchAccountCashflow,
    fetchAccountMetrics,
  ]);

  useEffect(() => {
    if (navId === "goals") return;
    setGoalsChrome(null);
    setSelectedGoalId(null);
    setGoalTransactions([]);
  }, [navId]);

  useEffect(() => {
    if (navId === "recurrings") return;
    setRecurringsChrome(null);
    setSelectedRecurringId(null);
    setRecurringMetrics(null);
  }, [navId]);

  useEffect(() => {
    if (navId !== "goals" || !selectedGoalId) {
      setGoalTransactions([]);
      return;
    }
    let cancelled = false;
    setGoalTransactionsLoading(true);
    void (async () => {
      try {
        const params = new URLSearchParams({
          goalId: selectedGoalId,
          limit: "500",
        });
        const body = await client.requestJson<{
          transactions: FinancialTransaction[];
        }>(`/api/v1/transactions?${params}`);
        if (!cancelled) {
          setGoalTransactions(body.transactions);
        }
      } catch {
        if (!cancelled) setGoalTransactions([]);
      } finally {
        if (!cancelled) setGoalTransactionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, navId, selectedGoalId]);

  const fetchRecurringMetrics = useCallback(
    async (recurringId: string): Promise<FinanceRecurringMetrics> => {
      const allTransactions: FinancialTransaction[] = [];
      const monthTotals = new Map<string, number>();
      let cursor: string | null = null;
      do {
        const params = new URLSearchParams({
          recurringId,
          limit: "500",
        });
        if (cursor) params.set("cursor", cursor);
        const body = await client.requestJson<{
          transactions: FinancialTransaction[];
          nextCursor: string | null;
        }>(`/api/v1/transactions?${params}`);
        for (const tx of body.transactions) {
          allTransactions.push(tx);
          const bookedOn = tx.bookedOn;
          if (!bookedOn || !/^\d{4}-\d{2}/.test(bookedOn)) continue;
          const key = bookedOn.slice(0, 7);
          monthTotals.set(key, (monthTotals.get(key) ?? 0) - tx.amountCents);
        }
        cursor = body.nextCursor;
      } while (cursor);

      allTransactions.sort((a, b) =>
        a.bookedOn < b.bookedOn ? 1 : a.bookedOn > b.bookedOn ? -1 : 0,
      );

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const yearTotals = new Map<number, number>();
      for (const [key, cents] of monthTotals) {
        const year = Number(key.slice(0, 4));
        yearTotals.set(year, (yearTotals.get(year) ?? 0) + cents);
      }
      const years = [...yearTotals.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([year, cents]) => {
          const elapsedMonths =
            year < currentYear ? 12 : year === currentYear ? currentMonth : 12;
          const avgMonthlyCents =
            elapsedMonths > 0 ? Math.round(cents / elapsedMonths) : 0;
          return { year, spentCents: cents, avgMonthlyCents };
        });

      return { recurringId, years, transactions: allTransactions };
    },
    [client],
  );

  useEffect(() => {
    if (navId !== "recurrings" || !selectedRecurringId) {
      setRecurringMetrics(null);
      setRecurringMetricsLoading(false);
      return;
    }
    let cancelled = false;
    setRecurringMetricsLoading(true);
    void fetchRecurringMetrics(selectedRecurringId)
      .then((metrics) => {
        if (!cancelled) setRecurringMetrics(metrics);
      })
      .catch(() => {
        if (!cancelled) setRecurringMetrics(null);
      })
      .finally(() => {
        if (!cancelled) setRecurringMetricsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchRecurringMetrics, navId, selectedRecurringId]);

  useEffect(() => {
    if (navId === "accounts") return;
    setAccountsChrome(null);
    setSelectedAccountId(null);
  }, [navId]);

  return {
    categorySpendById,
    categorySpendMonth,
    localMonthKey,
    refreshCategorySpend,
    handleSpentMonthChange,
    handleDashboardMonthChange,
    selectedCategoryId,
    categoryMetrics,
    setCategoryMetrics,
    categoryMetricsLoading,
    fetchCategoryMetrics,
    assetsDebt,
    assetsDebtLoading,
    assetsDebtRange,
    setAssetsDebtRange,
    reviewTransactions,
    setReviewTransactions,
    reviewTotalCount,
    setReviewTotalCount,
    reviewLoading,
    dashboardSpendLoading,
    dashboardMonthTransactions,
    dashboardPriorMonthTransactions,
    dashboardMonthChartLoading,
    dashboardChartMonth,
    accountBalanceById,
    selectedAccountId,
    setSelectedAccountId,
    accountCashflowYear,
    setAccountCashflowYear,
    accountMetrics,
    setAccountMetrics,
    accountMetricsLoading,
    fetchAccountMetrics,
    monthIncomeCents,
    goalTransactions,
    setGoalTransactions,
    goalTransactionsLoading,
    setSelectedGoalId,
    recurringMetrics,
    setRecurringMetrics,
    recurringMetricsLoading,
    setSelectedRecurringId,
  };
}
