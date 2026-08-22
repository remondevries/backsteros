"use client";

import type {
  BankAccount,
  FinanceAssetsDebt,
  FinanceAssetsDebtRange,
  FinancialCategory,
  FinancialGoal,
  FinancialRecurring,
  FinancialTransaction,
} from "@backsteros/contracts";
import {
  ArrowUpRightIcon,
  TriangleDownIcon,
  TriangleUpIcon,
  XIcon,
} from "@primer/octicons-react";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { AccountIncomeExpenseChart } from "./account-income-expense-chart.js";
import { AssetsDebtChart } from "./assets-debt-chart.js";
import { DefaultProjectIcon } from "../projects/default-project-icon.js";
import {
  DROPDOWN_NO_GOAL_VALUE,
  DROPDOWN_NO_PROJECT_VALUE,
  DROPDOWN_NO_RECURRING_VALUE,
  buildOrganizationDropdownOptions,
  resolveDropdownNone,
} from "../dropdowns/dropdown-options.js";
import { EntityDetailLayout } from "../entity/entity-detail-layout.js";
import { EntityListAvatar } from "../entity/entity-list-avatar.js";
import {
  buildCategoryDropdownOptions,
  FinanceTransactionsPanelList,
  type FinanceCategoryOrganization,
  type FinanceCategoryTransactionPatch,
} from "./finance-categories-view.js";
import {
  asOfForMonthKey,
  FinanceMonthNavigator,
  localMonthKey,
} from "./finance-month-navigator.js";
import {
  FinanceTransactionDetailPanel,
  type FinanceTransactionPatch,
} from "./finance-transactions-view.js";
import {
  resolveGoalSavedCents,
} from "./finance-goals-view.js";
import {
  getDisplayProjectIcon,
  getEntityIconColor,
  ProjectOcticon,
} from "../projects/project-octicon.js";
import {
  computeNetThisMonthStats,
  formatNetThisMonthRangeLabel,
} from "../../finance/net-this-month.js";
import { buildNonCashflowCategoryIdSet } from "../../finance/cashflow-exclusion.js";
import {
  categoryNetSpendAbsCents,
  categoryNetSpendDisplayCents,
  categoryNetSpendSign,
} from "../../finance/category-net-spend.js";
import { upcomingMonthlyPaymentDate } from "../../finance/recurring-next-date.js";

const REVIEW_TRANSACTIONS_LIMIT = 10;
const REVIEW_EXIT_MS = 320;
const DASHBOARD_DETAIL_WIDTH_PX = 420;
/** Inclusive window: today through today + 14 days. */
const NEXT_TWO_WEEKS_DAYS = 14;

export type FinanceDashboardTopCategory = {
  id: string;
  name: string;
  icon: string | null;
  spentCents: number;
  /** 0 = top-level category, 1 = subcategory (matches Categories page nesting). */
  depth: 0 | 1;
};

export type FinanceDashboardOrganization = FinanceCategoryOrganization;

export type FinanceDashboardProject = {
  id: string;
  key: string;
  name: string;
  icon?: string | null;
  type?: string | null;
};

export type FinanceDashboardViewProps = {
  reviewTransactions: FinancialTransaction[];
  /** Full uncategorized count for the badge (may exceed loaded preview rows). */
  reviewTotalCount?: number;
  reviewLoading?: boolean;
  categories: FinancialCategory[];
  /** Absolute net spend by category id for the selected dashboard month.
   * Values use net-spend polarity (positive = outflow, negative = inflow). */
  spentCentsByCategoryId: Record<string, number>;
  categorySpendLoading?: boolean;
  /** Transactions for the selected dashboard month (daily income/expense chart). */
  monthTransactions?: FinancialTransaction[];
  /** Prior calendar month transactions (MTD compare for Net this month). */
  priorMonthTransactions?: FinancialTransaction[];
  monthChartLoading?: boolean;
  /** Selected dashboard month (`YYYY-MM`). Defaults to the current local month. */
  chartMonth?: string | null;
  onChartMonthChange?: (month: string) => void;
  goals: FinancialGoal[];
  goalsLoading?: boolean;
  recurrings?: FinancialRecurring[];
  accounts: BankAccount[];
  accountAvatarSrcById?: Record<string, string>;
  organizations: FinanceDashboardOrganization[];
  projects?: FinanceDashboardProject[];
  assetsDebt?: FinanceAssetsDebt | null;
  assetsDebtLoading?: boolean;
  assetsDebtRange?: FinanceAssetsDebtRange;
  onAssetsDebtRangeChange?: (range: FinanceAssetsDebtRange) => void;
  onOpenReview?: () => void;
  onOpenCategories?: () => void;
  onOpenGoals?: () => void;
  onOpenRecurrings?: () => void;
  onOpenAccounts?: () => void;
  onOpenCashflow?: () => void;
  onPatchTransaction: (id: string, patch: FinanceTransactionPatch) => void;
  onBulkPatchTransactions?: (
    ids: string[],
    patch: FinanceCategoryTransactionPatch,
  ) => void;
  onBulkDeleteTransactions?: (ids: string[]) => void | Promise<void>;
  onCreateOrganizationFromQuery?: (
    query: string,
  ) => Promise<{ id: string }> | { id: string };
};

function formatMoney(cents: number, currency = "EUR"): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  } catch {
    return `€${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
  }
}

function formatMoneyFixed(cents: number, currency = "EUR"): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `€${value.toFixed(2)}`;
  }
}

function formatChangePercent(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${abs.toFixed(digits)}%`;
}

function formatDashboardDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
    }).format(date);
  } catch {
    return iso;
  }
}

function localTodayIso(asOf: Date = new Date()): string {
  return `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, "0")}-${String(asOf.getDate()).padStart(2, "0")}`;
}

function addLocalDaysIso(iso: string, days: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]) + days,
  );
  return localTodayIso(date);
}

type UpcomingRecurringItem = {
  id: string;
  name: string;
  icon: string | null;
  amountCents: number | null;
  paymentDate: string;
};

function buildUpcomingRecurrings(
  recurrings: FinancialRecurring[],
  asOf: Date = new Date(),
): UpcomingRecurringItem[] {
  const start = localTodayIso(asOf);
  const end = addLocalDaysIso(start, NEXT_TWO_WEEKS_DAYS);
  if (!end) return [];

  const items: UpcomingRecurringItem[] = [];
  for (const row of recurrings) {
    if (row.archived) continue;
    const paymentDate = upcomingMonthlyPaymentDate(row.nextDate, asOf);
    if (!paymentDate) continue;
    if (paymentDate < start || paymentDate > end) continue;
    items.push({
      id: row.id,
      name: row.name,
      icon: row.icon,
      amountCents:
        row.amountCents != null && row.amountCents > 0 ? row.amountCents : null,
      paymentDate,
    });
  }

  return items.sort(
    (a, b) =>
      a.paymentDate.localeCompare(b.paymentDate) ||
      a.name.localeCompare(b.name),
  );
}

function EntityMark({
  icon,
  size = 16,
}: {
  icon: string | null | undefined;
  size?: number;
}) {
  const color = getEntityIconColor(icon);
  const display = getDisplayProjectIcon(icon);
  if (!display) {
    return (
      <DefaultProjectIcon
        size={size}
        style={color ? { color } : undefined}
      />
    );
  }
  return (
    <ProjectOcticon
      icon={icon}
      size={size}
      style={color ? { color } : undefined}
    />
  );
}

function DashboardWidget({
  title,
  badge,
  action,
  children,
  empty,
  className,
}: {
  title: string;
  badge?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  empty?: boolean;
  className?: string;
}) {
  return (
    <section
      className={[
        "finance-dashboard__widget",
        empty ? "finance-dashboard__widget--empty" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="finance-dashboard__widget-header">
        <div className="finance-dashboard__widget-title-row">
          <h2 className="finance-dashboard__widget-title">{title}</h2>
          {badge}
        </div>
        {action}
      </header>
      <div className="finance-dashboard__widget-body">{children}</div>
    </section>
  );
}

function NetThisMonthPanel({
  month,
  transactions,
  priorTransactions,
  nonCashflowCategoryIds,
  loading,
}: {
  month: string;
  transactions: FinancialTransaction[];
  priorTransactions: FinancialTransaction[];
  nonCashflowCategoryIds: ReadonlySet<string>;
  loading: boolean;
}) {
  const stats = useMemo(
    () =>
      computeNetThisMonthStats({
        month,
        transactions,
        priorTransactions,
        nonCashflowCategoryIds,
      }),
    [month, nonCashflowCategoryIds, priorTransactions, transactions],
  );

  if (loading) {
    return <p className="finance-dashboard__empty">Loading…</p>;
  }

  if (!stats) {
    return (
      <p className="finance-dashboard__empty">No net for this month yet.</p>
    );
  }

  const change = stats.changePercent;
  const changeUp = change == null ? stats.netCents >= 0 : change >= 0;
  const flowTotal = stats.incomeCents + stats.spendCents;
  const incomeShare =
    flowTotal > 0 ? (stats.incomeCents / flowTotal) * 100 : 0;
  const spendShare =
    flowTotal > 0 ? (stats.spendCents / flowTotal) * 100 : 0;

  return (
    <div className="finance-net-this-month">
      <p
        className={[
          "finance-net-this-month__total",
          stats.netCents > 0
            ? "finance-net-this-month__total--positive"
            : stats.netCents < 0
              ? "finance-net-this-month__total--negative"
              : null,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {formatMoneyFixed(stats.netCents)}
      </p>

      <div className="finance-net-this-month__compare">
        {change != null ? (
          <span
            className={[
              "finance-net-this-month__delta",
              changeUp
                ? "finance-net-this-month__delta--positive"
                : "finance-net-this-month__delta--negative",
            ].join(" ")}
          >
            {changeUp ? (
              <TriangleUpIcon size={12} />
            ) : (
              <TriangleDownIcon size={12} />
            )}
            {formatChangePercent(change)}
          </span>
        ) : stats.netCents !== 0 ? (
          <span
            className={[
              "finance-net-this-month__delta",
              stats.netCents >= 0
                ? "finance-net-this-month__delta--positive"
                : "finance-net-this-month__delta--negative",
            ].join(" ")}
          >
            New
          </span>
        ) : null}
        <span className="finance-net-this-month__compare-text">
          vs {formatMoneyFixed(stats.priorNetCents)} in{" "}
          {formatNetThisMonthRangeLabel(stats.priorPeriod)}
        </span>
      </div>

      <div
        className="finance-net-this-month__bar"
        role="presentation"
        aria-hidden="true"
      >
        <span
          className="finance-net-this-month__bar-income"
          style={{ width: `${incomeShare}%` }}
        />
        <span
          className="finance-net-this-month__bar-spend"
          style={{ width: `${spendShare}%` }}
        />
      </div>

      <div className="finance-net-this-month__breakdown">
        <div className="finance-net-this-month__metric">
          <span className="finance-net-this-month__metric-label">Income</span>
          <span className="finance-net-this-month__metric-value finance-net-this-month__metric-value--income">
            <span className="finance-net-this-month__dot finance-net-this-month__dot--income" />
            {formatMoneyFixed(stats.incomeCents)}
          </span>
        </div>
        <div className="finance-net-this-month__metric">
          <span className="finance-net-this-month__metric-label">Spend</span>
          <span className="finance-net-this-month__metric-value">
            <span className="finance-net-this-month__dot finance-net-this-month__dot--spend" />
            {formatMoneyFixed(stats.spendCents)}
          </span>
        </div>
      </div>
    </div>
  );
}

function sortCategories(rows: FinancialCategory[]): FinancialCategory[] {
  return [...rows].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

/**
 * Builds the categories list in the same main → subcategory layout order
 * as Finance → Categories (Regular group), not ranked by spend.
 * Parent amounts roll up child net spend; empty branches are omitted.
 * `spentCents` is net-spend polarity (positive = outflow, negative = inflow).
 */
function buildTopCategories(
  categories: FinancialCategory[],
  spentCentsByCategoryId: Record<string, number>,
): FinanceDashboardTopCategory[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const childrenByParent = new Map<string, FinancialCategory[]>();
  const roots: FinancialCategory[] = [];

  for (const category of categories) {
    if (category.listing === "excluded" || category.kind === "transfer") continue;
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

  const rows: FinanceDashboardTopCategory[] = [];

  for (const root of sortCategories(roots)) {
    const children = sortCategories(childrenByParent.get(root.id) ?? []);
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

type TopCategoryGroup = {
  parent: FinanceDashboardTopCategory;
  children: FinanceDashboardTopCategory[];
};

function groupTopCategories(
  rows: FinanceDashboardTopCategory[],
): TopCategoryGroup[] {
  const groups: TopCategoryGroup[] = [];
  for (const row of rows) {
    if (row.depth === 0) {
      groups.push({ parent: row, children: [] });
      continue;
    }
    const current = groups[groups.length - 1];
    if (current) current.children.push(row);
  }
  return groups;
}

function CategorySpendRow({
  row,
  totalCents,
  collapsible,
  collapsed,
  onToggle,
  badgeCount,
}: {
  row: FinanceDashboardTopCategory;
  totalCents: number;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  /** Subcategory count badge (Categories-list style); omit for leaves. */
  badgeCount?: number | null;
}) {
  const ratio =
    totalCents > 0
      ? Math.min(1, categoryNetSpendAbsCents(row.spentCents) / totalCents)
      : 0;
  const color = getEntityIconColor(row.icon) ?? "#9CA3AF";
  const showBadge = badgeCount != null && badgeCount > 0;
  const amountSign = categoryNetSpendSign(row.spentCents);

  return (
    <li
      className={[
        "finance-dashboard__category-row",
        row.depth > 0 ? "finance-dashboard__category-row--child" : null,
        collapsible ? "finance-dashboard__category-row--parent" : null,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="finance-dashboard__category-meta">
        {collapsible ? (
          <button
            type="button"
            className="finance-dashboard__category-chevron"
            aria-label={collapsed ? `Expand ${row.name}` : `Collapse ${row.name}`}
            aria-expanded={!collapsed}
            onClick={onToggle}
          >
            <span
              className="finance-dashboard__category-chevron-icon"
              data-expanded={!collapsed}
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <path
                  d="M9 6l6 6-6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
        ) : (
          <span
            className="finance-dashboard__category-chevron-spacer"
            aria-hidden="true"
          />
        )}
        {showBadge ? (
          <span
            className="finance-dashboard__category-count"
            style={
              {
                "--finance-dash-cat-count-color": color,
              } as CSSProperties
            }
            aria-label={`${badgeCount} subcategories`}
          >
            {badgeCount}
          </span>
        ) : row.depth > 0 ? (
          <span
            className="finance-dashboard__category-icon"
            style={{ color }}
            aria-hidden="true"
          >
            <EntityMark icon={row.icon} size={14} />
          </span>
        ) : (
          <span
            className="finance-dashboard__category-count-spacer"
            aria-hidden="true"
          />
        )}
        {collapsible ? (
          <button
            type="button"
            className="finance-dashboard__category-name finance-dashboard__category-name--button"
            onClick={onToggle}
          >
            {row.name}
          </button>
        ) : (
          <span className="finance-dashboard__category-name">{row.name}</span>
        )}
        <span
          className={[
            "finance-dashboard__category-amount",
            amountSign === "debit"
              ? "is-debit"
              : amountSign === "credit"
                ? "is-credit"
                : null,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {formatMoney(categoryNetSpendDisplayCents(row.spentCents))}
        </span>
      </div>
      <div className="finance-dashboard__category-bar" role="presentation">
        <span
          className="finance-dashboard__category-bar-fill"
          style={{
            width: `${Math.max(4, ratio * 100)}%`,
            background: color,
          }}
        />
      </div>
    </li>
  );
}

export function FinanceDashboardView({
  reviewTransactions,
  reviewTotalCount,
  reviewLoading = false,
  categories,
  spentCentsByCategoryId,
  categorySpendLoading = false,
  monthTransactions = [],
  priorMonthTransactions = [],
  monthChartLoading = false,
  chartMonth = null,
  onChartMonthChange,
  goals,
  goalsLoading = false,
  recurrings = [],
  accounts,
  accountAvatarSrcById = {},
  organizations,
  projects = [],
  assetsDebt = null,
  assetsDebtLoading = false,
  assetsDebtRange = "1M",
  onAssetsDebtRangeChange,
  onOpenReview,
  onOpenCategories,
  onOpenGoals,
  onOpenRecurrings,
  onOpenAccounts,
  onOpenCashflow,
  onPatchTransaction,
  onBulkPatchTransactions,
  onBulkDeleteTransactions,
  onCreateOrganizationFromQuery,
}: FinanceDashboardViewProps) {
  const [selectedTx, setSelectedTx] = useState<FinancialTransaction | null>(
    null,
  );
  const [collapsedTopCategories, setCollapsedTopCategories] = useState<
    Record<string, boolean>
  >({});
  const [exitingIds, setExitingIds] = useState<Set<string>>(() => new Set());
  const [exitingRows, setExitingRows] = useState<
    Record<string, FinancialTransaction>
  >({});
  const exitTimersRef = useRef<Map<string, number>>(new Map());
  const reviewOrderRef = useRef<string[]>([]);
  /** Monthly spending chart: all accounts selected by default. */
  const [spendingAccountIds, setSpendingAccountIds] = useState<Set<string>>(
    () => new Set(accounts.map((account) => account.id)),
  );
  const spendingAccountCatalogRef = useRef<string[]>(
    accounts.map((account) => account.id),
  );

  useEffect(() => {
    const previousCatalog = new Set(spendingAccountCatalogRef.current);
    setSpendingAccountIds((prev) => {
      const next = new Set<string>();
      const firstLoad = previousCatalog.size === 0;
      for (const account of accounts) {
        const isNew = !previousCatalog.has(account.id);
        if (firstLoad || isNew || prev.has(account.id)) {
          next.add(account.id);
        }
      }
      if (
        next.size === prev.size &&
        [...next].every((id) => prev.has(id))
      ) {
        return prev;
      }
      return next;
    });
    spendingAccountCatalogRef.current = accounts.map((account) => account.id);
  }, [accounts]);

  const spendingAccounts = useMemo(
    () =>
      [...accounts].sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
    [accounts],
  );

  const nonCashflowCategoryIds = useMemo(
    () => buildNonCashflowCategoryIdSet(categories),
    [categories],
  );

  const filteredMonthTransactions = useMemo(() => {
    if (spendingAccountIds.size === 0) return [];
    if (
      accounts.length > 0 &&
      spendingAccountIds.size === accounts.length
    ) {
      return monthTransactions;
    }
    return monthTransactions.filter((tx) =>
      spendingAccountIds.has(tx.bankAccountId),
    );
  }, [accounts.length, monthTransactions, spendingAccountIds]);

  const toggleSpendingAccount = (accountId: string) => {
    setSpendingAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };

  const topCategories = useMemo(
    () => buildTopCategories(categories, spentCentsByCategoryId),
    [categories, spentCentsByCategoryId],
  );
  const topCategoryGroups = useMemo(
    () => groupTopCategories(topCategories),
    [topCategories],
  );
  const latestChartMonth = localMonthKey();
  const resolvedChartMonth =
    chartMonth && /^\d{4}-\d{2}$/.test(chartMonth)
      ? chartMonth
      : latestChartMonth;
  const chartAsOf = useMemo(
    () => asOfForMonthKey(resolvedChartMonth),
    [resolvedChartMonth],
  );
  const topCategoriesTotal = useMemo(
    () =>
      topCategories
        .filter((row) => row.depth === 0)
        .reduce((sum, row) => sum + categoryNetSpendAbsCents(row.spentCents), 0),
    [topCategories],
  );
  const activeGoals = useMemo(
    () =>
      [...goals]
        .filter((goal) => goal.listing === "active")
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        ),
    [goals],
  );
  const upcomingRecurrings = useMemo(
    () => buildUpcomingRecurrings(recurrings),
    [recurrings],
  );
  const reviewItems = useMemo(() => {
    const byId = new Map<string, FinancialTransaction>();
    for (const tx of reviewTransactions) byId.set(tx.id, tx);
    for (const [id, tx] of Object.entries(exitingRows)) {
      if (exitingIds.has(id)) byId.set(id, tx);
    }

    const liveIds = reviewTransactions.map((tx) => tx.id);
    const liveIdSet = new Set(liveIds);
    const nextOrder: string[] = [];
    for (const id of reviewOrderRef.current) {
      if (liveIdSet.has(id) || exitingIds.has(id)) nextOrder.push(id);
    }
    for (const id of liveIds) {
      if (!nextOrder.includes(id)) nextOrder.push(id);
    }
    // Keep room for exiting rows plus the next live inbox items (max 10 live).
    const capped: string[] = [];
    let liveKept = 0;
    for (const id of nextOrder) {
      if (exitingIds.has(id)) {
        capped.push(id);
        continue;
      }
      if (liveKept >= REVIEW_TRANSACTIONS_LIMIT) continue;
      capped.push(id);
      liveKept += 1;
    }
    reviewOrderRef.current = capped;

    return capped
      .map((id) => byId.get(id))
      .filter((tx): tx is FinancialTransaction => Boolean(tx));
  }, [exitingIds, exitingRows, reviewTransactions]);

  useEffect(() => {
    return () => {
      for (const timer of exitTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      exitTimersRef.current.clear();
    };
  }, []);

  const finishExit = (id: string) => {
    setExitingIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setExitingRows((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    const timer = exitTimersRef.current.get(id);
    if (timer != null) {
      window.clearTimeout(timer);
      exitTimersRef.current.delete(id);
    }
  };

  const beginExit = (tx: FinancialTransaction) => {
    const id = tx.id;
    setExitingRows((current) => ({ ...current, [id]: tx }));
    setExitingIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
    const existing = exitTimersRef.current.get(id);
    if (existing != null) window.clearTimeout(existing);
    exitTimersRef.current.set(
      id,
      window.setTimeout(() => finishExit(id), REVIEW_EXIT_MS),
    );
  };

  const isReviewFiled = (tx: FinancialTransaction) =>
    Boolean(tx.categoryId) && Boolean(tx.organizationId);

  const handleReviewPatch = (id: string, patch: FinanceTransactionPatch) => {
    const current =
      reviewTransactions.find((tx) => tx.id === id) ??
      exitingRows[id] ??
      (selectedTx?.id === id ? selectedTx : null);
    if (!current) {
      onPatchTransaction(id, patch);
      return;
    }
    const next = { ...current, ...patch };
    if (isReviewFiled(next) && !isReviewFiled(current)) {
      beginExit(next);
      if (selectedTx?.id === id) setSelectedTx(null);
    } else if (selectedTx?.id === id) {
      setSelectedTx(next);
    }
    onPatchTransaction(id, patch);
  };

  const handleReviewBulkPatch = (
    ids: string[],
    patch: FinanceCategoryTransactionPatch,
  ) => {
    for (const id of ids) {
      const current =
        reviewTransactions.find((tx) => tx.id === id) ?? exitingRows[id];
      if (!current) continue;
      const next = { ...current, ...patch };
      if (isReviewFiled(next) && !isReviewFiled(current)) {
        beginExit(next);
        if (selectedTx?.id === id) setSelectedTx(null);
      }
    }
    onBulkPatchTransactions?.(ids, patch);
  };

  const categoryOptions = useMemo(
    () => buildCategoryDropdownOptions(categories),
    [categories],
  );
  const orgOptions = useMemo(
    () => buildOrganizationDropdownOptions(organizations),
    [organizations],
  );
  const projectOptions = useMemo(
    () => [
      {
        value: DROPDOWN_NO_PROJECT_VALUE,
        label: "No project",
        searchTerms: "no project unassigned",
        icon: <DefaultProjectIcon size={14} className="text-foreground/70" />,
      },
      ...projects.map((project) => ({
        value: project.id,
        label: project.name,
        searchTerms: `${project.key} ${project.name}`,
      })),
    ],
    [projects],
  );
  const goalOptions = useMemo(
    () => [
      {
        value: DROPDOWN_NO_GOAL_VALUE,
        label: "No goal",
        searchTerms: "no goal unassigned",
        icon: <DefaultProjectIcon size={14} className="text-foreground/70" />,
      },
      ...[...goals]
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        )
        .map((goal) => ({
          value: goal.id,
          label: goal.name,
          searchTerms: `${goal.name} ${goal.listing}`,
          icon: (
            <ProjectOcticon
              icon={goal.icon}
              size={14}
              style={
                getEntityIconColor(goal.icon)
                  ? { color: getEntityIconColor(goal.icon)! }
                  : undefined
              }
            />
          ),
        })),
    ],
    [goals],
  );
  const recurringOptions = useMemo(
    () => [
      {
        value: DROPDOWN_NO_RECURRING_VALUE,
        label: "No recurring",
        searchTerms: "no recurring unassigned none",
        icon: <DefaultProjectIcon size={14} className="text-foreground/70" />,
      },
      ...[...recurrings]
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        )
        .map((entry) => ({
          value: entry.id,
          label: entry.name,
          searchTerms: entry.name,
          icon: (
            <ProjectOcticon
              icon={entry.icon}
              size={14}
              style={
                getEntityIconColor(entry.icon)
                  ? { color: getEntityIconColor(entry.icon)! }
                  : undefined
              }
            />
          ),
        })),
    ],
    [recurrings],
  );
  const moveAccountOptions = useMemo(
    () =>
      [...accounts]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => {
          const avatarSrc = accountAvatarSrcById[entry.id];
          const initial = entry.name.trim().charAt(0).toUpperCase() || "?";
          return {
            value: entry.id,
            label: entry.name,
            searchTerms: `${entry.name} ${entry.ibanOrMask ?? ""} ${entry.key}`,
            icon: avatarSrc ? (
              <EntityListAvatar
                src={avatarSrc}
                size={18}
                shape="rounded-square"
              />
            ) : (
              <span className="finance-account-dropdown-avatar-fallback">
                {initial}
              </span>
            ),
          };
        }),
    [accountAvatarSrcById, accounts],
  );

  const selectedId = selectedTx?.id ?? null;
  useEffect(() => {
    if (!selectedId) return;
    if (exitingIds.has(selectedId)) {
      setSelectedTx(null);
      return;
    }
    const next = reviewTransactions.find((tx) => tx.id === selectedId);
    if (next) setSelectedTx(next);
    else setSelectedTx(null);
  }, [exitingIds, reviewTransactions, selectedId]);

  useEffect(() => {
    if (!selectedTx) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedTx(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedTx]);

  const handlePatchSelected = (id: string, patch: FinanceTransactionPatch) => {
    handleReviewPatch(id, patch);
  };

  return (
    <EntityDetailLayout sectionLabel="Finance" title="Dashboard">
      <div
        className={[
          "finance-dashboard-shell",
          selectedTx ? "has-review-overlay" : null,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="finance-dashboard">
          <FinanceMonthNavigator
            month={resolvedChartMonth}
            latestMonth={latestChartMonth}
            onChange={onChartMonthChange}
            aria-label="Dashboard month"
            className="finance-dashboard__month-nav"
          />
          <div className="finance-dashboard__columns">
            <div className="finance-dashboard__column finance-dashboard__column--primary">
            <DashboardWidget
              title="Monthly spending"
              className="finance-dashboard__widget--square finance-dashboard__widget--chart"
              action={
                spendingAccounts.length > 0 ? (
                  <div
                    className="finance-dashboard__account-toggles"
                    role="group"
                    aria-label="Accounts in monthly spending"
                  >
                    {spendingAccounts.map((account) => {
                      const active = spendingAccountIds.has(account.id);
                      return (
                        <button
                          key={account.id}
                          type="button"
                          className={[
                            "finance-dashboard__account-toggle",
                            active ? "is-active" : null,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          aria-pressed={active}
                          title={account.name}
                          onClick={() => toggleSpendingAccount(account.id)}
                        >
                          {account.name}
                        </button>
                      );
                    })}
                  </div>
                ) : null
              }
            >
              <AccountIncomeExpenseChart
                key={`${resolvedChartMonth}:${[...spendingAccountIds].sort().join(",")}`}
                scope="month"
                asOf={chartAsOf}
                transactions={filteredMonthTransactions}
                nonCashflowCategoryIds={nonCashflowCategoryIds}
                loading={monthChartLoading}
                className="finance-dashboard__cashflow-chart"
              />
            </DashboardWidget>

            <DashboardWidget
              title="Transactions to review"
              className="finance-dashboard__widget--review"
              badge={
                (reviewTotalCount ?? reviewTransactions.length) > 0 ? (
                  <span className="finance-dashboard__badge">
                    {reviewTotalCount ?? reviewTransactions.length}
                  </span>
                ) : null
              }
              action={
                onOpenReview ? (
                  <button
                    type="button"
                    className="finance-dashboard__link-button"
                    onClick={onOpenReview}
                  >
                    Inbox
                    <ArrowUpRightIcon size={12} />
                  </button>
                ) : null
              }
            >
              <div className="finance-dashboard__review-list">
                <FinanceTransactionsPanelList
                  transactions={reviewItems}
                  loading={reviewLoading}
                  categories={categories}
                  accounts={accounts}
                  accountAvatarSrcById={accountAvatarSrcById}
                  organizations={organizations}
                  goals={goals}
                  recurrings={recurrings}
                  emptyLabel="Nothing left to review."
                  sectionTitle={null}
                  groupByMonth={false}
                  showFilterBar={false}
                  showRecurringColumn={false}
                  activeTransactionId={selectedTx?.id ?? null}
                  exitingTransactionIds={exitingIds}
                  onOpenTransaction={(tx) => {
                    if (exitingIds.has(tx.id)) return;
                    setSelectedTx((current) =>
                      current?.id === tx.id ? null : tx,
                    );
                  }}
                  onPatchTransaction={handleReviewPatch}
                  onBulkPatchTransactions={
                    onBulkPatchTransactions ? handleReviewBulkPatch : undefined
                  }
                  onBulkDeleteTransactions={onBulkDeleteTransactions}
                  onCreateOrganizationFromQuery={onCreateOrganizationFromQuery}
                />
              </div>
            </DashboardWidget>

            <DashboardWidget
              title="Net this month"
              className="finance-dashboard__widget--net-this-month"
              action={
                onOpenCashflow ? (
                  <button
                    type="button"
                    className="finance-dashboard__link-button"
                    onClick={onOpenCashflow}
                  >
                    Cash flow
                    <ArrowUpRightIcon size={12} />
                  </button>
                ) : null
              }
            >
              <NetThisMonthPanel
                month={resolvedChartMonth}
                transactions={monthTransactions}
                priorTransactions={priorMonthTransactions}
                nonCashflowCategoryIds={nonCashflowCategoryIds}
                loading={monthChartLoading}
              />
            </DashboardWidget>
          </div>

          <div className="finance-dashboard__column finance-dashboard__column--secondary">
            <DashboardWidget
              title="Amount of assets"
              className="finance-dashboard__widget--square finance-dashboard__widget--chart finance-dashboard__widget--assets"
              action={
                onOpenAccounts ? (
                  <button
                    type="button"
                    className="finance-dashboard__link-button"
                    onClick={onOpenAccounts}
                  >
                    Accounts
                    <ArrowUpRightIcon size={12} />
                  </button>
                ) : null
              }
            >
              <AssetsDebtChart
                data={assetsDebt}
                loading={assetsDebtLoading}
                range={assetsDebtRange}
                onRangeChange={(next) => onAssetsDebtRangeChange?.(next)}
              />
            </DashboardWidget>

            <DashboardWidget
              title="Top categories"
              action={
                onOpenCategories ? (
                  <button
                    type="button"
                    className="finance-dashboard__link-button"
                    onClick={onOpenCategories}
                  >
                    Categories
                    <ArrowUpRightIcon size={12} />
                  </button>
                ) : null
              }
            >
              {categorySpendLoading ? (
                <p className="finance-dashboard__empty">Loading…</p>
              ) : topCategories.length === 0 ? (
                <p className="finance-dashboard__empty">
                  No categorized spending this month.
                </p>
              ) : (
                <ul className="finance-dashboard__category-list">
                  {topCategoryGroups.map((group) => {
                    const collapsible = group.children.length > 0;
                    const collapsed = Boolean(
                      collapsedTopCategories[group.parent.id],
                    );
                    return (
                      <Fragment key={group.parent.id}>
                        <CategorySpendRow
                          row={group.parent}
                          totalCents={topCategoriesTotal}
                          collapsible={collapsible}
                          collapsed={collapsed}
                          badgeCount={
                            collapsible ? group.children.length : null
                          }
                          onToggle={
                            collapsible
                              ? () =>
                                  setCollapsedTopCategories((current) => ({
                                    ...current,
                                    [group.parent.id]: !current[group.parent.id],
                                  }))
                              : undefined
                          }
                        />
                        {!collapsed
                          ? group.children.map((child) => (
                              <CategorySpendRow
                                key={child.id}
                                row={child}
                                totalCents={topCategoriesTotal}
                                badgeCount={null}
                              />
                            ))
                          : null}
                      </Fragment>
                    );
                  })}
                </ul>
              )}
            </DashboardWidget>

            <DashboardWidget
              title="Next two weeks"
              action={
                onOpenRecurrings ? (
                  <button
                    type="button"
                    className="finance-dashboard__link-button"
                    onClick={onOpenRecurrings}
                  >
                    Recurring
                    <ArrowUpRightIcon size={12} />
                  </button>
                ) : null
              }
            >
              {upcomingRecurrings.length === 0 ? (
                <p className="finance-dashboard__empty">
                  No recurrings due in the next two weeks.
                </p>
              ) : (
                <ul className="finance-dashboard__list finance-dashboard__upcoming-list">
                  {upcomingRecurrings.map((item) => (
                    <li key={item.id} className="finance-dashboard__upcoming-row">
                      <div className="finance-dashboard__list-row finance-dashboard__list-row--static">
                        <span className="finance-dashboard__list-date">
                          {formatDashboardDate(item.paymentDate)}
                        </span>
                        <span
                          className="finance-dashboard__upcoming-icon"
                          aria-hidden="true"
                        >
                          <EntityMark icon={item.icon} size={16} />
                        </span>
                        <span className="finance-dashboard__list-label">
                          {item.name}
                        </span>
                        <span className="finance-dashboard__list-amount">
                          {item.amountCents != null
                            ? formatMoney(item.amountCents)
                            : "—"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </DashboardWidget>

            <DashboardWidget
              title="Goals"
              action={
                onOpenGoals ? (
                  <button
                    type="button"
                    className="finance-dashboard__link-button"
                    onClick={onOpenGoals}
                  >
                    Goals
                    <ArrowUpRightIcon size={12} />
                  </button>
                ) : null
              }
            >
              {goalsLoading ? (
                <p className="finance-dashboard__empty">Loading…</p>
              ) : activeGoals.length === 0 ? (
                <p className="finance-dashboard__empty">No active goals.</p>
              ) : (
                <ul className="finance-dashboard__list finance-dashboard__goal-list">
                  {activeGoals.map((goal) => {
                    const savedCents = resolveGoalSavedCents(goal);
                    const goalAmount =
                      goal.goalAmountCents != null && goal.goalAmountCents > 0
                        ? goal.goalAmountCents
                        : null;
                    const ratio =
                      goalAmount != null
                        ? Math.min(1, Math.max(0, savedCents / goalAmount))
                        : 0;
                    const color = getEntityIconColor(goal.icon) ?? "#3f9d6e";
                    return (
                      <li
                        key={goal.id}
                        className="finance-dashboard__goal-row"
                      >
                        <div className="finance-dashboard__list-row finance-dashboard__list-row--static">
                          <span
                            className="finance-dashboard__goal-icon"
                            style={{ color }}
                            aria-hidden="true"
                          >
                            <EntityMark icon={goal.icon} size={16} />
                          </span>
                          <span className="finance-dashboard__list-label">
                            {goal.name}
                          </span>
                          <span className="finance-dashboard__list-amount">
                            {goalAmount != null ? (
                              <>
                                <span className="finance-dashboard__goal-saved">
                                  {formatMoney(savedCents)}
                                </span>
                                <span className="finance-dashboard__goal-sep">
                                  /
                                </span>
                                {formatMoney(goalAmount)}
                              </>
                            ) : (
                              "—"
                            )}
                          </span>
                        </div>
                        <div
                          className={[
                            "finance-dashboard__goal-progress",
                            goalAmount == null
                              ? "finance-dashboard__goal-progress--empty"
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={
                            goalAmount != null ? Math.round(ratio * 100) : 0
                          }
                          aria-label={
                            goalAmount != null
                              ? `${Math.round(ratio * 100)}% of ${goal.name} saved`
                              : `${goal.name} has no goal amount`
                          }
                        >
                          <span
                            className="finance-dashboard__goal-progress-fill"
                            style={{
                              width: `${Math.round(ratio * 100)}%`,
                              background: color,
                            }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </DashboardWidget>
          </div>
          </div>
        </div>

        {selectedTx ? (
          <div className="finance-dashboard__overlay" role="presentation">
            <button
              type="button"
              className="finance-dashboard__overlay-backdrop"
              aria-label="Close transaction details"
              onClick={() => setSelectedTx(null)}
            />
            <div
              className="finance-dashboard__overlay-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Transaction details"
              style={{ width: DASHBOARD_DETAIL_WIDTH_PX }}
            >
              <div className="finance-dashboard__overlay-chrome">
                <span className="finance-dashboard__overlay-chrome-label">
                  Review
                </span>
                <button
                  type="button"
                  className="finance-dashboard__overlay-close"
                  aria-label="Close"
                  onClick={() => setSelectedTx(null)}
                >
                  <XIcon size={16} />
                </button>
              </div>
              <div className="finance-dashboard__overlay-body">
                <FinanceTransactionDetailPanel
                  transaction={selectedTx}
                  organizations={organizations}
                  categoryOptions={categoryOptions}
                  orgOptions={orgOptions}
                  projectOptions={projectOptions}
                  goalOptions={goalOptions}
                  recurringOptions={recurringOptions}
                  moveAccountOptions={moveAccountOptions}
                  onPatchTransaction={handlePatchSelected}
                  onCreateOrganizationFromQuery={onCreateOrganizationFromQuery}
                  resolveCategory={resolveDropdownNone}
                  resolveOrg={resolveDropdownNone}
                  resolveProject={(value) =>
                    value === DROPDOWN_NO_PROJECT_VALUE ? null : value
                  }
                  resolveGoal={(value) =>
                    value === DROPDOWN_NO_GOAL_VALUE ? null : value
                  }
                  resolveRecurring={(value) =>
                    value === DROPDOWN_NO_RECURRING_VALUE ? null : value
                  }
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </EntityDetailLayout>
  );
}
