import type {
  BankAccount,
  BankAccountCashflowMonth,
  FinanceAssetsDebt,
  FinanceAssetsDebtRange,
  FinanceSpendPanel,
  FinancialCategory,
  FinancialGoal,
  FinancialImportBatch,
  FinancialImportResult,
  FinancialRecurring,
  FinancialTransaction,
  MoneybirdInvoiceRevenue,
  MoneybirdSalesInvoiceDetail,
  MoneybirdSalesInvoiceSummary,
  MoneybirdSettings,
  WorkspaceCashflow,
} from "@backsteros/contracts";
import {
  AccountActionsMenu,
  TransactionActionsMenu,
  CategoryActionsMenu,
  DROPDOWN_NONE_VALUE,
  DROPDOWN_NO_GOAL_VALUE,
  DROPDOWN_NO_RECURRING_VALUE,
  FinanceAccountsView,
  FinanceBankAccountModal,
  FinanceCashflowView,
  FinanceCategoriesView,
  FinanceDashboardView,
  FinanceGoalsView,
  FinanceImportModal,
  FinanceInvoicesView,
  FinanceRecurringsView,
  FinanceSectionPlaceholder,
  FinanceTransactionsView,
  GoalActionsMenu,
  ProjectsSidePanelIcon,
  RecurringActionsMenu,
  RegisterPageTitle,
  SyncStatusIdleIcon,
  accountReorderPatches,
  applyOptimisticAccountReorder,
  applyOptimisticCategoryReorder,
  applyOptimisticGoalReorder,
  applyOptimisticRecurringReorder,
  bankAccountMatchesSlug,
  buildMoneybirdInvoicesFilter,
  categoryReorderPatches,
  getFinanceHref,
  getFinanceNavHref,
  getFinanceDashboardHref,
  getFinanceTransactionsHref,
  goalReorderPatches,
  isFinanceNavId,
  previousMonthKey,
  recurringDateGroup,
  recurringReorderPatches,
  type FinanceAccountMetrics,
  type FinanceAccountsChromeState,
  type FinanceCategoriesChromeState,
  type FinanceCategoryMetrics,
  type FinanceGoalCreateInput,
  type FinanceGoalsChromeState,
  type FinanceGoalUpdateInput,
  type FinanceListReorderRequest,
  type FinanceNavId,
  type FinanceRecurringCreateInput,
  type FinanceRecurringMetrics,
  type FinanceRecurringUpdateInput,
  type FinanceRecurringsChromeState,
  type FinanceTransactionsChromeState,
  type RecurringReorderGroup,
} from "@backsteros/ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate, useParams } from "react-router-dom";

const BANK_ACCOUNTS_CHANGED_EVENT = "backsteros:bank-accounts-changed";

function notifyBankAccountsChanged() {
  window.dispatchEvent(new Event(BANK_ACCOUNTS_CHANGED_EVENT));
}

import { useDesktopApi } from "../lib/api-context";
import { useDesktopAvatarSrcMap } from "../lib/avatar-src";
import {
  removeDesktopAvatar,
  uploadDesktopAvatar,
} from "../lib/avatar-upload";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useDesktopWorkspaceData } from "../lib/workspace-data";

function accountSlug(account: { key?: string | null; id: string }) {
  return account.key ?? account.id;
}

function financeLocalMonthKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** Moneybird billed income + combined bank-account expenses for the invoices chart. */
function mergeInvoiceRevenueWithAccountExpenses(
  revenueMonths: BankAccountCashflowMonth[],
  accountMonths: BankAccountCashflowMonth[] | undefined,
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

function seedRecurringNextDateForGroup(group: RecurringReorderGroup): string {
  const now = new Date();
  if (group === "this_month") {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function resolveRecurringReorderGroup(
  row: FinancialRecurring,
): RecurringReorderGroup {
  return recurringDateGroup(
    row.nextDate,
    financeLocalMonthKey(),
    new Date(),
    Boolean(row.archived),
  );
}

function applyRecurringReorderGroup(
  row: FinancialRecurring,
  group: RecurringReorderGroup,
): FinancialRecurring {
  if (group === "archived") return { ...row, archived: true };
  if (resolveRecurringReorderGroup(row) === group) {
    return { ...row, archived: false };
  }
  return {
    ...row,
    archived: false,
    nextDate: seedRecurringNextDateForGroup(group),
  };
}

export function FinancePage() {
  const navigate = useNavigate();
  const { slug, section: sectionParam } = useParams<{
    slug?: string;
    section?: string;
  }>();
  const { client } = useDesktopApi();
  const workspace = useDesktopWorkspaceData();
  const { organizations, projects } = workspace;

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [imports, setImports] = useState<FinancialImportBatch[]>([]);
  const [importAccountId, setImportAccountId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [amountMinCents, setAmountMinCents] = useState<number | null>(null);
  const [amountMaxCents, setAmountMaxCents] = useState<number | null>(null);
  const [filterCategoryIds, setFilterCategoryIds] = useState<string[]>([]);
  const [filterOrganizationId, setFilterOrganizationId] = useState<
    string | null
  >(null);
  const [filterGoalId, setFilterGoalId] = useState<string | null>(null);
  const [filterRecurringId, setFilterRecurringId] = useState<string | null>(
    null,
  );
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvProgress, setCsvProgress] = useState<number | null>(null);
  const [lastImportResult, setLastImportResult] =
    useState<FinancialImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [categoriesPending, setCategoriesPending] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [goalsPending, setGoalsPending] = useState(false);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [goalsError, setGoalsError] = useState<string | null>(null);
  const [workspaceCashflow, setWorkspaceCashflow] =
    useState<WorkspaceCashflow | null>(null);
  const [workspaceCashflowLoading, setWorkspaceCashflowLoading] =
    useState(false);
  const [workspaceCashflowError, setWorkspaceCashflowError] = useState<
    string | null
  >(null);
  const [moneybirdInvoices, setMoneybirdInvoices] = useState<
    MoneybirdSalesInvoiceSummary[]
  >([]);
  const [moneybirdInvoicesLoading, setMoneybirdInvoicesLoading] =
    useState(false);
  const [moneybirdInvoicesError, setMoneybirdInvoicesError] = useState<
    string | null
  >(null);
  const [moneybirdInvoicesPage, setMoneybirdInvoicesPage] = useState(1);
  const [moneybirdInvoicesTotalPages, setMoneybirdInvoicesTotalPages] =
    useState(1);
  const [moneybirdInvoicesHasMore, setMoneybirdInvoicesHasMore] =
    useState(false);
  const [moneybirdInvoicesYear, setMoneybirdInvoicesYear] = useState(() =>
    new Date().getFullYear(),
  );
  const [moneybirdInvoiceStatusIds, setMoneybirdInvoiceStatusIds] = useState<
    string[]
  >([]);
  const [moneybirdConnected, setMoneybirdConnected] = useState(false);
  const [moneybirdRevenueYear, setMoneybirdRevenueYear] = useState<
    number | null
  >(null);
  const [moneybirdRevenueMonths, setMoneybirdRevenueMonths] = useState<
    BankAccountCashflowMonth[] | null
  >(null);
  const [moneybirdRevenueLoading, setMoneybirdRevenueLoading] = useState(false);
  const [selectedMoneybirdInvoiceId, setSelectedMoneybirdInvoiceId] = useState<
    string | null
  >(null);
  const [moneybirdInvoiceDetail, setMoneybirdInvoiceDetail] =
    useState<MoneybirdSalesInvoiceDetail | null>(null);
  const [moneybirdInvoiceDetailLoading, setMoneybirdInvoiceDetailLoading] =
    useState(false);
  const [moneybirdInvoiceDetailError, setMoneybirdInvoiceDetailError] = useState<
    string | null
  >(null);
  const [spendPanel, setSpendPanel] = useState<FinanceSpendPanel | null>(null);
  const [spendPanelLoading, setSpendPanelLoading] = useState(false);
  const [spendPanelMonth, setSpendPanelMonth] = useState<string | null>(null);
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
  const [categoriesChrome, setCategoriesChrome] =
    useState<FinanceCategoriesChromeState | null>(null);
  const [goalsChrome, setGoalsChrome] =
    useState<FinanceGoalsChromeState | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [goalTransactions, setGoalTransactions] = useState<
    FinancialTransaction[]
  >([]);
  const [goalTransactionsLoading, setGoalTransactionsLoading] = useState(false);
  const [recurrings, setRecurrings] = useState<FinancialRecurring[]>([]);
  const [recurringsPending, setRecurringsPending] = useState(false);
  const [recurringsLoading, setRecurringsLoading] = useState(false);
  const [recurringsError, setRecurringsError] = useState<string | null>(null);
  const [recurringsChrome, setRecurringsChrome] =
    useState<FinanceRecurringsChromeState | null>(null);
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
  const [accountsChrome, setAccountsChrome] =
    useState<FinanceAccountsChromeState | null>(null);
  const [transactionsChrome, setTransactionsChrome] =
    useState<FinanceTransactionsChromeState | null>(null);
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllPending, setSelectAllPending] = useState(false);
  const lastClickedIdRef = useRef<string | null>(null);
  const [pageAccountModal, setPageAccountModal] = useState<
    | { mode: "create"; type?: BankAccount["type"] }
    | { mode: "edit"; account: BankAccount }
    | null
  >(null);
  const [pageAccountModalPending, setPageAccountModalPending] = useState(false);
  const [pageAccountModalError, setPageAccountModalError] = useState<
    string | null
  >(null);
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
  const [cashflowChartMonth, setCashflowChartMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const navId: FinanceNavId | null = isFinanceNavId(slug) ? slug : null;
  const allAccountsSelected = !slug || slug === "transactions";
  const selected =
    slug && !navId
      ? (accounts.find((account) => bankAccountMatchesSlug(account, slug)) ??
        null)
      : null;
  const showTransactions = allAccountsSelected || Boolean(selected);
  const selectionKey = allAccountsSelected
    ? "__all__"
    : (selected?.id ?? slug ?? null);
  const accountAvatarSrcById = useDesktopAvatarSrcMap("bank_account", accounts);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const refreshAccounts = useCallback(async () => {
    const body = await client.requestJson<{ bankAccounts: BankAccount[] }>(
      "/api/v1/bank-accounts",
    );
    setAccounts(body.bankAccounts);
    return body.bankAccounts;
  }, [client]);

  const refreshCategories = useCallback(async () => {
    const body = await client.requestJson<{ categories: FinancialCategory[] }>(
      "/api/v1/financial-categories",
    );
    setCategories(body.categories);
  }, [client]);

  const refreshGoals = useCallback(async () => {
    setGoalsLoading(true);
    try {
      const body = await client.requestJson<{ goals: FinancialGoal[] }>(
        "/api/v1/financial-goals",
      );
      setGoals(body.goals);
    } finally {
      setGoalsLoading(false);
    }
  }, [client]);

  const refreshRecurrings = useCallback(async () => {
    setRecurringsLoading(true);
    try {
      const body = await client.requestJson<{
        recurrings: FinancialRecurring[];
      }>("/api/v1/financial-recurrings");
      setRecurrings(body.recurrings);
    } finally {
      setRecurringsLoading(false);
    }
  }, [client]);

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

  const handleCashflowMonthChange = useCallback((month: string) => {
    setCashflowChartMonth(month);
  }, []);

  useEffect(() => {
    void refreshAccounts().catch(() => setAccounts([]));
    void refreshCategories().catch(() => setCategories([]));
    void refreshGoals().catch(() => setGoals([]));
    void refreshRecurrings().catch(() => setRecurrings([]));
  }, [refreshAccounts, refreshCategories, refreshGoals, refreshRecurrings, slug]);

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

  useEffect(() => {
    if (navId !== "cashflow") return;
    let cancelled = false;
    const year = Number(cashflowChartMonth.slice(0, 4));
    const monthIndex = Number(cashflowChartMonth.slice(5, 7)) - 1;
    const now = new Date();
    const asOfDate =
      now.getFullYear() === year && now.getMonth() === monthIndex
        ? now
        : new Date(year, monthIndex + 1, 0);
    const asOf = `${asOfDate.getFullYear()}-${String(asOfDate.getMonth() + 1).padStart(2, "0")}-${String(asOfDate.getDate()).padStart(2, "0")}`;
    setWorkspaceCashflowLoading(true);
    setWorkspaceCashflowError(null);
    void (async () => {
      try {
        const params = new URLSearchParams({
          year: String(year),
          asOf,
        });
        const body = await client.requestJson<WorkspaceCashflow>(
          `/api/v1/finance/cashflow?${params}`,
        );
        if (!cancelled) setWorkspaceCashflow(body);
      } catch (error) {
        if (!cancelled) {
          setWorkspaceCashflow(null);
          setWorkspaceCashflowError(
            error instanceof Error ? error.message : "Failed to load cash flow",
          );
        }
      } finally {
        if (!cancelled) setWorkspaceCashflowLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cashflowChartMonth, client, navId]);

  useEffect(() => {
    if (navId !== "invoices") return;
    let cancelled = false;
    setMoneybirdInvoicesLoading(true);
    setMoneybirdInvoicesError(null);
    void (async () => {
      try {
        const settings = await client.requestJson<MoneybirdSettings>(
          "/api/v1/settings/moneybird",
        );
        if (cancelled) return;
        setMoneybirdConnected(settings.connected);
        if (!settings.connected) {
          setMoneybirdInvoices([]);
          setMoneybirdInvoicesHasMore(false);
          setMoneybirdInvoicesTotalPages(1);
          return;
        }
        const listParams = new URLSearchParams({
          page: String(moneybirdInvoicesPage),
          perPage: "50",
          filter: buildMoneybirdInvoicesFilter(
            moneybirdInvoicesYear,
            moneybirdInvoiceStatusIds,
          ),
        });
        const listBody = await client.requestJson<{
          invoices: MoneybirdSalesInvoiceSummary[];
          hasMore?: boolean;
          totalPages?: number;
        }>(`/api/v1/finance/moneybird/invoices?${listParams}`);
        if (cancelled) return;
        setMoneybirdInvoices(listBody.invoices);
        setMoneybirdInvoicesHasMore(Boolean(listBody.hasMore));
        setMoneybirdInvoicesTotalPages(
          typeof listBody.totalPages === "number" && listBody.totalPages >= 1
            ? listBody.totalPages
            : Math.max(1, moneybirdInvoicesPage),
        );
      } catch (error) {
        if (cancelled) return;
        setMoneybirdInvoices([]);
        setMoneybirdInvoicesHasMore(false);
        setMoneybirdInvoicesTotalPages(1);
        setMoneybirdInvoicesError(
          error instanceof Error
            ? error.message
            : "Failed to load Moneybird invoices",
        );
      } finally {
        if (!cancelled) setMoneybirdInvoicesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    client,
    moneybirdInvoiceStatusIds,
    moneybirdInvoicesPage,
    moneybirdInvoicesYear,
    navId,
  ]);

  useEffect(() => {
    if (navId !== "invoices") {
      setSelectedMoneybirdInvoiceId(null);
      setMoneybirdInvoiceDetail(null);
      setMoneybirdInvoiceDetailError(null);
      setMoneybirdInvoiceDetailLoading(false);
    }
  }, [navId]);

  useEffect(() => {
    setSelectedMoneybirdInvoiceId(null);
  }, [moneybirdInvoicesPage, moneybirdInvoicesYear, moneybirdInvoiceStatusIds]);

  useEffect(() => {
    if (navId !== "invoices" || !selectedMoneybirdInvoiceId) {
      setMoneybirdInvoiceDetail(null);
      setMoneybirdInvoiceDetailError(null);
      setMoneybirdInvoiceDetailLoading(false);
      return;
    }
    let cancelled = false;
    setMoneybirdInvoiceDetailLoading(true);
    setMoneybirdInvoiceDetailError(null);
    void (async () => {
      try {
        const detail = await client.requestJson<MoneybirdSalesInvoiceDetail>(
          `/api/v1/finance/moneybird/invoices/${encodeURIComponent(selectedMoneybirdInvoiceId)}`,
        );
        if (cancelled) return;
        setMoneybirdInvoiceDetail(detail);
      } catch (error) {
        if (cancelled) return;
        setMoneybirdInvoiceDetail(null);
        setMoneybirdInvoiceDetailError(
          error instanceof Error
            ? error.message
            : "Failed to load invoice detail",
        );
      } finally {
        if (!cancelled) setMoneybirdInvoiceDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, navId, selectedMoneybirdInvoiceId]);

  useEffect(() => {
    if (navId !== "invoices") return;
    let cancelled = false;
    setMoneybirdRevenueLoading(true);
    void (async () => {
      try {
        const settings = await client.requestJson<MoneybirdSettings>(
          "/api/v1/settings/moneybird",
        );
        if (cancelled) return;
        setMoneybirdConnected(settings.connected);
        if (!settings.connected) {
          setMoneybirdRevenueYear(null);
          setMoneybirdRevenueMonths(null);
          return;
        }
        const year = moneybirdInvoicesYear;
        const [revenueBody, cashflowBody] = await Promise.all([
          client.requestJson<MoneybirdInvoiceRevenue>(
            `/api/v1/finance/moneybird/invoice-revenue?year=${year}`,
          ),
          client
            .requestJson<WorkspaceCashflow>(
              `/api/v1/finance/cashflow?year=${year}`,
            )
            .catch(() => null),
        ]);
        if (cancelled) return;
        setMoneybirdRevenueYear(revenueBody.year);
        setMoneybirdRevenueMonths(
          mergeInvoiceRevenueWithAccountExpenses(
            revenueBody.months,
            cashflowBody?.months,
          ),
        );
      } catch {
        if (cancelled) return;
        setMoneybirdRevenueYear(null);
        setMoneybirdRevenueMonths(null);
      } finally {
        if (!cancelled) setMoneybirdRevenueLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, moneybirdInvoicesYear, navId]);

  const loadMoneybirdInvoicesPage = useCallback(async () => {
    setMoneybirdInvoicesLoading(true);
    setMoneybirdInvoicesError(null);
    setMoneybirdRevenueLoading(true);
    try {
      const settings = await client.requestJson<MoneybirdSettings>(
        "/api/v1/settings/moneybird",
      );
      setMoneybirdConnected(settings.connected);
      if (!settings.connected) {
        setMoneybirdInvoices([]);
        setMoneybirdInvoicesHasMore(false);
        setMoneybirdInvoicesTotalPages(1);
        setMoneybirdRevenueYear(null);
        setMoneybirdRevenueMonths(null);
        return;
      }
      const year = moneybirdInvoicesYear;
      const listParams = new URLSearchParams({
        page: String(moneybirdInvoicesPage),
        perPage: "50",
        filter: buildMoneybirdInvoicesFilter(year, moneybirdInvoiceStatusIds),
      });
      const [listBody, revenueBody, cashflowBody] = await Promise.all([
        client.requestJson<{
          invoices: MoneybirdSalesInvoiceSummary[];
          hasMore?: boolean;
          totalPages?: number;
        }>(`/api/v1/finance/moneybird/invoices?${listParams}`),
        client.requestJson<MoneybirdInvoiceRevenue>(
          `/api/v1/finance/moneybird/invoice-revenue?year=${year}`,
        ),
        client
          .requestJson<WorkspaceCashflow>(
            `/api/v1/finance/cashflow?year=${year}`,
          )
          .catch(() => null),
      ]);
      setMoneybirdInvoices(listBody.invoices);
      setMoneybirdInvoicesHasMore(Boolean(listBody.hasMore));
      setMoneybirdInvoicesTotalPages(
        typeof listBody.totalPages === "number" && listBody.totalPages >= 1
          ? listBody.totalPages
          : Math.max(1, moneybirdInvoicesPage),
      );
      setMoneybirdRevenueYear(revenueBody.year);
      setMoneybirdRevenueMonths(
        mergeInvoiceRevenueWithAccountExpenses(
          revenueBody.months,
          cashflowBody?.months,
        ),
      );
    } catch (error) {
      setMoneybirdInvoices([]);
      setMoneybirdInvoicesHasMore(false);
      setMoneybirdInvoicesTotalPages(1);
      setMoneybirdRevenueYear(null);
      setMoneybirdRevenueMonths(null);
      setMoneybirdInvoicesError(
        error instanceof Error
          ? error.message
          : "Failed to load Moneybird invoices",
      );
    } finally {
      setMoneybirdInvoicesLoading(false);
      setMoneybirdRevenueLoading(false);
    }
  }, [
    client,
    moneybirdInvoiceStatusIds,
    moneybirdInvoicesPage,
    moneybirdInvoicesYear,
  ]);

  const fetchSpendPanel = useCallback(
    async (month: string) => {
      setSpendPanelLoading(true);
      try {
        const body = await client.requestJson<FinanceSpendPanel>(
          `/api/v1/finance/spend-panel?month=${encodeURIComponent(month)}`,
        );
        setSpendPanel(body);
        setSpendPanelMonth(body.month);
      } catch {
        setSpendPanel(null);
      } finally {
        setSpendPanelLoading(false);
      }
    },
    [client],
  );

  const handleOpenSpendPanel = useCallback(
    (month?: string) => {
      const next =
        month ??
        spendPanelMonth ??
        cashflowChartMonth ??
        workspaceCashflow?.asOf.slice(0, 7) ??
        `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
      setSpendPanelMonth(next);
      void fetchSpendPanel(next);
    },
    [
      cashflowChartMonth,
      fetchSpendPanel,
      spendPanelMonth,
      workspaceCashflow?.asOf,
    ],
  );

  const handleCloseSpendPanel = useCallback(() => {
    setSpendPanelMonth(null);
  }, []);

  const handleSpendPanelMonthChange = useCallback(
    (month: string) => {
      setSpendPanelMonth(month);
      void fetchSpendPanel(month);
    },
    [fetchSpendPanel],
  );

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
          balanceCents += tx.amountCents;
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
    if (slug) return;
    navigate(getFinanceDashboardHref(), { replace: true });
  }, [navigate, slug]);

  useEffect(() => {
    if (!slug || navId || accounts.length === 0) return;
    if (selected) return;
    // Unknown account slug → finance home.
    navigate(getFinanceDashboardHref(), { replace: true });
  }, [accounts.length, navId, navigate, selected, slug]);

  useEffect(() => {
    if (!selected || !sectionParam) return;
    // Legacy /finance/:slug/imports (and other section) URLs → account root.
    navigate(getFinanceHref(accountSlug(selected)), { replace: true });
  }, [navigate, sectionParam, selected]);

  const loadTransactions = useCallback(
    async (opts?: { cursor?: string | null; append?: boolean }) => {
      if (!showTransactions) {
        return {
          transactions: [] as FinancialTransaction[],
          nextCursor: null as string | null,
        };
      }
      // Scope: one bank account, or the workspace-wide "all accounts" list.
      const scopedAccountId = allAccountsSelected ? null : selected?.id ?? null;
      if (!allAccountsSelected && !scopedAccountId) {
        return {
          transactions: [] as FinancialTransaction[],
          nextCursor: null as string | null,
        };
      }
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
        if (filterCategoryIds.includes(DROPDOWN_NONE_VALUE)) {
          params.set("uncategorized", "true");
        }
        const selectedCategoryIds = filterCategoryIds.filter(
          (id) => id !== DROPDOWN_NONE_VALUE,
        );
        if (selectedCategoryIds.length > 0) {
          params.set("categoryIds", selectedCategoryIds.join(","));
        }
        if (filterOrganizationId === DROPDOWN_NONE_VALUE) {
          params.set("unassignedOrg", "true");
        } else if (filterOrganizationId) {
          params.set("organizationId", filterOrganizationId);
        }
        if (filterGoalId === DROPDOWN_NO_GOAL_VALUE) {
          params.set("unassignedGoal", "true");
        } else if (filterGoalId) {
          params.set("goalId", filterGoalId);
        }
        if (filterRecurringId === DROPDOWN_NO_RECURRING_VALUE) {
          params.set("unassignedRecurring", "true");
        } else if (filterRecurringId) {
          params.set("recurringId", filterRecurringId);
        }
        params.set("limit", "200");
        if (opts?.cursor) params.set("cursor", opts.cursor);
        const path = scopedAccountId
          ? `/api/v1/bank-accounts/${encodeURIComponent(scopedAccountId)}/transactions?${params}`
          : `/api/v1/transactions?${params}`;
        const body = await client.requestJson<{
          transactions: FinancialTransaction[];
          nextCursor: string | null;
        }>(path);
        setTransactions((prev) =>
          opts?.append ? [...prev, ...body.transactions] : body.transactions,
        );
        setNextCursor(body.nextCursor);
        return body;
      } finally {
        setLoading(false);
      }
    },
    [
      allAccountsSelected,
      client,
      debouncedSearch,
      filterCategoryIds,
      filterGoalId,
      filterOrganizationId,
      filterRecurringId,
      selected?.id,
      showTransactions,
    ],
  );

  const loadImportsForAccount = useCallback(
    async (accountId: string) => {
      const body = await client.requestJson<{ imports: FinancialImportBatch[] }>(
        `/api/v1/bank-accounts/${encodeURIComponent(accountId)}/imports`,
      );
      setImports(body.imports);
    },
    [client],
  );

  useEffect(() => {
    setSelectedIds(new Set());
    lastClickedIdRef.current = null;
    setFilterCategoryIds([]);
    setFilterOrganizationId(null);
    setFilterGoalId(null);
    setFilterRecurringId(null);
    setSearch("");
    setDebouncedSearch("");
    setAmountMinCents(null);
    setAmountMaxCents(null);
    // Drop previous scope immediately so Select all never inherits another
    // account / "all accounts" page of rows.
    setTransactions([]);
    setNextCursor(null);
  }, [selectionKey]);

  // Filters change the visible set — drop any selection from the prior query.
  useEffect(() => {
    setSelectedIds(new Set());
    lastClickedIdRef.current = null;
  }, [
    amountMinCents,
    amountMaxCents,
    debouncedSearch,
    filterCategoryIds,
    filterGoalId,
    filterOrganizationId,
    filterRecurringId,
  ]);

  useEffect(() => {
    if (!showTransactions) return;
    if (!allAccountsSelected && !selected) return;
    void loadTransactions();
  }, [loadTransactions, selectionKey, showTransactions]);

  useEffect(() => {
    if (!importOpen) return;
    const targetId = importAccountId ?? selected?.id ?? null;
    if (!targetId) {
      setImports([]);
      return;
    }
    void loadImportsForAccount(targetId).catch(() => setImports([]));
  }, [importAccountId, importOpen, loadImportsForAccount, selected?.id]);

  const chromeActions = useMemo(() => {
    if (navId === "invoices") {
      return (
        <div className="finance-chrome-actions">
          <button
            type="button"
            className="finance-chrome-actions__icon-button"
            aria-label="Refresh invoices"
            title="Refresh invoices"
            disabled={moneybirdInvoicesLoading}
            onClick={() => {
              void loadMoneybirdInvoicesPage();
            }}
          >
            <SyncStatusIdleIcon
              size={16}
              className={
                moneybirdInvoicesLoading
                  ? "finance-chrome-actions__sync-icon is-spinning"
                  : "finance-chrome-actions__sync-icon"
              }
            />
          </button>
        </div>
      );
    }
    if (!showTransactions) return null;
    return (
      <div className="finance-chrome-actions">
        <button
          type="button"
          className="finance-chrome-actions__button"
          onClick={() => {
            setImportError(null);
            setLastImportResult(null);
            setCsvFile(null);
            setImportAccountId(selected?.id ?? null);
            setImportOpen(true);
          }}
        >
          Import
        </button>
      </div>
    );
  }, [
    loadMoneybirdInvoicesPage,
    moneybirdInvoicesLoading,
    navId,
    selected?.id,
    showTransactions,
  ]);

  const breadcrumbLabel =
    selected?.name ??
    (navId === "transactions"
      ? "Transactions"
      : navId === "accounts"
        ? "Accounts"
        : navId === "categories"
          ? "Categories"
          : navId === "dashboard"
            ? "Dashboard"
            : navId === "goals"
              ? "Goals"
              : navId === "cashflow"
                ? "Cash Flow"
                : navId === "invoices"
                  ? "Invoices"
                : navId === "investments"
                  ? "Investments"
                  : navId === "recurrings"
                    ? "Recurrings"
                    : "Finance");

  const categoriesTrailingPanel = useMemo(() => {
    if (navId !== "categories" || !categoriesChrome?.hasSelection) return null;
    return (
      <div className="finance-categories-chrome-actions">
        <CategoryActionsMenu
          category={categoriesChrome.category}
          currentListing={categoriesChrome.currentListing}
          currentKind={categoriesChrome.currentKind}
          currentParentId={categoriesChrome.currentParentId}
          canChangeGroup={categoriesChrome.canChangeGroup}
          groupOptions={categoriesChrome.groupOptions}
          onSetListing={categoriesChrome.onSetListing}
          onSetKind={categoriesChrome.onSetKind}
          onSetGroup={categoriesChrome.onSetGroup}
          onDelete={categoriesChrome.onDelete}
        />
        <button
          type="button"
          className="finance-categories-chrome-toggle"
          title={
            categoriesChrome.detailCollapsed
              ? "Show category details"
              : "Hide category details"
          }
          aria-label={
            categoriesChrome.detailCollapsed
              ? "Show category details"
              : "Hide category details"
          }
          aria-pressed={categoriesChrome.detailCollapsed}
          onClick={categoriesChrome.onToggleDetail}
        >
          <ProjectsSidePanelIcon
            size={16}
            collapsed={categoriesChrome.detailCollapsed}
            rail="end"
          />
        </button>
      </div>
    );
  }, [categoriesChrome, navId]);

  const goalsTrailingPanel = useMemo(() => {
    if (navId !== "goals" || !goalsChrome?.hasSelection) return null;
    return (
      <div className="finance-categories-chrome-actions">
        <GoalActionsMenu
          currentListing={goalsChrome.currentListing}
          onSetListing={goalsChrome.onSetListing}
          onDelete={goalsChrome.onDelete}
        />
        <button
          type="button"
          className="finance-categories-chrome-toggle"
          title={
            goalsChrome.detailCollapsed
              ? "Show goal details"
              : "Hide goal details"
          }
          aria-label={
            goalsChrome.detailCollapsed
              ? "Show goal details"
              : "Hide goal details"
          }
          aria-pressed={goalsChrome.detailCollapsed}
          onClick={goalsChrome.onToggleDetail}
        >
          <ProjectsSidePanelIcon
            size={16}
            collapsed={goalsChrome.detailCollapsed}
            rail="end"
          />
        </button>
      </div>
    );
  }, [goalsChrome, navId]);

  const recurringsTrailingPanel = useMemo(() => {
    if (navId !== "recurrings" || !recurringsChrome?.hasSelection) return null;
    return (
      <div className="finance-categories-chrome-actions">
        <RecurringActionsMenu
          recurring={recurringsChrome.recurring}
          onArchive={recurringsChrome.onArchive}
          onDelete={recurringsChrome.onDelete}
        />
        <button
          type="button"
          className="finance-categories-chrome-toggle"
          title={
            recurringsChrome.detailCollapsed
              ? "Show recurring details"
              : "Hide recurring details"
          }
          aria-label={
            recurringsChrome.detailCollapsed
              ? "Show recurring details"
              : "Hide recurring details"
          }
          aria-pressed={recurringsChrome.detailCollapsed}
          onClick={recurringsChrome.onToggleDetail}
        >
          <ProjectsSidePanelIcon
            size={16}
            collapsed={recurringsChrome.detailCollapsed}
            rail="end"
          />
        </button>
      </div>
    );
  }, [navId, recurringsChrome]);

  const accountsTrailingPanel = useMemo(() => {
    if (navId !== "accounts" || !accountsChrome?.hasSelection) return null;
    return (
      <div className="finance-categories-chrome-actions">
        {accountsChrome.account ? (
          <AccountActionsMenu
            account={accountsChrome.account}
            onDelete={accountsChrome.onDelete}
          />
        ) : null}
        <button
          type="button"
          className="finance-categories-chrome-toggle"
          title={
            accountsChrome.detailCollapsed
              ? "Show account details"
              : "Hide account details"
          }
          aria-label={
            accountsChrome.detailCollapsed
              ? "Show account details"
              : "Hide account details"
          }
          aria-pressed={accountsChrome.detailCollapsed}
          onClick={accountsChrome.onToggleDetail}
        >
          <ProjectsSidePanelIcon
            size={16}
            collapsed={accountsChrome.detailCollapsed}
            rail="end"
          />
        </button>
      </div>
    );
  }, [accountsChrome, navId]);

  const transactionsTrailingPanel = useMemo(() => {
    if (!showTransactions || !transactionsChrome?.hasSelection) return null;
    return (
      <div className="finance-categories-chrome-actions">
        <TransactionActionsMenu
          transaction={transactionsChrome.transaction}
          onDelete={transactionsChrome.onDelete}
        />
        <button
          type="button"
          className="finance-categories-chrome-toggle"
          title={
            transactionsChrome.detailCollapsed
              ? "Show transaction details"
              : "Hide transaction details"
          }
          aria-label={
            transactionsChrome.detailCollapsed
              ? "Show transaction details"
              : "Hide transaction details"
          }
          aria-pressed={transactionsChrome.detailCollapsed}
          onClick={transactionsChrome.onToggleDetail}
        >
          <ProjectsSidePanelIcon
            size={16}
            collapsed={transactionsChrome.detailCollapsed}
            rail="end"
          />
        </button>
      </div>
    );
  }, [showTransactions, transactionsChrome]);

  const breadcrumbItems = useMemo(() => {
    const items: { label: string; href?: string }[] = [
      { label: "Finance", href: getFinanceDashboardHref() },
    ];
    if (navId === "categories" && categoriesChrome?.category) {
      items.push({
        label: "Categories",
        href: getFinanceNavHref("categories"),
      });
      items.push({ label: categoriesChrome.category.name });
    } else if (navId === "goals" && goalsChrome?.goal) {
      items.push({ label: "Goals", href: getFinanceNavHref("goals") });
      items.push({ label: goalsChrome.goal.name });
    } else if (navId === "recurrings" && recurringsChrome?.recurring) {
      items.push({
        label: "Recurrings",
        href: getFinanceNavHref("recurrings"),
      });
      items.push({ label: recurringsChrome.recurring.name });
    } else if (navId === "accounts" && accountsChrome?.account) {
      items.push({ label: "Accounts", href: getFinanceNavHref("accounts") });
      items.push({ label: accountsChrome.account.name });
    } else if (showTransactions && transactionsChrome?.transaction) {
      items.push({
        label: "Transactions",
        href: getFinanceTransactionsHref(),
      });
      const tx = transactionsChrome.transaction;
      const label =
        tx.displayName?.trim() ||
        tx.payee.trim() ||
        tx.memo?.trim() ||
        tx.counterparty?.trim() ||
        "Untitled transaction";
      items.push({
        label: label.length > 48 ? `${label.slice(0, 45)}…` : label,
      });
    } else {
      items.push({ label: breadcrumbLabel });
    }
    return items;
  }, [
    accountsChrome?.account,
    breadcrumbLabel,
    categoriesChrome?.category,
    goalsChrome?.goal,
    navId,
    recurringsChrome?.recurring,
    showTransactions,
    transactionsChrome?.transaction,
  ]);

  const detailCollapsedForChrome =
    navId === "categories"
      ? categoriesChrome?.detailCollapsed
      : navId === "goals"
        ? goalsChrome?.detailCollapsed
        : navId === "recurrings"
          ? recurringsChrome?.detailCollapsed
          : navId === "accounts"
            ? accountsChrome?.detailCollapsed
            : showTransactions
              ? transactionsChrome?.detailCollapsed
              : false;

  const detailResizedForChrome =
    navId === "categories"
      ? categoriesChrome?.detailResized
      : navId === "goals"
        ? goalsChrome?.detailResized
        : navId === "recurrings"
          ? recurringsChrome?.detailResized
          : navId === "accounts"
            ? accountsChrome?.detailResized
            : showTransactions
              ? transactionsChrome?.detailResized
              : false;

  const chromeClassName =
    [
      detailCollapsedForChrome ? "is-finance-detail-collapsed" : null,
      detailResizedForChrome && !detailCollapsedForChrome
        ? "is-detail-resized"
        : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  useDesktopSectionBreadcrumb(breadcrumbItems, {
    actions: chromeActions,
    trailingPanel:
      navId === "accounts"
        ? accountsTrailingPanel
        : navId === "categories"
          ? categoriesTrailingPanel
          : navId === "goals"
            ? goalsTrailingPanel
            : navId === "recurrings"
              ? recurringsTrailingPanel
              : showTransactions
                ? transactionsTrailingPanel
                : null,
    className: chromeClassName,
  });

  useEffect(() => {
    if (navId === "categories") return;
    setCategoriesChrome(null);
  }, [navId]);

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

  useEffect(() => {
    if (showTransactions) return;
    setTransactionsChrome(null);
  }, [showTransactions]);

  const handleImportCsv = useCallback(async () => {
    const accountId = importAccountId ?? selected?.id ?? null;
    if (!accountId || !csvFile) return;
    setCsvUploading(true);
    setCsvProgress(0);
    setImportError(null);
    try {
      const result = await client.uploadBankAccountCsv(
        accountId,
        csvFile,
        csvFile.name,
        {
          onProgress: (event) => setCsvProgress(event.ratio),
        },
      );
      setLastImportResult(result);
      setCsvFile(null);
      await loadImportsForAccount(accountId);
      if (allAccountsSelected || selected?.id === accountId) {
        await loadTransactions();
      } else {
        const target = accounts.find((entry) => entry.id === accountId);
        if (target) {
          navigate(getFinanceHref(accountSlug(target)));
        }
      }
    } catch (reason) {
      setImportError(
        reason instanceof Error ? reason.message : "Could not import CSV.",
      );
    } finally {
      setCsvUploading(false);
      setCsvProgress(null);
    }
  }, [
    accounts,
    allAccountsSelected,
    client,
    csvFile,
    importAccountId,
    loadImportsForAccount,
    loadTransactions,
    navigate,
    selected?.id,
  ]);

  const handleToggleSelected = useCallback(
    (id: string, shiftKey: boolean, orderedIds: readonly string[]) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (shiftKey && lastClickedIdRef.current) {
          const start = orderedIds.indexOf(lastClickedIdRef.current);
          const end = orderedIds.indexOf(id);
          if (start >= 0 && end >= 0) {
            const [from, to] = start < end ? [start, end] : [end, start];
            for (let i = from; i <= to; i++) next.add(orderedIds[i]!);
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      lastClickedIdRef.current = id;
    },
    [],
  );

  const handleSetGroupSelected = useCallback(
    (ids: string[], selected: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (selected) {
          for (const id of ids) next.add(id);
        } else {
          for (const id of ids) next.delete(id);
        }
        return next;
      });
      lastClickedIdRef.current = ids[ids.length - 1] ?? null;
    },
    [],
  );

  const handleSelectAllTransactions = useCallback(async () => {
    if (selectAllPending) return;
    const scopedAccountId = allAccountsSelected ? null : selected?.id ?? null;
    if (!allAccountsSelected && !scopedAccountId) return;
    setSelectAllPending(true);
    try {
      // Reload from page 1 with the current account + filters so we never keep
      // rows from a previous "all accounts" (or other) scope, then page through
      // the rest of that same filtered list.
      const first = await loadTransactions({ cursor: null, append: false });
      const ids = new Set<string>();
      const addScoped = (rows: FinancialTransaction[]) => {
        for (const tx of rows) {
          if (scopedAccountId && tx.bankAccountId !== scopedAccountId) continue;
          // Amount range is client-only — keep Select all aligned with the list.
          if (amountMinCents != null && tx.amountCents < amountMinCents) {
            continue;
          }
          if (amountMaxCents != null && tx.amountCents > amountMaxCents) {
            continue;
          }
          ids.add(tx.id);
        }
      };
      addScoped(first.transactions);
      let cursor = first.nextCursor;
      let pages = 0;
      while (cursor && pages < 100) {
        pages += 1;
        const page = await loadTransactions({ cursor, append: true });
        addScoped(page.transactions);
        cursor = page.nextCursor;
      }
      setSelectedIds(ids);
      lastClickedIdRef.current = [...ids].at(-1) ?? null;
    } finally {
      setSelectAllPending(false);
    }
  }, [
    allAccountsSelected,
    amountMaxCents,
    amountMinCents,
    loadTransactions,
    selectAllPending,
    selected?.id,
  ]);

  const applyLocalPatch = useCallback(
    (
      ids: string[],
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        projectId?: string | null;
        categoryId?: string | null;
        goalId?: string | null;
        recurringId?: string | null;
        displayName?: string | null;
        notes?: string | null;
      },
    ) => {
      const idSet = new Set(ids);
      setTransactions((rows) =>
        rows.flatMap((row) => {
          if (!idSet.has(row.id)) return [row];
          const next = {
            ...row,
            ...(patch.bankAccountId !== undefined
              ? { bankAccountId: patch.bankAccountId }
              : {}),
            ...(patch.organizationId !== undefined
              ? { organizationId: patch.organizationId }
              : {}),
            ...(patch.projectId !== undefined
              ? { projectId: patch.projectId }
              : {}),
            ...(patch.categoryId !== undefined
              ? { categoryId: patch.categoryId }
              : {}),
            ...(patch.goalId !== undefined ? { goalId: patch.goalId } : {}),
            ...(patch.recurringId !== undefined
              ? { recurringId: patch.recurringId }
              : {}),
            ...(patch.displayName !== undefined
              ? { displayName: patch.displayName }
              : {}),
            ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
          };
          // Leave the current account list when a row is moved elsewhere.
          if (
            selected &&
            patch.bankAccountId != null &&
            patch.bankAccountId !== selected.id
          ) {
            return [];
          }
          return [next];
        }),
      );
    },
    [selected],
  );

  const postTransactionBatch = useCallback(
    async (
      ids: string[],
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        projectId?: string | null;
        categoryId?: string | null;
        goalId?: string | null;
        recurringId?: string | null;
        displayName?: string | null;
        notes?: string | null;
      },
    ) => {
      // API zod: ids.max(500) — same chunking as bulk delete.
      for (let offset = 0; offset < ids.length; offset += 500) {
        const chunk = ids.slice(offset, offset + 500);
        await client.requestJson("/api/v1/transactions/batch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids: chunk, patch }),
        });
      }
    },
    [client],
  );

  const handlePatchTransaction = useCallback(
    async (
      id: string,
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        projectId?: string | null;
        categoryId?: string | null;
        goalId?: string | null;
        recurringId?: string | null;
        displayName?: string | null;
        notes?: string | null;
      },
    ) => {
      applyLocalPatch([id], patch);
      await client.requestJson(`/api/v1/transactions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
    },
    [applyLocalPatch, client],
  );

  const handleDashboardTransactionPatch = useCallback(
    (
      id: string,
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        projectId?: string | null;
        categoryId?: string | null;
        goalId?: string | null;
        displayName?: string | null;
        notes?: string | null;
      },
    ) => {
      const current = reviewTransactions.find((row) => row.id === id);
      const next = current ? { ...current, ...patch } : null;
      const categoryChanged =
        Boolean(current) &&
        patch.categoryId !== undefined &&
        patch.categoryId !== current!.categoryId;
      const filed = Boolean(
        next && next.categoryId != null && next.organizationId != null,
      );

      setReviewTransactions((rows) =>
        rows.flatMap((row) => {
          if (row.id !== id) return [row];
          const updated = { ...row, ...patch };
          if (updated.categoryId != null && updated.organizationId != null) {
            return [];
          }
          return [updated];
        }),
      );
      // Review inbox is uncategorized — filing a category drops it from the total.
      if (
        patch.categoryId !== undefined &&
        patch.categoryId != null &&
        current?.categoryId == null
      ) {
        setReviewTotalCount((count) => Math.max(0, count - 1));
      }
      void (async () => {
        await handlePatchTransaction(id, patch);
        // Top categories follow the dashboard month picker — never the local
        // calendar month alone, or a different month's empty spend can wipe the widget.
        if (categoryChanged || filed) {
          void refreshCategorySpend(dashboardChartMonth).catch(() => {});
        }
      })();
    },
    [
      dashboardChartMonth,
      handlePatchTransaction,
      refreshCategorySpend,
      reviewTransactions,
    ],
  );

  const handleDashboardBulkPatch = useCallback(
    (
      ids: string[],
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        categoryId?: string | null;
        goalId?: string | null;
        recurringId?: string | null;
      },
    ) => {
      if (!ids.length) return;
      const idSet = new Set(ids);
      const shouldRefreshSpend = reviewTransactions.some((row) => {
        if (!idSet.has(row.id)) return false;
        const next = { ...row, ...patch };
        const categoryChanged =
          patch.categoryId !== undefined &&
          patch.categoryId !== row.categoryId;
        const filed =
          next.categoryId != null && next.organizationId != null;
        return categoryChanged || filed;
      });

      setReviewTransactions((rows) =>
        rows.flatMap((row) => {
          if (!idSet.has(row.id)) return [row];
          const next = { ...row, ...patch };
          if (next.categoryId != null && next.organizationId != null) {
            return [];
          }
          return [next];
        }),
      );
      if (patch.categoryId !== undefined && patch.categoryId != null) {
        const removed = reviewTransactions.filter(
          (row) => idSet.has(row.id) && row.categoryId == null,
        ).length;
        if (removed > 0) {
          setReviewTotalCount((count) => Math.max(0, count - removed));
        }
      }
      void (async () => {
        applyLocalPatch(ids, patch);
        await postTransactionBatch(ids, patch);
        if (shouldRefreshSpend) {
          void refreshCategorySpend(dashboardChartMonth).catch(() => {});
        }
      })();
    },
    [
      applyLocalPatch,
      dashboardChartMonth,
      postTransactionBatch,
      refreshCategorySpend,
      reviewTransactions,
    ],
  );

  const handleCategoryTransactionPatch = useCallback(
    (
      id: string,
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        categoryId?: string | null;
      },
    ) => {
      // Optimistically reflect the change in the detail-panel list.
      setCategoryMetrics((current) =>
        current
          ? {
              ...current,
              transactions: current.transactions.map((tx) =>
                tx.id === id ? { ...tx, ...patch } : tx,
              ),
            }
          : current,
      );
      void (async () => {
        await handlePatchTransaction(id, patch);
        if (selectedCategoryId) {
          try {
            setCategoryMetrics(await fetchCategoryMetrics(selectedCategoryId));
          } catch {
            /* keep optimistic state on refresh failure */
          }
        }
        void refreshCategorySpend(categorySpendMonth ?? undefined).catch(
          () => {},
        );
      })();
    },
    [
      categorySpendMonth,
      fetchCategoryMetrics,
      handlePatchTransaction,
      refreshCategorySpend,
      selectedCategoryId,
    ],
  );

  const handleCategoryBulkPatch = useCallback(
    (
      ids: string[],
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        categoryId?: string | null;
        goalId?: string | null;
        recurringId?: string | null;
      },
    ) => {
      if (!ids.length) return;
      const idSet = new Set(ids);
      // Optimistically reflect the change in the detail-panel list.
      setCategoryMetrics((current) =>
        current
          ? {
              ...current,
              transactions: current.transactions.map((tx) =>
                idSet.has(tx.id) ? { ...tx, ...patch } : tx,
              ),
            }
          : current,
      );
      void (async () => {
        applyLocalPatch(ids, patch);
        await postTransactionBatch(ids, patch);
        if (selectedCategoryId) {
          try {
            setCategoryMetrics(await fetchCategoryMetrics(selectedCategoryId));
          } catch {
            /* keep optimistic state on refresh failure */
          }
        }
        void refreshCategorySpend(categorySpendMonth ?? undefined).catch(
          () => {},
        );
      })();
    },
    [
      applyLocalPatch,
      categorySpendMonth,
      fetchCategoryMetrics,
      postTransactionBatch,
      refreshCategorySpend,
      selectedCategoryId,
    ],
  );

  const handleAccountTransactionPatch = useCallback(
    (
      id: string,
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        categoryId?: string | null;
      },
    ) => {
      // Optimistically reflect the change; drop the row if it moved accounts.
      setAccountMetrics((current) => {
        if (!current) return current;
        if (patch.bankAccountId && patch.bankAccountId !== current.accountId) {
          const moved = current.transactions.find((tx) => tx.id === id);
          return {
            ...current,
            balanceCents: current.balanceCents - (moved?.amountCents ?? 0),
            transactions: current.transactions.filter((tx) => tx.id !== id),
          };
        }
        return {
          ...current,
          transactions: current.transactions.map((tx) =>
            tx.id === id ? { ...tx, ...patch } : tx,
          ),
        };
      });
      void (async () => {
        await handlePatchTransaction(id, patch);
        if (selectedAccountId) {
          try {
            setAccountMetrics(await fetchAccountMetrics(selectedAccountId));
          } catch {
            /* keep optimistic state on refresh failure */
          }
        }
      })();
    },
    [fetchAccountMetrics, handlePatchTransaction, selectedAccountId],
  );

  const handleAccountBulkPatch = useCallback(
    (
      ids: string[],
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        categoryId?: string | null;
        goalId?: string | null;
        recurringId?: string | null;
      },
    ) => {
      if (!ids.length) return;
      const idSet = new Set(ids);
      setAccountMetrics((current) => {
        if (!current) return current;
        if (patch.bankAccountId && patch.bankAccountId !== current.accountId) {
          const removed = current.transactions.filter((tx) => idSet.has(tx.id));
          const removedCents = removed.reduce(
            (sum, tx) => sum + tx.amountCents,
            0,
          );
          return {
            ...current,
            balanceCents: current.balanceCents - removedCents,
            transactions: current.transactions.filter(
              (tx) => !idSet.has(tx.id),
            ),
          };
        }
        return {
          ...current,
          transactions: current.transactions.map((tx) =>
            idSet.has(tx.id) ? { ...tx, ...patch } : tx,
          ),
        };
      });
      void (async () => {
        applyLocalPatch(ids, patch);
        await postTransactionBatch(ids, patch);
        if (selectedAccountId) {
          try {
            setAccountMetrics(await fetchAccountMetrics(selectedAccountId));
          } catch {
            /* keep optimistic state on refresh failure */
          }
        }
      })();
    },
    [applyLocalPatch, fetchAccountMetrics, postTransactionBatch, selectedAccountId],
  );

  const handleGoalTransactionPatch = useCallback(
    (
      id: string,
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        categoryId?: string | null;
        recurringId?: string | null;
      },
    ) => {
      setGoalTransactions((rows) =>
        rows.map((tx) => (tx.id === id ? { ...tx, ...patch } : tx)),
      );
      void handlePatchTransaction(id, patch);
    },
    [handlePatchTransaction],
  );

  const handleGoalBulkPatch = useCallback(
    (
      ids: string[],
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        categoryId?: string | null;
        goalId?: string | null;
        recurringId?: string | null;
      },
    ) => {
      if (!ids.length) return;
      const idSet = new Set(ids);
      setGoalTransactions((rows) =>
        rows.map((tx) => (idSet.has(tx.id) ? { ...tx, ...patch } : tx)),
      );
      applyLocalPatch(ids, patch);
      void postTransactionBatch(ids, patch);
    },
    [applyLocalPatch, postTransactionBatch],
  );

  const handleRecurringTransactionPatch = useCallback(
    (
      id: string,
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        categoryId?: string | null;
      },
    ) => {
      setRecurringMetrics((current) =>
        current
          ? {
              ...current,
              transactions: current.transactions.map((tx) =>
                tx.id === id ? { ...tx, ...patch } : tx,
              ),
            }
          : current,
      );
      void handlePatchTransaction(id, patch);
    },
    [handlePatchTransaction],
  );

  const handleRecurringBulkPatch = useCallback(
    (
      ids: string[],
      patch: {
        bankAccountId?: string;
        organizationId?: string | null;
        categoryId?: string | null;
        goalId?: string | null;
        recurringId?: string | null;
      },
    ) => {
      if (!ids.length) return;
      const idSet = new Set(ids);
      setRecurringMetrics((current) =>
        current
          ? {
              ...current,
              transactions: current.transactions.map((tx) =>
                idSet.has(tx.id) ? { ...tx, ...patch } : tx,
              ),
            }
          : current,
      );
      applyLocalPatch(ids, patch);
      void postTransactionBatch(ids, patch);
    },
    [applyLocalPatch, postTransactionBatch],
  );

  const handleBulkPatch = useCallback(
    async (patch: {
      bankAccountId?: string;
      organizationId?: string | null;
      projectId?: string | null;
      categoryId?: string | null;
      goalId?: string | null;
      recurringId?: string | null;
    }) => {
      const ids = [...selectedIds];
      if (!ids.length) return;
      applyLocalPatch(ids, patch);
      // API caps batch ids at 500 (same as batch-delete).
      await postTransactionBatch(ids, patch);
      // Keep selection so another property can be set without re-selecting.
    },
    [applyLocalPatch, postTransactionBatch, selectedIds],
  );

  const deleteTransactionsByIds = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      const idSet = new Set(ids);
      // Chunk to the API max of 500 ids per request.
      for (let offset = 0; offset < ids.length; offset += 500) {
        const chunk = ids.slice(offset, offset + 500);
        await client.requestJson("/api/v1/transactions/batch-delete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids: chunk }),
        });
      }
      setTransactions((rows) => rows.filter((row) => !idSet.has(row.id)));
      setReviewTransactions((rows) =>
        rows.filter((row) => !idSet.has(row.id)),
      );
      setGoalTransactions((rows) => rows.filter((row) => !idSet.has(row.id)));
      setCategoryMetrics((current) =>
        current
          ? {
              ...current,
              transactions: current.transactions.filter(
                (tx) => !idSet.has(tx.id),
              ),
            }
          : current,
      );
      setAccountMetrics((current) => {
        if (!current) return current;
        const removed = current.transactions.filter((tx) => idSet.has(tx.id));
        const removedCents = removed.reduce(
          (sum, tx) => sum + tx.amountCents,
          0,
        );
        return {
          ...current,
          balanceCents: current.balanceCents - removedCents,
          transactions: current.transactions.filter((tx) => !idSet.has(tx.id)),
        };
      });
      setRecurringMetrics((current) =>
        current
          ? {
              ...current,
              transactions: current.transactions.filter(
                (tx) => !idSet.has(tx.id),
              ),
            }
          : current,
      );
    },
    [client],
  );

  const handleBulkDelete = useCallback(async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    await deleteTransactionsByIds(ids);
    setSelectedIds(new Set());
    lastClickedIdRef.current = null;
  }, [deleteTransactionsByIds, selectedIds]);

  const handleDeleteTransaction = useCallback(
    async (id: string) => {
      await deleteTransactionsByIds([id]);
      setSelectedIds((current) => {
        if (!current.has(id)) return current;
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      if (lastClickedIdRef.current === id) {
        lastClickedIdRef.current = null;
      }
    },
    [deleteTransactionsByIds],
  );

  const handleCreateAccount = useCallback(
    async (input: {
      name: string;
      ibanOrMask: string | null;
      type: BankAccount["type"];
      avatarFile?: File | null;
    }) => {
      const baseKey = input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
        .slice(0, 24);
      const key = `${baseKey || "bank"}${Math.floor(Math.random() * 90 + 10)}`;
      const created = await client.requestJson<BankAccount>(
        "/api/v1/bank-accounts",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            key,
            name: input.name,
            ibanOrMask: input.ibanOrMask,
            type: input.type,
            currency: "EUR",
            sortOrder: Date.now(),
          }),
        },
      );
      let nextAccount = created;
      if (input.avatarFile) {
        const avatarResult = await uploadDesktopAvatar(
          client,
          "bank_account",
          created.id,
          input.avatarFile,
        );
        if (avatarResult.ok) {
          const refreshed = await client.requestJson<BankAccount>(
            `/api/v1/bank-accounts/${encodeURIComponent(created.id)}`,
          );
          nextAccount = refreshed;
        }
      }
      setAccounts((rows) =>
        rows.some((row) => row.id === nextAccount.id)
          ? rows.map((row) => (row.id === nextAccount.id ? nextAccount : row))
          : [...rows, nextAccount],
      );
      notifyBankAccountsChanged();
      navigate(getFinanceHref(accountSlug(nextAccount)));
    },
    [client, navigate],
  );

  const handleSelectAccount = useCallback(
    (accountId: string) => {
      const next = accounts.find((entry) => entry.id === accountId);
      if (!next) return;
      navigate(getFinanceHref(accountSlug(next)));
    },
    [accounts, navigate],
  );

  const handleSelectAllAccounts = useCallback(() => {
    navigate(getFinanceTransactionsHref());
  }, [navigate]);

  const handleDeleteAccount = useCallback(
    async (accountId: string) => {
      await client.requestJson(
        `/api/v1/bank-accounts/${encodeURIComponent(accountId)}`,
        { method: "DELETE" },
      );
      const remaining = accounts.filter((entry) => entry.id !== accountId);
      setAccounts(remaining);
      notifyBankAccountsChanged();
      if (selected?.id === accountId) {
        navigate(getFinanceHref(), { replace: true });
      }
    },
    [accounts, client, navigate, selected?.id],
  );

  const handleUpdateAccount = useCallback(
    async (
      accountId: string,
      patch: {
        name?: string;
        ibanOrMask?: string | null;
        type?: BankAccount["type"];
        color?: string | null;
        sortOrder?: number;
      },
    ) => {
      const updated = await client.requestJson<BankAccount>(
        `/api/v1/bank-accounts/${encodeURIComponent(accountId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      setAccounts((rows) =>
        rows.map((row) => (row.id === updated.id ? updated : row)),
      );
      notifyBankAccountsChanged();
      return updated;
    },
    [client],
  );

  const handleReorderAccounts = useCallback(
    (request: FinanceListReorderRequest) => {
      const patches = accountReorderPatches(accounts, request);
      setAccounts((rows) => applyOptimisticAccountReorder(rows, request));
      for (const patch of patches) {
        void client
          .requestJson<BankAccount>(
            `/api/v1/bank-accounts/${encodeURIComponent(patch.id)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                type: patch.type,
                sortOrder: patch.sortOrder,
              }),
            },
          )
          .then((updated) => {
            setAccounts((rows) =>
              rows.map((row) => (row.id === updated.id ? updated : row)),
            );
            notifyBankAccountsChanged();
          })
          .catch(() => {
            /* keep optimistic order; next refresh reconciles */
          });
      }
    },
    [accounts, client],
  );

  const createCategory = useCallback(
    async (input: {
      name: string;
      kind: FinancialCategory["kind"];
      listing: FinancialCategory["listing"];
      parentId?: string | null;
    }) => {
      setCategoriesPending(true);
      setCategoriesError(null);
      try {
        await client.requestJson<FinancialCategory>(
          "/api/v1/financial-categories",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: input.name,
              kind: input.kind,
              listing: input.listing,
              parentId: input.parentId ?? null,
              sortOrder: Date.now(),
            }),
          },
        );
        await refreshCategories();
      } finally {
        setCategoriesPending(false);
      }
    },
    [client, refreshCategories],
  );

  const updateCategory = useCallback(
    async (
      id: string,
      patch: {
        name?: string;
        kind?: FinancialCategory["kind"];
        listing?: FinancialCategory["listing"];
        icon?: string | null;
        budgetCents?: number | null;
        parentId?: string | null;
        sortOrder?: number;
      },
    ) => {
      setCategoriesPending(true);
      setCategoriesError(null);
      try {
        const updated = await client.requestJson<FinancialCategory>(
          `/api/v1/financial-categories/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(patch),
          },
        );
        setCategories((rows) =>
          rows.map((row) => (row.id === updated.id ? updated : row)),
        );
      } finally {
        setCategoriesPending(false);
      }
    },
    [client],
  );

  const handleReorderCategories = useCallback(
    (request: FinanceListReorderRequest) => {
      const patches = categoryReorderPatches(categories, request);
      if (patches.length === 0) return;
      setCategories((rows) => applyOptimisticCategoryReorder(rows, request));
      for (const patch of patches) {
        const { id, ...body } = patch;
        void client
          .requestJson<FinancialCategory>(
            `/api/v1/financial-categories/${encodeURIComponent(id)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            },
          )
          .then((updated) => {
            setCategories((rows) =>
              rows.map((row) => (row.id === updated.id ? updated : row)),
            );
          })
          .catch(() => {
            /* keep optimistic order */
          });
      }
    },
    [categories, client],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      setCategoriesPending(true);
      setCategoriesError(null);
      try {
        await client.requestJson(
          `/api/v1/financial-categories/${encodeURIComponent(id)}`,
          { method: "DELETE" },
        );
        setCategories((rows) =>
          rows.filter((row) => row.id !== id && row.parentId !== id),
        );
      } finally {
        setCategoriesPending(false);
      }
    },
    [client],
  );

  const createGoal = useCallback(
    async (input: FinanceGoalCreateInput) => {
      setGoalsPending(true);
      setGoalsError(null);
      try {
        await client.requestJson<FinancialGoal>("/api/v1/financial-goals", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: input.name,
            listing: input.listing,
            sortOrder: Date.now(),
          }),
        });
        await refreshGoals();
      } finally {
        setGoalsPending(false);
      }
    },
    [client, refreshGoals],
  );

  const updateGoal = useCallback(
    async (id: string, patch: FinanceGoalUpdateInput) => {
      setGoalsPending(true);
      setGoalsError(null);
      try {
        const updated = await client.requestJson<FinancialGoal>(
          `/api/v1/financial-goals/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(patch),
          },
        );
        setGoals((rows) =>
          rows.map((row) => (row.id === updated.id ? updated : row)),
        );
      } finally {
        setGoalsPending(false);
      }
    },
    [client],
  );

  const handleReorderGoals = useCallback(
    (request: FinanceListReorderRequest) => {
      const patches = goalReorderPatches(goals, request);
      setGoals((rows) => applyOptimisticGoalReorder(rows, request));
      for (const patch of patches) {
        void client
          .requestJson<FinancialGoal>(
            `/api/v1/financial-goals/${encodeURIComponent(patch.id)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                listing: patch.listing,
                sortOrder: patch.sortOrder,
              }),
            },
          )
          .then((updated) => {
            setGoals((rows) =>
              rows.map((row) => (row.id === updated.id ? updated : row)),
            );
          })
          .catch(() => {
            /* keep optimistic order */
          });
      }
    },
    [client, goals],
  );

  const deleteGoal = useCallback(
    async (id: string) => {
      setGoalsPending(true);
      setGoalsError(null);
      try {
        await client.requestJson(
          `/api/v1/financial-goals/${encodeURIComponent(id)}`,
          { method: "DELETE" },
        );
        setGoals((rows) => rows.filter((row) => row.id !== id));
      } finally {
        setGoalsPending(false);
      }
    },
    [client],
  );

  const createRecurring = useCallback(
    async (input: FinanceRecurringCreateInput) => {
      setRecurringsPending(true);
      setRecurringsError(null);
      try {
        const created = await client.requestJson<FinancialRecurring>(
          "/api/v1/financial-recurrings",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: input.name,
              nextDate: input.nextDate,
              categoryId: input.categoryId ?? null,
              amountCents: input.amountCents ?? null,
              archived: input.archived ?? false,
              sortOrder: Date.now(),
            }),
          },
        );
        await refreshRecurrings();
        return { id: created.id };
      } finally {
        setRecurringsPending(false);
      }
    },
    [client, refreshRecurrings],
  );

  const updateRecurring = useCallback(
    async (id: string, patch: FinanceRecurringUpdateInput) => {
      setRecurringsPending(true);
      setRecurringsError(null);
      try {
        const updated = await client.requestJson<FinancialRecurring>(
          `/api/v1/financial-recurrings/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(patch),
          },
        );
        setRecurrings((rows) =>
          rows.map((row) => (row.id === updated.id ? updated : row)),
        );
      } finally {
        setRecurringsPending(false);
      }
    },
    [client],
  );

  const handleReorderRecurrings = useCallback(
    (request: FinanceListReorderRequest) => {
      const patches = recurringReorderPatches(
        recurrings,
        request,
        resolveRecurringReorderGroup,
        applyRecurringReorderGroup,
      );
      setRecurrings((rows) =>
        applyOptimisticRecurringReorder(
          rows,
          request,
          resolveRecurringReorderGroup,
          applyRecurringReorderGroup,
        ),
      );
      for (const patch of patches) {
        const { id, ...body } = patch;
        void client
          .requestJson<FinancialRecurring>(
            `/api/v1/financial-recurrings/${encodeURIComponent(id)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            },
          )
          .then((updated) => {
            setRecurrings((rows) =>
              rows.map((row) => (row.id === updated.id ? updated : row)),
            );
          })
          .catch(() => {
            /* keep optimistic order */
          });
      }
    },
    [client, recurrings],
  );

  const deleteRecurring = useCallback(
    async (id: string) => {
      setRecurringsPending(true);
      setRecurringsError(null);
      try {
        await client.requestJson(
          `/api/v1/financial-recurrings/${encodeURIComponent(id)}`,
          { method: "DELETE" },
        );
        setRecurrings((rows) => rows.filter((row) => row.id !== id));
      } finally {
        setRecurringsPending(false);
      }
    },
    [client],
  );

  let main: ReactNode = null;
  if (navId === "dashboard") {
    main = (
      <FinanceDashboardView
        reviewTransactions={reviewTransactions}
        reviewTotalCount={reviewTotalCount}
        reviewLoading={reviewLoading}
        categories={categories}
        spentCentsByCategoryId={categorySpendById}
        categorySpendLoading={dashboardSpendLoading}
        monthTransactions={dashboardMonthTransactions}
        priorMonthTransactions={dashboardPriorMonthTransactions}
        monthChartLoading={dashboardMonthChartLoading}
        chartMonth={dashboardChartMonth}
        onChartMonthChange={handleDashboardMonthChange}
        goals={goals}
        goalsLoading={goalsLoading}
        recurrings={recurrings}
        accounts={accounts}
        accountAvatarSrcById={accountAvatarSrcById}
        organizations={organizations}
        projects={projects}
        assetsDebt={assetsDebt}
        assetsDebtLoading={assetsDebtLoading}
        assetsDebtRange={assetsDebtRange}
        onAssetsDebtRangeChange={setAssetsDebtRange}
        onOpenReview={() => {
          setFilterCategoryIds([DROPDOWN_NONE_VALUE]);
          navigate(getFinanceTransactionsHref());
        }}
        onOpenCategories={() => navigate(getFinanceNavHref("categories"))}
        onOpenGoals={() => navigate(getFinanceNavHref("goals"))}
        onOpenRecurrings={() => navigate(getFinanceNavHref("recurrings"))}
        onOpenAccounts={() => navigate(getFinanceNavHref("accounts"))}
        onOpenCashflow={() => navigate(getFinanceNavHref("cashflow"))}
        onPatchTransaction={(id, patch) => {
          void handleDashboardTransactionPatch(id, patch);
        }}
        onBulkPatchTransactions={(ids, patch) => {
          void handleDashboardBulkPatch(ids, patch);
        }}
        onBulkDeleteTransactions={deleteTransactionsByIds}
        onCreateOrganizationFromQuery={(query) =>
          workspace.createOrganization({ name: query })
        }
      />
    );
  } else if (navId === "goals") {
    main = (
      <FinanceGoalsView
        goals={goals}
        pending={goalsPending || goalsLoading}
        error={goalsError}
        selectedGoalTransactions={goalTransactions}
        selectedGoalTransactionsLoading={goalTransactionsLoading}
        monthIncomeCents={monthIncomeCents}
        categories={categories}
        accounts={accounts}
        accountAvatarSrcById={accountAvatarSrcById}
        organizations={organizations}
        recurrings={recurrings}
        onChromeStateChange={setGoalsChrome}
        onSelectedGoalChange={setSelectedGoalId}
        onPatchTransaction={handleGoalTransactionPatch}
        onBulkPatchTransactions={handleGoalBulkPatch}
        onBulkDeleteTransactions={deleteTransactionsByIds}
        onCreateOrganizationFromQuery={(query) =>
          workspace.createOrganization({ name: query })
        }
        onCreate={createGoal}
        onUpdate={updateGoal}
        onDelete={deleteGoal}
        onReorder={handleReorderGoals}
      />
    );
  } else if (navId === "cashflow") {
    main = (
      <FinanceCashflowView
        cashflow={workspaceCashflow}
        categories={categories}
        loading={workspaceCashflowLoading}
        error={workspaceCashflowError}
        chartMonth={cashflowChartMonth}
        onChartMonthChange={handleCashflowMonthChange}
        spendPanel={spendPanel}
        spendPanelLoading={spendPanelLoading}
        onOpenSpendPanel={handleOpenSpendPanel}
        onCloseSpendPanel={handleCloseSpendPanel}
        onSpendPanelMonthChange={handleSpendPanelMonthChange}
      />
    );
  } else if (navId === "invoices") {
    main = (
      <FinanceInvoicesView
        invoices={moneybirdInvoices}
        loading={moneybirdInvoicesLoading}
        error={moneybirdInvoicesError}
        connected={moneybirdConnected}
        page={moneybirdInvoicesPage}
        totalPages={moneybirdInvoicesTotalPages}
        hasMore={moneybirdInvoicesHasMore}
        onPageChange={setMoneybirdInvoicesPage}
        year={moneybirdInvoicesYear}
        latestYear={new Date().getFullYear()}
        onYearChange={(nextYear) => {
          setMoneybirdInvoicesYear(nextYear);
          setMoneybirdInvoicesPage(1);
        }}
        filterStatusIds={moneybirdInvoiceStatusIds}
        onFilterStatusIdsChange={(values) => {
          setMoneybirdInvoiceStatusIds(values);
          setMoneybirdInvoicesPage(1);
        }}
        revenueYear={moneybirdRevenueYear}
        revenueMonths={moneybirdRevenueMonths}
        revenueLoading={moneybirdRevenueLoading}
        organizations={organizations}
        selectedInvoiceId={selectedMoneybirdInvoiceId}
        onSelectedInvoiceChange={setSelectedMoneybirdInvoiceId}
        invoiceDetail={moneybirdInvoiceDetail}
        invoiceDetailLoading={moneybirdInvoiceDetailLoading}
        invoiceDetailError={moneybirdInvoiceDetailError}
        onLinkMoneybirdContact={async (moneybirdContactId, organizationId) => {
          const linked = organizations.filter(
            (org) => org.moneybirdContactId === moneybirdContactId,
          );
          for (const org of linked) {
            if (org.id === organizationId) continue;
            await workspace.patchOrganization(org.id, {
              moneybirdContactId: null,
            });
          }
          if (organizationId) {
            await workspace.patchOrganization(organizationId, {
              moneybirdContactId,
            });
          }
        }}
        onCreateOrganizationFromQuery={(query) =>
          workspace.createOrganization({ name: query })
        }
        onOpenSettings={() => navigate("/settings/moneybird")}
      />
    );
  } else if (navId === "investments") {
    main = (
      <FinanceSectionPlaceholder
        title="Investments"
        description="Investments are coming soon."
      />
    );
  } else if (navId === "recurrings") {
    main = (
      <FinanceRecurringsView
        recurrings={recurrings}
        pending={recurringsPending || recurringsLoading}
        error={recurringsError}
        categories={categories}
        metrics={recurringMetrics}
        metricsLoading={recurringMetricsLoading}
        accounts={accounts}
        accountAvatarSrcById={accountAvatarSrcById}
        organizations={organizations}
        goals={goals}
        onChromeStateChange={setRecurringsChrome}
        onSelectedRecurringChange={setSelectedRecurringId}
        onPatchTransaction={handleRecurringTransactionPatch}
        onBulkPatchTransactions={handleRecurringBulkPatch}
        onBulkDeleteTransactions={deleteTransactionsByIds}
        onCreateOrganizationFromQuery={(query) =>
          workspace.createOrganization({ name: query })
        }
        onCreate={createRecurring}
        onUpdate={updateRecurring}
        onDelete={deleteRecurring}
        onReorder={handleReorderRecurrings}
      />
    );
  } else if (navId === "accounts") {
    main = (
      <FinanceAccountsView
        accounts={accounts}
        accountAvatarSrcById={accountAvatarSrcById}
        balanceCentsByAccountId={accountBalanceById}
        categories={categories}
        organizations={organizations}
        goals={goals}
        recurrings={recurrings}
        accountMetrics={accountMetrics}
        accountMetricsLoading={accountMetricsLoading}
        cashflowYear={accountCashflowYear}
        latestCashflowYear={new Date().getFullYear()}
        onCashflowYearChange={setAccountCashflowYear}
        onSelectedAccountChange={setSelectedAccountId}
        onChromeStateChange={setAccountsChrome}
        onPatchTransaction={handleAccountTransactionPatch}
        onBulkPatchTransactions={handleAccountBulkPatch}
        onBulkDeleteTransactions={deleteTransactionsByIds}
        onCreateOrganizationFromQuery={(query) =>
          workspace.createOrganization({ name: query })
        }
        onCreateAccount={(type) => {
          setPageAccountModalError(null);
          setPageAccountModal({ mode: "create", type });
        }}
        onDeleteAccount={handleDeleteAccount}
        onUpdateAccount={async (accountId, patch) => {
          await handleUpdateAccount(accountId, patch);
        }}
        onUploadAvatar={async (accountId, file) => {
          const result = await uploadDesktopAvatar(
            client,
            "bank_account",
            accountId,
            file,
          );
          if (result.ok) {
            await refreshAccounts().catch(() => undefined);
            notifyBankAccountsChanged();
          }
          return result;
        }}
        onRemoveAvatar={async (accountId) => {
          const result = await removeDesktopAvatar(
            client,
            "bank_account",
            accountId,
          );
          if (result.ok) {
            await refreshAccounts().catch(() => undefined);
            notifyBankAccountsChanged();
          }
          return result;
        }}
        onReorder={handleReorderAccounts}
      />
    );
  } else if (navId === "categories") {
    main = (
      <FinanceCategoriesView
        categories={categories}
        spentCentsByCategoryId={categorySpendById}
        spentMonth={categorySpendMonth}
        latestMonth={localMonthKey()}
        pending={categoriesPending}
        error={categoriesError}
        onSpentMonthChange={handleSpentMonthChange}
        categoryMetrics={categoryMetrics}
        categoryMetricsLoading={categoryMetricsLoading}
        accounts={accounts}
        accountAvatarSrcById={accountAvatarSrcById}
        organizations={organizations}
        goals={goals}
        recurrings={recurrings}
        onPatchTransaction={handleCategoryTransactionPatch}
        onBulkPatchTransactions={handleCategoryBulkPatch}
        onBulkDeleteTransactions={deleteTransactionsByIds}
        onCreateOrganizationFromQuery={(query) =>
          workspace.createOrganization({ name: query })
        }
        onChromeStateChange={setCategoriesChrome}
        onCreate={createCategory}
        onUpdate={updateCategory}
        onDelete={deleteCategory}
        onReorder={handleReorderCategories}
      />
    );
  } else if (showTransactions) {
    main = (
      <FinanceTransactionsView
        account={selected}
        allAccountsSelected={allAccountsSelected}
        accounts={accounts}
        accountAvatarSrcById={accountAvatarSrcById}
        onSelectAccount={handleSelectAccount}
        onSelectAllAccounts={handleSelectAllAccounts}
        onRequestImportWithFile={(file) => {
          setImportError(null);
          setLastImportResult(null);
          setCsvFile(file);
          setImportAccountId(selected?.id ?? null);
          setImportOpen(true);
        }}
        onCreateAccount={handleCreateAccount}
        onUploadAccountAvatar={async (accountId, file) => {
          const result = await uploadDesktopAvatar(
            client,
            "bank_account",
            accountId,
            file,
          );
          if (result.ok) {
            await refreshAccounts().catch(() => undefined);
          }
          return result;
        }}
        onRemoveAccountAvatar={async (accountId) => {
          const result = await removeDesktopAvatar(
            client,
            "bank_account",
            accountId,
          );
          if (result.ok) {
            await refreshAccounts().catch(() => undefined);
          }
          return result;
        }}
        onDeleteAccount={handleDeleteAccount}
        transactions={transactions}
        organizations={organizations}
        projects={projects}
        categories={categories}
        goals={goals}
        recurrings={recurrings}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        amountMinCents={amountMinCents}
        amountMaxCents={amountMaxCents}
        onAmountRangeChange={(min, max) => {
          setAmountMinCents(min);
          setAmountMaxCents(max);
        }}
        filterCategoryIds={filterCategoryIds}
        onFilterCategoryIdsChange={setFilterCategoryIds}
        filterOrganizationId={filterOrganizationId}
        onFilterOrganizationChange={setFilterOrganizationId}
        filterGoalId={filterGoalId}
        onFilterGoalChange={setFilterGoalId}
        filterRecurringId={filterRecurringId}
        onFilterRecurringChange={setFilterRecurringId}
        selectedIds={selectedIds}
        onToggleSelected={handleToggleSelected}
        onSetGroupSelected={handleSetGroupSelected}
        onClearSelection={() => setSelectedIds(new Set())}
        onSelectAllTransactions={handleSelectAllTransactions}
        selectAllPending={selectAllPending}
        onPatchTransaction={(id, patch) => {
          void handlePatchTransaction(id, patch);
        }}
        onBulkPatch={handleBulkPatch}
        onBulkDelete={handleBulkDelete}
        onDeleteTransaction={handleDeleteTransaction}
        onCreateOrganizationFromQuery={(query) =>
          workspace.createOrganization({ name: query })
        }
        hasMore={Boolean(nextCursor)}
        onLoadMore={() => {
          void loadTransactions({ cursor: nextCursor, append: true });
        }}
        onUpdateAccount={(accountId, patch) => {
          void handleUpdateAccount(accountId, patch);
        }}
        onChromeStateChange={setTransactionsChrome}
      />
    );
  }

  return (
    <>
      <RegisterPageTitle title={breadcrumbLabel} />
      {main}

      <FinanceImportModal
        open={importOpen}
        accounts={accounts}
        defaultAccountId={importAccountId ?? selected?.id ?? null}
        imports={imports}
        csvFile={csvFile}
        csvUploading={csvUploading}
        csvProgress={csvProgress}
        lastImportResult={lastImportResult}
        error={importError}
        onClose={() => {
          if (csvUploading) return;
          setImportOpen(false);
          setImportError(null);
          setLastImportResult(null);
          setCsvFile(null);
          setCsvProgress(null);
        }}
        onAccountChange={(accountId) => {
          setImportAccountId(accountId);
          setLastImportResult(null);
          setImportError(null);
        }}
        onCsvFileSelect={(file) => {
          setCsvFile(file);
          setLastImportResult(null);
          setImportError(null);
        }}
        onImport={() => {
          void handleImportCsv();
        }}
      />

      <FinanceBankAccountModal
        open={pageAccountModal != null}
        mode={pageAccountModal?.mode ?? "create"}
        initialValues={
          pageAccountModal?.mode === "edit"
            ? {
                name: pageAccountModal.account.name,
                ibanOrMask: pageAccountModal.account.ibanOrMask,
                type: pageAccountModal.account.type,
              }
            : {
                name: "",
                ibanOrMask: null,
                type:
                  pageAccountModal?.mode === "create"
                    ? (pageAccountModal.type ?? "bank_account")
                    : "bank_account",
              }
        }
        pending={pageAccountModalPending}
        error={pageAccountModalError}
        avatarSrc={
          pageAccountModal?.mode === "edit"
            ? (accountAvatarSrcById[pageAccountModal.account.id] ?? null)
            : null
        }
        onUploadAvatar={
          pageAccountModal?.mode === "edit"
            ? async (file) => {
                const result = await uploadDesktopAvatar(
                  client,
                  "bank_account",
                  pageAccountModal.account.id,
                  file,
                );
                if (result.ok) {
                  await refreshAccounts().catch(() => undefined);
                  notifyBankAccountsChanged();
                }
                return result;
              }
            : undefined
        }
        onRemoveAvatar={
          pageAccountModal?.mode === "edit"
            ? async () => {
                const result = await removeDesktopAvatar(
                  client,
                  "bank_account",
                  pageAccountModal.account.id,
                );
                if (result.ok) {
                  await refreshAccounts().catch(() => undefined);
                  notifyBankAccountsChanged();
                }
                return result;
              }
            : undefined
        }
        onClose={() => {
          if (pageAccountModalPending) return;
          setPageAccountModal(null);
          setPageAccountModalError(null);
        }}
        onSubmit={async (values) => {
          if (!pageAccountModal) return;
          setPageAccountModalPending(true);
          setPageAccountModalError(null);
          try {
            if (pageAccountModal.mode === "edit") {
              await handleUpdateAccount(pageAccountModal.account.id, values);
            } else {
              await handleCreateAccount(values);
            }
            setPageAccountModal(null);
          } catch (reason) {
            setPageAccountModalError(
              reason instanceof Error
                ? reason.message
                : "Could not save bank account.",
            );
          } finally {
            setPageAccountModalPending(false);
          }
        }}
        onDelete={
          pageAccountModal?.mode === "edit"
            ? async () => {
                await handleDeleteAccount(pageAccountModal.account.id);
                setPageAccountModal(null);
              }
            : undefined
        }
      />

    </>
  );
}
