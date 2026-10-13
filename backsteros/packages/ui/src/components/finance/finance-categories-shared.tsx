"use client";

import type {
  BankAccount,
  FinancialCategory,
  FinancialCategoryKind,
  FinancialCategoryListing,
  FinancialGoal,
  FinancialRecurring,
  FinancialTransaction,
} from "@backsteros/contracts";
import { useMemo } from "react";

import { DEFAULT_ENTITY_ICON_COLOR } from "../../entity/entity-icon.js";
import { type FinanceListReorderRequest } from "../../finance/finance-list-reorder.js";
import { useFinanceMoneyColumnWidthFromValues } from "../../finance/finance-money-column-width.js";
import { parseMoneyInput } from "../../finance/money-input.js";
import { DefaultProjectIcon } from "../projects/default-project-icon.js";
import { DROPDOWN_NONE_VALUE } from "../dropdowns/dropdown-options.js";
import {
  getDisplayProjectIcon,
  getEntityIconColor,
  ProjectOcticon,
} from "../projects/project-octicon.js";
import { type SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { parseMonthKey } from "./finance-month-navigator.js";

export type FinanceCategoryOrganization = {
  id: string;
  name: string;
  key?: string | null;
  avatarSrc?: string | null;
};

export type FinanceCategoryTransactionPatch = {
  bankAccountId?: string;
  organizationId?: string | null;
  categoryId?: string | null;
  goalId?: string | null;
  recurringId?: string | null;
};

export type FinanceCategoriesChromeState = {
  hasSelection: boolean;
  detailCollapsed: boolean;
  /** True once the detail pane has been drag-resized off the 50/50 split. */
  detailResized: boolean;
  onToggleDetail: () => void;
  /** Currently selected category (drives the ⋯ actions menu). */
  category: FinancialCategory;
  currentListing: FinancialCategoryListing;
  currentKind: FinancialCategoryKind;
  currentParentId: string | null;
  /** false when the category has subcategories (can't be nested itself). */
  canChangeGroup: boolean;
  groupOptions: FinanceCategoryGroupOption[];
  onSetListing: (listing: FinancialCategoryListing) => void;
  onSetKind: (kind: FinancialCategoryKind) => void;
  onSetGroup: (parentId: string | null) => void;
  onDelete: () => void | Promise<void>;
};

export type FinanceCategoryCreateInput = {
  name: string;
  kind: FinancialCategoryKind;
  listing: FinancialCategoryListing;
  parentId?: string | null;
};

export type FinanceCategoryUpdateInput = {
  name?: string;
  kind?: FinancialCategoryKind;
  listing?: FinancialCategoryListing;
  icon?: string | null;
  budgetCents?: number | null;
  /** null moves the category back to the top level. */
  parentId?: string | null;
  sortOrder?: number;
};

export type FinanceCategoryGroupOption = {
  /** null = top level (no parent group). */
  id: string | null;
  name: string;
};

export type FinanceCategoryYearMetric = {
  year: number;
  /** Net spend for the year in cents (expenses minus income). */
  spentCents: number;
  /** spentCents divided by the number of elapsed months that year. */
  avgMonthlyCents: number;
};

export type FinanceCategoryMonthMetric = {
  /** YYYY-MM */
  month: string;
  /** Net spend for the month in cents (expenses minus income). */
  spentCents: number;
};

export type FinanceCategoryMetrics = {
  categoryId: string;
  months: FinanceCategoryMonthMetric[];
  years: FinanceCategoryYearMetric[];
  /** Raw transactions for this category, newest first. */
  transactions: FinancialTransaction[];
};

export type FinanceCategoriesViewProps = {
  categories: FinancialCategory[];
  /** Direct net spend for `spentMonth`, keyed by category id.
   * Positive = outflow, negative = inflow (credits reduce spend). */
  spentCentsByCategoryId?: Record<string, number>;
  /** YYYY-MM period used for the Spent column. */
  spentMonth?: string | null;
  /**
   * Newest selectable month (YYYY-MM). Defaults to the current local month.
   * Next-arrow is disabled when `spentMonth` equals this.
   */
  latestMonth?: string | null;
  pending?: boolean;
  error?: string | null;
  onSpentMonthChange?: (month: string) => void;
  /** Per-month / per-year spend for the selected category (detail panel). */
  categoryMetrics?: FinanceCategoryMetrics | null;
  categoryMetricsLoading?: boolean;
  /** Bank accounts (for the editable transaction rows in the detail panel). */
  accounts?: BankAccount[];
  accountAvatarSrcById?: Record<string, string>;
  organizations?: FinanceCategoryOrganization[];
  /** Goals available for bulk-linking from category transaction lists. */
  goals?: FinancialGoal[];
  /** Recurrings available for bulk-linking from category transaction lists. */
  recurrings?: FinancialRecurring[];
  /** Patch a transaction from the detail panel (account/org/category). */
  onPatchTransaction?: (
    id: string,
    patch: FinanceCategoryTransactionPatch,
  ) => void;
  /** Bulk-patch several transactions from the detail panel. */
  onBulkPatchTransactions?: (
    ids: string[],
    patch: FinanceCategoryTransactionPatch,
  ) => void;
  /** Bulk-delete selected transactions from the detail panel. */
  onBulkDeleteTransactions?: (ids: string[]) => void | Promise<void>;
  /**
   * Create an organization from a typed dropdown query (no match).
   * Caller should create the org and return its id so the transaction can be linked.
   */
  onCreateOrganizationFromQuery?: (
    query: string,
  ) => Promise<{ id: string }> | { id: string };
  /** Drives the breadcrumb trailing panel + list collapse control. */
  onChromeStateChange?: (state: FinanceCategoriesChromeState | null) => void;
  onCreate: (input: FinanceCategoryCreateInput) => void | Promise<void>;
  onUpdate: (
    id: string,
    patch: FinanceCategoryUpdateInput,
  ) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  /** Persist list order (and listing/parent when dropped across groups). */
  onReorder?: (request: FinanceListReorderRequest) => void;
};

function formatMonthShort(month: string | null | undefined): string | null {
  const date = parseMonthKey(month);
  if (!date) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short" }).format(date);
  } catch {
    return month ?? null;
  }
}

export function formatSpentInMonthLabel(month: string | null | undefined): string {
  const short = formatMonthShort(month);
  return short ? `spent in ${short}` : "spent";
}

export function formatSpentInMonthHeading(month: string | null | undefined): string {
  const short = formatMonthShort(month);
  return short ? `Spent in ${short}` : "Spent";
}

export const LISTING_OPTIONS: Array<{
  value: FinancialCategoryListing;
  label: string;
  detailLabel: string;
}> = [
  { value: "regular", label: "Regular", detailLabel: "Regular category" },
  { value: "excluded", label: "Excluded", detailLabel: "Excluded category" },
];

export const KIND_OPTIONS: Array<{
  value: FinancialCategoryKind;
  label: string;
}> = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

export function normalizeKind(
  value: string | null | undefined,
): FinancialCategoryKind {
  if (value === "income" || value === "transfer") return value;
  return "expense";
}

export type CategoryTreeNode = {
  category: FinancialCategory;
  children: FinancialCategory[];
};

export type ListingGroup = {
  id: FinancialCategoryListing;
  label: string;
  roots: CategoryTreeNode[];
  count: number;
};

export function normalizeListing(
  value: string | null | undefined,
): FinancialCategoryListing {
  return value === "excluded" ? "excluded" : "regular";
}

export const FINANCE_CAT_DETAIL_WIDTH_KEY =
  "backsteros-desktop.finance-categories-detail-width";

export function formatMoney(cents: number): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `€${value.toFixed(0)}`;
  }
}

function formatBudgetCell(cents: number | null | undefined): string {
  if (cents == null || cents <= 0) return "—";
  return formatMoney(cents);
}

function formatSpentCell(cents: number | null | undefined): string {
  if (cents == null || cents === 0) return "—";
  // Cashflow polarity: spend shows with −, income without.
  return formatMoney(-cents);
}

export function useBudgetColumnWidthPx(categories: FinancialCategory[]): number {
  const labels = useMemo(
    () => categories.map((category) => formatBudgetCell(category.budgetCents)),
    [categories],
  );
  return useFinanceMoneyColumnWidthFromValues(labels, ["Budget"]);
}

export function useSpentColumnWidthPx(
  spentCentsByCategoryId: Record<string, number>,
  rolledSpentByCategoryId: Record<string, number>,
): number {
  const labels = useMemo(() => {
    const values: string[] = [];
    for (const cents of Object.values(spentCentsByCategoryId)) {
      values.push(formatSpentCell(cents));
    }
    for (const cents of Object.values(rolledSpentByCategoryId)) {
      values.push(formatSpentCell(cents));
    }
    return values;
  }, [rolledSpentByCategoryId, spentCentsByCategoryId]);

  return useFinanceMoneyColumnWidthFromValues(labels, ["Spent"]);
}

function budgetProgressTone(
  spentCents: number,
  budgetCents: number,
): "green" | "orange" | "red" {
  const ratio = spentCents / budgetCents;
  if (ratio >= 1) return "red";
  if (ratio >= 0.8) return "orange";
  return "green";
}

export function CategoryAmountColumns({
  spentCents,
  budgetCents,
}: {
  spentCents: number;
  budgetCents: number | null | undefined;
}) {
  const hasBudget = budgetCents != null && budgetCents > 0;
  const spendForBudget = Math.max(0, spentCents);
  const ratio = hasBudget
    ? Math.min(1, Math.max(0, spendForBudget / budgetCents))
    : 0;
  const tone = hasBudget
    ? budgetProgressTone(spendForBudget, budgetCents)
    : null;
  const amountSign =
    spentCents > 0 ? "debit" : spentCents < 0 ? "credit" : "zero";

  return (
    <span className="finance-categories-view__amounts" aria-hidden="true">
      <span
        className={[
          "finance-categories-view__amount",
          "finance-categories-view__amount--spent",
          amountSign === "debit"
            ? "is-debit"
            : amountSign === "credit"
              ? "is-credit"
              : null,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {formatSpentCell(spentCents)}
      </span>
      <span
        className={[
          "finance-categories-view__progress",
          tone ? `finance-categories-view__progress--${tone}` : null,
          !hasBudget ? "is-empty" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        title={
          hasBudget
            ? `${Math.round((spendForBudget / budgetCents) * 100)}% of budget used`
            : "No budget"
        }
      >
        <span
          className="finance-categories-view__progress-fill"
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </span>
      <span className="finance-categories-view__amount finance-categories-view__amount--budget">
        {formatBudgetCell(budgetCents)}
      </span>
    </span>
  );
}

export function parseBudgetInput(raw: string): number | null {
  return parseMoneyInput(raw, { positive: true });
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        d="M8 3.5V12.5M3.5 8H12.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CategoryIcon({
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

export function categoryColor(icon: string | null | undefined): string {
  return getEntityIconColor(icon) ?? DEFAULT_ENTITY_ICON_COLOR;
}

/**
 * Build hierarchical category dropdown options: top-level categories with their
 * subcategories nested (indented) beneath them, each showing its icon + color.
 * Shared by the transactions page and the detail-panel transaction lists.
 */
export function buildCategoryDropdownOptions(
  categories: FinancialCategory[],
  options?: { noneValue?: string; noneLabel?: string },
): SearchableDropdownOption<string>[] {
  const noneValue = options?.noneValue ?? DROPDOWN_NONE_VALUE;
  const noneLabel = options?.noneLabel ?? "No category";

  const childrenByParent = new Map<string, FinancialCategory[]>();
  for (const category of categories) {
    if (category.parentId != null) {
      const bucket = childrenByParent.get(category.parentId) ?? [];
      bucket.push(category);
      childrenByParent.set(category.parentId, bucket);
    }
  }

  const result: SearchableDropdownOption<string>[] = [
    {
      value: noneValue,
      label: noneLabel,
      searchTerms: "none uncategorized no category",
    },
  ];
  const seen = new Set<string>();

  const pushOption = (
    category: FinancialCategory,
    depth: number,
    parentName?: string,
  ) => {
    if (seen.has(category.id)) return;
    seen.add(category.id);
    result.push({
      value: category.id,
      label: category.name,
      depth,
      searchTerms: parentName ? `${parentName} ${category.name}` : category.name,
      icon: <CategoryIcon icon={category.icon} size={14} />,
    });
  };

  for (const category of categories) {
    if (category.parentId != null) continue;
    pushOption(category, 0);
    for (const child of childrenByParent.get(category.id) ?? []) {
      pushOption(child, 1, category.name);
    }
  }
  // Any leftover categories (e.g. child whose parent is missing) at top level.
  for (const category of categories) {
    pushOption(category, 0);
  }

  return result;
}

export function CategoryColorSwatch({
  icon,
  size = 18,
}: {
  icon: string | null | undefined;
  size?: number;
}) {
  return (
    <span
      className="finance-categories-view__color-swatch"
      style={{
        width: size,
        height: size,
        background: categoryColor(icon),
      }}
      aria-hidden="true"
    />
  );
}

export function buildListingGroups(categories: FinancialCategory[]): ListingGroup[] {
  const byId = new Map(categories.map((entry) => [entry.id, entry]));
  const byParent = new Map<string, FinancialCategory[]>();
  const roots: FinancialCategory[] = [];

  for (const category of categories) {
    if (category.parentId && byId.has(category.parentId)) {
      const list = byParent.get(category.parentId) ?? [];
      list.push(category);
      byParent.set(category.parentId, list);
    } else {
      roots.push(category);
    }
  }

  const sortCats = (rows: FinancialCategory[]) =>
    [...rows].sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );

  const makeGroup = (
    id: FinancialCategoryListing,
    label: string,
  ): ListingGroup => {
    const groupRoots = sortCats(
      roots.filter((row) => normalizeListing(row.listing) === id),
    ).map((category) => ({
      category,
      children: sortCats(byParent.get(category.id) ?? []),
    }));
    const count = groupRoots.reduce(
      (sum, node) => sum + 1 + node.children.length,
      0,
    );
    return { id, label, roots: groupRoots, count };
  };

  return [
    makeGroup("regular", "Regular"),
    makeGroup("excluded", "Excluded"),
  ];
}
