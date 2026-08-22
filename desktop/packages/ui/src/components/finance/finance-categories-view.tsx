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
import type { ReactNode } from "react";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@primer/octicons-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

import {
  DEFAULT_ENTITY_ICON_COLOR,
  ENTITY_ICON_COLOR_PRESETS,
  parseEntityIcon,
} from "../../entity/entity-icon.js";
import {
  bulkDropdownShowIcon,
  FinanceBulkBar,
  relabelDropdownNoneOption,
  sharedNullableIdSelectionValue,
  sharedSelectionValue,
  withBulkDropdownFillState,
} from "./finance-bulk-bar.js";
import {
  FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME,
  FINANCE_FILTER_ALL_VALUE,
  FinanceTransactionsFilterBar,
} from "./finance-transactions-filter-bar.js";
import { filterFinanceTransactions } from "../../finance/filter-finance-transactions.js";
import {
  applyShiftRangeSelection,
  useKeyHeld,
} from "../../list-nav/shift-range-selection.js";
import {
  applyOptimisticCategoryReorder,
  financeCategoryGroupAppendOrderKey,
  financeCategoryGroupKey,
  financeCategoryListingGroupKey,
  financeCategoryOrderKey,
  financeCategoryParentGroupKey,
  type FinanceListReorderRequest,
} from "../../finance/finance-list-reorder.js";
import { useFinanceMoneyColumnWidthFromValues } from "../../finance/finance-money-column-width.js";
import { isDirectRoleButtonActivationKey } from "../../shortcuts/shortcut-guards.js";
import {
  keyboardNavItemProps,
  keyboardNavListItemClass,
} from "../../list-nav/keyboard-nav-item.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../../list-nav/list-keyboard-nav-zone.js";
import type { ListKeyboardNavZone } from "../../list-nav/list-keyboard-nav-zone.js";
import { LIST_KEYBOARD_NAV_ZONE_CONTENT } from "../../list-nav/list-keyboard-nav-zone.js";
import {
  ENTITY_TITLE_INPUT_ATTRIBUTE,
  useListClearSelectionShortcut,
  useListDismissDetailShortcut,
} from "../../list-nav/use-list-clear-selection-shortcut.js";
import { useListSelectAllShortcut } from "../../list-nav/use-list-select-all-shortcut.js";
import { useListToggleHighlightedSelectionShortcut } from "../../list-nav/use-list-toggle-highlighted-selection-shortcut.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "../list-nav/list-keyboard-navigation-provider.js";
import {
  focusAndSelectTitleInput,
  useTitleRenameShortcut,
} from "../../shortcuts/title-rename-shortcut.js";
import {
  formatMoneyInput,
  moneyCentsToInput,
  moneyInputContentWidth,
  parseMoneyInput,
} from "../../finance/money-input.js";
import { DefaultProjectIcon } from "../projects/default-project-icon.js";
import {
  DROPDOWN_NONE_VALUE,
  DROPDOWN_NO_GOAL_VALUE,
  DROPDOWN_NO_RECURRING_VALUE,
  buildOrganizationDropdownOptions,
  resolveDropdownNone,
} from "../dropdowns/dropdown-options.js";
import { useEntityHeaderActionsContext } from "../entity-actions/entity-header-actions-context.js";
import { EntityDetailLayout } from "../entity/entity-detail-layout.js";
import { EntityIconPicker } from "../entity/entity-icon-picker.js";
import { EntityListAvatar } from "../entity/entity-list-avatar.js";
import { FinanceDetailSectionTitle } from "./finance-detail-section-title.js";
import { FinanceGoalBadgeIcon } from "./finance-goal-badge-icon.js";
import { FinanceRecurringBadgeIcon } from "./finance-recurring-badge-icon.js";
import { PolishedCheckbox } from "../shared/polished-checkbox.js";
import {
  getDisplayProjectIcon,
  getEntityIconColor,
  ProjectOcticon,
} from "../projects/project-octicon.js";
import {
  SearchableDropdown,
  type SearchableDropdownOption,
} from "../dropdowns/searchable-dropdown.js";
import { getCreateEntityFromQueryLabel } from "../../dropdowns/searchable-dropdown-create-from-query.js";
import {
  txCategoryColumnCssVars,
  useTxCategoryColumnWidthPx,
} from "../../finance/finance-tx-category-column-width.js";
import { getTaskStatusHeaderGradientStyle } from "../../tasks/task-status-header-gradient.js";
import { useFinancePanelResize } from "../../finance/use-finance-panel-resize.js";
import {
  useGroupedListPointerReorder,
  type GroupedListPointerItemBind,
} from "../../list-nav/use-grouped-list-pointer-reorder.js";
import { useProgressiveReveal } from "../../shared/use-progressive-reveal.js";
import { ProjectTypeGroupSection } from "../projects/project-type-group-section.js";
import { StatusGroupSection } from "../list-nav/status-group-section.js";
import { CategorySpendChart } from "./category-spend-chart.js";
import {
  FinanceMonthNavigator,
  formatMonthLong,
  localMonthKey,
  parseMonthKey,
} from "./finance-month-navigator.js";
import {
  FinanceOverviewPie,
  type FinanceOverviewPieSlice,
} from "./finance-overview-pie.js";

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

function formatSpentInMonthLabel(month: string | null | undefined): string {
  const short = formatMonthShort(month);
  return short ? `spent in ${short}` : "spent";
}

function formatSpentInMonthHeading(month: string | null | undefined): string {
  const short = formatMonthShort(month);
  return short ? `Spent in ${short}` : "Spent";
}

type CategoryActionsSubmenu = "type" | "kind" | "group";

const CATEGORY_ACTIONS_MENU_GAP = 6;
const CATEGORY_ACTIONS_VIEWPORT_PADDING = 8;
const CATEGORY_ACTIONS_MIN_WIDTH = 208;

/**
 * ⋯ overflow menu for the selected category chrome: a compact two-level
 * dropdown (drill-down, not a modal) for changing type / kind / group, plus delete.
 */
export function CategoryActionsMenu({
  category,
  currentListing,
  currentKind,
  currentParentId,
  canChangeGroup,
  groupOptions,
  onSetListing,
  onSetKind,
  onSetGroup,
  onDelete,
  disabled = false,
}: {
  category: FinancialCategory;
  currentListing: FinancialCategoryListing;
  currentKind: FinancialCategoryKind;
  currentParentId: string | null;
  canChangeGroup: boolean;
  groupOptions: FinanceCategoryGroupOption[];
  onSetListing: (listing: FinancialCategoryListing) => void;
  onSetKind: (kind: FinancialCategoryKind) => void;
  onSetGroup: (parentId: string | null) => void;
  onDelete: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const { openDeleteModal } = useEntityHeaderActionsContext();
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<CategoryActionsSubmenu | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    position: "fixed",
    visibility: "hidden",
  });

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const panelHeight = panelRef.current?.offsetHeight ?? 48;
    const spaceBelow =
      window.innerHeight -
      rect.bottom -
      CATEGORY_ACTIONS_MENU_GAP -
      CATEGORY_ACTIONS_VIEWPORT_PADDING;
    const openUpward =
      spaceBelow < panelHeight &&
      rect.top > panelHeight + CATEGORY_ACTIONS_MENU_GAP;
    const top = openUpward
      ? Math.max(
          CATEGORY_ACTIONS_VIEWPORT_PADDING,
          rect.top - panelHeight - CATEGORY_ACTIONS_MENU_GAP,
        )
      : rect.bottom + CATEGORY_ACTIONS_MENU_GAP;
    setPanelStyle({
      position: "fixed",
      top: `${top}px`,
      right: `${Math.max(
        CATEGORY_ACTIONS_VIEWPORT_PADDING,
        window.innerWidth - rect.right,
      )}px`,
      left: "auto",
      width: "max-content",
      minWidth: `${CATEGORY_ACTIONS_MIN_WIDTH}px`,
      maxWidth: `calc(100vw - ${CATEGORY_ACTIONS_VIEWPORT_PADDING * 2}px)`,
      visibility: "visible",
      zIndex: 1000,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    return () => window.cancelAnimationFrame(frame);
  }, [open, submenu, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function reposition() {
      updatePosition();
    }
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!(event.target instanceof Node)) return;
      if (triggerRef.current?.contains(event.target)) return;
      if (panelRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setSubmenu((current) => {
        if (current) return null;
        setOpen(false);
        return null;
      });
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setSubmenu(null);
  }, [open]);

  const closeMenu = () => setOpen(false);

  let panelBody: ReactNode;
  if (submenu === "type") {
    panelBody = (
      <>
        <button
          type="button"
          className="finance-categories-menu__back"
          onClick={() => setSubmenu(null)}
        >
          <ChevronLeftIcon size={14} />
          <span>Spending category type</span>
        </button>
        <div className="finance-categories-menu__section">
          {LISTING_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={currentListing === option.value}
              className="finance-categories-menu__item finance-categories-menu__item--check"
              onClick={() => {
                if (currentListing !== option.value) onSetListing(option.value);
                closeMenu();
              }}
            >
              <span className="finance-categories-menu__check" aria-hidden="true">
                {currentListing === option.value ? <CheckIcon size={14} /> : null}
              </span>
              <span className="finance-categories-menu__label">
                {option.detailLabel}
              </span>
            </button>
          ))}
        </div>
      </>
    );
  } else if (submenu === "kind") {
    panelBody = (
      <>
        <button
          type="button"
          className="finance-categories-menu__back"
          onClick={() => setSubmenu(null)}
        >
          <ChevronLeftIcon size={14} />
          <span>Category kind</span>
        </button>
        <div className="finance-categories-menu__section">
          {KIND_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={currentKind === option.value}
              className="finance-categories-menu__item finance-categories-menu__item--check"
              onClick={() => {
                if (currentKind !== option.value) onSetKind(option.value);
                closeMenu();
              }}
            >
              <span className="finance-categories-menu__check" aria-hidden="true">
                {currentKind === option.value ? <CheckIcon size={14} /> : null}
              </span>
              <span className="finance-categories-menu__label">
                {option.label}
              </span>
            </button>
          ))}
        </div>
      </>
    );
  } else if (submenu === "group") {
    panelBody = (
      <>
        <button
          type="button"
          className="finance-categories-menu__back"
          onClick={() => setSubmenu(null)}
        >
          <ChevronLeftIcon size={14} />
          <span>Spending category group</span>
        </button>
        <div className="finance-categories-menu__section finance-categories-menu__section--scroll">
          {groupOptions.map((option) => {
            const active = (option.id ?? null) === (currentParentId ?? null);
            return (
              <button
                key={option.id ?? "__top__"}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className="finance-categories-menu__item finance-categories-menu__item--check"
                onClick={() => {
                  if (!active) onSetGroup(option.id);
                  closeMenu();
                }}
              >
                <span
                  className="finance-categories-menu__check"
                  aria-hidden="true"
                >
                  {active ? <CheckIcon size={14} /> : null}
                </span>
                <span className="finance-categories-menu__label">
                  {option.name}
                </span>
              </button>
            );
          })}
        </div>
      </>
    );
  } else {
    panelBody = (
      <div className="finance-categories-menu__section">
        <button
          type="button"
          role="menuitem"
          className="finance-categories-menu__item finance-categories-menu__item--parent"
          onClick={() => setSubmenu("type")}
        >
          <span className="finance-categories-menu__label">
            Spending category type
          </span>
          <ChevronRightIcon size={14} />
        </button>
        <button
          type="button"
          role="menuitem"
          className="finance-categories-menu__item finance-categories-menu__item--parent"
          onClick={() => setSubmenu("kind")}
        >
          <span className="finance-categories-menu__label">Category kind</span>
          <ChevronRightIcon size={14} />
        </button>
        {canChangeGroup ? (
          <button
            type="button"
            role="menuitem"
            className="finance-categories-menu__item finance-categories-menu__item--parent"
            onClick={() => setSubmenu("group")}
          >
            <span className="finance-categories-menu__label">
              Spending category group
            </span>
            <ChevronRightIcon size={14} />
          </button>
        ) : null}
        <div className="finance-categories-menu__divider" role="separator" />
        <button
          type="button"
          role="menuitem"
          className="finance-categories-menu__item finance-categories-menu__item--danger"
          onClick={() => {
            closeMenu();
            openDeleteModal({
              entityLabel: category.name,
              confirmLabel: "Delete category",
              onDelete: async () => {
                try {
                  await Promise.resolve(onDelete());
                  return { ok: true };
                } catch (reason) {
                  return {
                    ok: false,
                    error:
                      reason instanceof Error
                        ? reason.message
                        : "Could not delete category.",
                  };
                }
              },
            });
          }}
        >
          <span className="finance-categories-menu__label">Delete category</span>
        </button>
      </div>
    );
  }

  const panel = open ? (
    <div
      ref={panelRef}
      id={menuId}
      className="entity-header-action-menu finance-categories-menu"
      style={panelStyle}
      role="menu"
      aria-label={`Actions for ${category.name}`}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {panelBody}
    </div>
  ) : null;

  return (
    <div className="entity-header-actions-trigger-wrap">
      <button
        ref={triggerRef}
        type="button"
        className="entity-header-actions-trigger"
        aria-label="Category actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          setOpen((value) => !value);
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="3" cy="8" r="1.25" />
          <circle cx="8" cy="8" r="1.25" />
          <circle cx="13" cy="8" r="1.25" />
        </svg>
      </button>
      {panel ? createPortal(panel, document.body) : null}
    </div>
  );
}

type OverviewSlice = {
  id: string;
  name: string;
  color: string;
  spentCents: number;
};

function BudgetOverviewCard({
  spentCents,
  budgetCents,
  spentMonth,
  slices,
}: {
  spentCents: number;
  budgetCents: number;
  spentMonth: string | null;
  slices: OverviewSlice[];
}) {
  const pieSlices: FinanceOverviewPieSlice[] = slices
    .filter((slice) => slice.spentCents > 0)
    .map((slice) => ({
      id: slice.id,
      label: slice.name,
      value: slice.spentCents,
      color: slice.color,
    }));

  return (
    <div
      className="finance-categories-view__overview"
      aria-label="Budget overview"
    >
      <div className="finance-categories-view__overview-stat finance-categories-view__overview-stat--spent">
        <span
          className={[
            "finance-categories-view__overview-value",
            spentCents > 0
              ? "is-debit"
              : spentCents < 0
                ? "is-credit"
                : null,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {formatMoney(spentCents === 0 ? 0 : -spentCents)}
        </span>
        <span className="finance-categories-view__overview-label">
          {formatSpentInMonthLabel(spentMonth)}
        </span>
      </div>
      <FinanceOverviewPie slices={pieSlices} />
      <div className="finance-categories-view__overview-stat finance-categories-view__overview-stat--budget">
        <span className="finance-categories-view__overview-value">
          {formatMoney(budgetCents)}
        </span>
        <span className="finance-categories-view__overview-label">
          total budget
        </span>
      </div>
    </div>
  );
}

const LISTING_OPTIONS: Array<{
  value: FinancialCategoryListing;
  label: string;
  detailLabel: string;
}> = [
  { value: "regular", label: "Regular", detailLabel: "Regular category" },
  { value: "excluded", label: "Excluded", detailLabel: "Excluded category" },
];

const KIND_OPTIONS: Array<{
  value: FinancialCategoryKind;
  label: string;
}> = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

function normalizeKind(
  value: string | null | undefined,
): FinancialCategoryKind {
  if (value === "income" || value === "transfer") return value;
  return "expense";
}

type CategoryTreeNode = {
  category: FinancialCategory;
  children: FinancialCategory[];
};

type ListingGroup = {
  id: FinancialCategoryListing;
  label: string;
  roots: CategoryTreeNode[];
  count: number;
};

function normalizeListing(
  value: string | null | undefined,
): FinancialCategoryListing {
  return value === "excluded" ? "excluded" : "regular";
}

const FINANCE_CAT_DETAIL_WIDTH_KEY =
  "backsteros-desktop.finance-categories-detail-width";

function formatMoney(cents: number): string {
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

function useBudgetColumnWidthPx(categories: FinancialCategory[]): number {
  const labels = useMemo(
    () => categories.map((category) => formatBudgetCell(category.budgetCents)),
    [categories],
  );
  return useFinanceMoneyColumnWidthFromValues(labels, ["Budget"]);
}

function useSpentColumnWidthPx(
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

function CategoryAmountColumns({
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

function parseBudgetInput(raw: string): number | null {
  return parseMoneyInput(raw, { positive: true });
}

function PlusIcon() {
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

function CategoryIcon({
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

function categoryColor(icon: string | null | undefined): string {
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

function CategoryColorSwatch({
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

function buildListingGroups(categories: FinancialCategory[]): ListingGroup[] {
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

type CreateModalState =
  | {
      listing: FinancialCategoryListing;
      parentId: string | null;
      parentName?: string;
    }
  | null;

function CreateCategoryModal({
  state,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  state: CreateModalState;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (name: string) => void | Promise<void>;
}) {
  const titleId = useId();
  const [name, setName] = useState("");

  useEffect(() => {
    if (!state) return;
    setName("");
  }, [state]);

  useEffect(() => {
    if (!state) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose, state]);

  if (!state) return null;

  const isSub = Boolean(state.parentId);
  const title = isSub
    ? `Add subcategory${state.parentName ? ` under ${state.parentName}` : ""}`
    : `Add ${state.listing === "excluded" ? "excluded" : "regular"} category`;

  return createPortal(
    <div
      className="entity-delete-modal-root"
      data-blocking-modal=""
      data-finance-category-create-modal=""
    >
      <button
        type="button"
        aria-label="Cancel"
        className="entity-delete-modal-backdrop"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="entity-delete-modal finance-bank-account-modal"
      >
        <h2 id={titleId} className="sr-only">
          {title}
        </h2>
        <form
          className="finance-bank-account-modal__form"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed || pending) return;
            void onSubmit(trimmed);
          }}
        >
          <div className="finance-bank-account-modal__body">
            <p className="finance-categories-view__create-title">{title}</p>
            <label className="finance-bank-account-modal__field">
              <span className="finance-bank-account-modal__label">Name</span>
              <input
                className="finance-bank-account-modal__input"
                value={name}
                autoFocus
                disabled={pending}
                placeholder={isSub ? "Coffee" : "Groceries"}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            {error ? (
              <p className="entity-delete-modal-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <div className="finance-bank-account-modal__actions">
            <span />
            <div className="finance-bank-account-modal__actions-end">
              <button
                type="button"
                disabled={pending}
                onClick={onClose}
                className="entity-delete-modal-cancel"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending || !name.trim()}
                className="finance-bank-account-modal__save"
              >
                {pending ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function CategoryDetailPanel({
  category,
  hasChildren,
  spentCents,
  spentMonth,
  metrics,
  metricsLoading,
  categories,
  accounts,
  accountAvatarSrcById,
  organizations,
  goals,
  recurrings,
  onPatchTransaction,
  onBulkPatchTransactions,
  onBulkDeleteTransactions,
  onCreateOrganizationFromQuery,
  pending,
  error,
  onUpdate,
  onDelete,
}: {
  category: FinancialCategory | null;
  hasChildren: boolean;
  spentCents: number;
  spentMonth: string | null;
  metrics: FinanceCategoryMetrics | null;
  metricsLoading: boolean;
  categories: FinancialCategory[];
  accounts: BankAccount[];
  accountAvatarSrcById: Record<string, string>;
  organizations: FinanceCategoryOrganization[];
  goals: FinancialGoal[];
  recurrings: FinancialRecurring[];
  onPatchTransaction?: (
    id: string,
    patch: FinanceCategoryTransactionPatch,
  ) => void;
  onBulkPatchTransactions?: (
    ids: string[],
    patch: FinanceCategoryTransactionPatch,
  ) => void;
  onBulkDeleteTransactions?: (ids: string[]) => void | Promise<void>;
  onCreateOrganizationFromQuery?: (
    query: string,
  ) => Promise<{ id: string }> | { id: string };
  pending: boolean;
  error: string | null;
  onUpdate: (patch: FinanceCategoryUpdateInput) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [budget, setBudget] = useState(moneyCentsToInput(category?.budgetCents));
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useTitleRenameShortcut(
    useCallback(() => {
      focusAndSelectTitleInput(titleInputRef.current);
    }, []),
    { enabled: Boolean(category) },
  );

  useEffect(() => {
    if (!category) return;
    setName(category.name);
    setBudget(moneyCentsToInput(category.budgetCents));
    setLocalError(null);
    setIconPickerOpen(false);
  }, [category]);

  const childCategories = useMemo(
    () =>
      category
        ? categories.filter((row) => row.parentId === category.id)
        : [],
    [categories, category],
  );

  const chartBudgetCents = useMemo(() => {
    if (!category) return null;
    const own =
      category.budgetCents != null && category.budgetCents > 0
        ? category.budgetCents
        : 0;
    if (own > 0) return own;
    // Parent with no budget: use the sum of subcategory budgets as the
    // reference line so the chart still has a gray budget marker.
    if (childCategories.length === 0) return null;
    const childSum = childCategories.reduce((sum, child) => {
      const childBudget =
        child.budgetCents != null && child.budgetCents > 0
          ? child.budgetCents
          : 0;
      return sum + childBudget;
    }, 0);
    return childSum > 0 ? childSum : null;
  }, [category, childCategories]);

  const draftBudgetCents = parseBudgetInput(budget);
  const leftCents =
    draftBudgetCents == null
      ? null
      : Math.max(0, draftBudgetCents - Math.max(0, spentCents));

  if (!category) {
    return (
      <aside className="finance-categories-view__detail" aria-label="Category details">
        <div className="finance-categories-view__detail-empty">
          <p>Select a category to edit its details.</p>
        </div>
      </aside>
    );
  }

  const colorOnly = hasChildren && !category.parentId;
  const displayError = localError ?? error;
  const accent = categoryColor(category.icon);

  async function commitName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === category!.name) {
      setName(category!.name);
      return;
    }
    setLocalError(null);
    try {
      await onUpdate({ name: trimmed });
    } catch (reason) {
      setName(category!.name);
      setLocalError(
        reason instanceof Error ? reason.message : "Could not rename category.",
      );
    }
  }

  async function commitBudget() {
    const next = parseBudgetInput(budget);
    const current =
      category!.budgetCents == null || category!.budgetCents <= 0
        ? null
        : category!.budgetCents;
    if (next === current) {
      setBudget(moneyCentsToInput(current));
      return;
    }
    setLocalError(null);
    try {
      await onUpdate({ budgetCents: next });
      setBudget(moneyCentsToInput(next));
    } catch (reason) {
      setBudget(moneyCentsToInput(category!.budgetCents));
      setLocalError(
        reason instanceof Error ? reason.message : "Could not update budget.",
      );
    }
  }

  return (
    <aside className="finance-categories-view__detail" aria-label="Category details">
      <div className="finance-categories-view__detail-hero">
        <div className="finance-categories-view__detail-hero-main">
          <button
            type="button"
            className="finance-categories-view__detail-marks"
            aria-label={
              colorOnly
                ? `Change color for ${category.name}`
                : `Change icon for ${category.name}`
            }
            disabled={pending}
            onClick={() => setIconPickerOpen(true)}
          >
            <span
              className="finance-categories-view__detail-color-dot"
              style={{ background: accent }}
              aria-hidden="true"
            />
            <span
              className="finance-categories-view__detail-mark-icon"
              aria-hidden="true"
            >
              <CategoryIcon icon={category.icon} size={16} />
            </span>
          </button>
          <div className="finance-categories-view__detail-heading">
            <input
              ref={titleInputRef}
              className="finance-categories-view__detail-title-input"
              value={name}
              disabled={pending}
              aria-label="Category name"
              {...{ [ENTITY_TITLE_INPUT_ATTRIBUTE]: "" }}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => {
                void commitName();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  event.nativeEvent.stopImmediatePropagation();
                  setName(category.name);
                  event.currentTarget.blur();
                  return;
                }
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
            <label className="finance-categories-view__detail-budget-wrap">
              <span
                className="finance-categories-view__detail-budget-prefix"
                aria-hidden="true"
              >
                €
              </span>
              <input
                className="finance-categories-view__detail-budget-input"
                inputMode="decimal"
                aria-label="Monthly budget"
                placeholder="0"
                value={budget}
                disabled={pending}
                {...moneyInputContentWidth(budget)}
                onChange={(event) =>
                  setBudget(formatMoneyInput(event.target.value))
                }
                onBlur={() => {
                  void commitBudget();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
              />
            </label>
          </div>
        </div>

        <div className="finance-categories-view__detail-hero-spend">
          <span className="finance-categories-view__detail-spend-label">
            {formatSpentInMonthHeading(spentMonth)}
          </span>
          <span
            className={[
              "finance-categories-view__detail-spend-amount",
              spentCents > 0
                ? "is-debit"
                : spentCents < 0
                  ? "is-credit"
                  : null,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {formatMoney(spentCents === 0 ? 0 : -spentCents)}
          </span>
          <span className="finance-categories-view__detail-spend-left">
            {leftCents != null
              ? `${formatMoney(leftCents)} left`
              : "No budget set"}
          </span>
        </div>
      </div>

      <EntityIconPicker
        open={iconPickerOpen}
        value={
          colorOnly
            ? (() => {
                const parsed = parseEntityIcon(category.icon);
                const color =
                  parsed.kind === "default" || parsed.kind === "icon"
                    ? parsed.color
                    : undefined;
                return color
                  ? JSON.stringify({ t: "d", c: color })
                  : null;
              })()
            : category.icon
        }
        dialogTitle={colorOnly ? "Choose category color" : "Choose category icon"}
        colorOnly={colorOnly}
        onClose={() => setIconPickerOpen(false)}
        onSelect={(icon) => {
          setIconPickerOpen(false);
          setLocalError(null);
          void Promise.resolve(onUpdate({ icon })).catch((reason) => {
            setLocalError(
              reason instanceof Error
                ? reason.message
                : colorOnly
                  ? "Could not update color."
                  : "Could not update icon.",
            );
          });
        }}
        defaultOption={
          colorOnly
            ? undefined
            : {
                label: "Default category icon",
                preview: <DefaultProjectIcon size={16} />,
              }
        }
      />

      <CategorySpendChart
        categoryId={category.id}
        categoryName={category.name}
        accent={accent}
        months={metrics?.months ?? []}
        transactions={metrics?.transactions ?? []}
        childCategories={childCategories}
        budgetCents={chartBudgetCents}
        loading={metricsLoading}
      />

      <CategoryKeyMetrics
        years={metrics?.years ?? []}
        monthlyBudgetCents={chartBudgetCents}
        loading={metricsLoading}
      />

      <FinanceTransactionsPanelList
        transactions={metrics?.transactions ?? []}
        loading={metricsLoading}
        categories={categories}
        accounts={accounts}
        accountAvatarSrcById={accountAvatarSrcById}
        organizations={organizations}
        goals={goals}
        recurrings={recurrings}
        emptyLabel="No transactions in this category."
        listKeyboardNavZone={LIST_KEYBOARD_NAV_ZONE_CONTENT}
        onPatchTransaction={onPatchTransaction}
        onBulkPatchTransactions={onBulkPatchTransactions}
        onBulkDeleteTransactions={onBulkDeleteTransactions}
        onCreateOrganizationFromQuery={onCreateOrganizationFromQuery}
      />

      {displayError ? (
        <p className="entity-delete-modal-error" role="alert">
          {displayError}
        </p>
      ) : null}
    </aside>
  );
}

function yearBudgetCents(
  monthlyBudgetCents: number | null | undefined,
  year: number,
  asOf: Date = new Date(),
): number | null {
  if (monthlyBudgetCents == null || monthlyBudgetCents <= 0) return null;
  const currentYear = asOf.getFullYear();
  const months =
    year < currentYear
      ? 12
      : year === currentYear
        ? asOf.getMonth() + 1
        : 12;
  return monthlyBudgetCents * months;
}

function CategoryKeyMetrics({
  years,
  monthlyBudgetCents = null,
  loading,
}: {
  years: FinanceCategoryYearMetric[];
  /** Monthly budget in cents; shown year-over-year × months in each year. */
  monthlyBudgetCents?: number | null;
  loading: boolean;
}) {
  const rows = useMemo(() => {
    const asOf = new Date();
    const byYear = new Map(
      years.map((entry) => [entry.year, entry] as const),
    );
    if (
      byYear.size === 0 &&
      monthlyBudgetCents != null &&
      monthlyBudgetCents > 0
    ) {
      byYear.set(asOf.getFullYear(), {
        year: asOf.getFullYear(),
        spentCents: 0,
        avgMonthlyCents: 0,
      });
    }
    return [...byYear.values()]
      .sort((a, b) => b.year - a.year)
      .map((entry) => ({
        ...entry,
        budgetCents: yearBudgetCents(monthlyBudgetCents, entry.year, asOf),
      }));
  }, [monthlyBudgetCents, years]);

  return (
    <section className="finance-categories-view__metrics">
      <FinanceDetailSectionTitle>Key metrics</FinanceDetailSectionTitle>
      <div className="finance-categories-view__metrics-head">
        <span className="finance-categories-view__metrics-col finance-categories-view__metrics-col--start">
          Year
        </span>
        <span className="finance-categories-view__metrics-col">Spent</span>
        <span className="finance-categories-view__metrics-col">Budget</span>
      </div>
      {rows.length ? (
        rows.map((entry) => (
          <div
            key={entry.year}
            className="finance-categories-view__metrics-row"
          >
            <span className="finance-categories-view__metrics-year">
              {entry.year}
            </span>
            <span
              className={[
                "finance-categories-view__metrics-value",
                entry.spentCents > 0
                  ? "is-debit"
                  : entry.spentCents < 0
                    ? "is-credit"
                    : null,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {formatMoney(entry.spentCents === 0 ? 0 : -entry.spentCents)}
            </span>
            <span className="finance-categories-view__metrics-value">
              {entry.budgetCents != null ? formatMoney(entry.budgetCents) : "—"}
            </span>
          </div>
        ))
      ) : (
        <div className="finance-categories-view__metrics-empty">
          {loading ? "Loading metrics…" : "No spending recorded yet."}
        </div>
      )}
    </section>
  );
}

function formatTxAmount(cents: number, currency: string): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function txDayLabel(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
    }).format(date);
  } catch {
    return isoDate;
  }
}

function txDisplayLabel(tx: FinancialTransaction): string {
  return (
    tx.displayName?.trim() ||
    tx.payee?.trim() ||
    tx.memo?.trim() ||
    tx.counterparty?.trim() ||
    "Untitled transaction"
  );
}

function groupTransactionsByMonth(transactions: FinancialTransaction[]): Array<{
  key: string;
  label: string;
  items: FinancialTransaction[];
}> {
  const byMonth = new Map<string, FinancialTransaction[]>();
  for (const tx of transactions) {
    const key = /^\d{4}-\d{2}/.test(tx.bookedOn)
      ? tx.bookedOn.slice(0, 7)
      : "0000-00";
    const list = byMonth.get(key);
    if (list) list.push(tx);
    else byMonth.set(key, [tx]);
  }
  return [...byMonth.keys()]
    .sort((a, b) => (a < b ? 1 : -1))
    .map((key) => ({
      key,
      label: formatMonthLong(key),
      items: byMonth.get(key)!,
    }));
}

/**
 * Grouped, editable transaction list used inside finance detail side panels
 * (categories and accounts). Rows can be inline-edited (category / organization
 * / account) and multi-selected for bulk edits.
 */
export function FinanceTransactionsPanelList({
  transactions,
  loading,
  categories,
  accounts,
  accountAvatarSrcById,
  organizations,
  goals = [],
  recurrings = [],
  emptyLabel = "No transactions here yet.",
  sectionTitle = "Transactions",
  activeTransactionId = null,
  exitingTransactionIds = null,
  groupByMonth = true,
  showFilterBar = true,
  showRecurringColumn = true,
  listKeyboardNavZone = LIST_KEYBOARD_NAV_ZONE_MAIN,
  onOpenTransaction,
  onPatchTransaction,
  onBulkPatchTransactions,
  onBulkDeleteTransactions,
  onCreateOrganizationFromQuery,
}: {
  transactions: FinancialTransaction[];
  loading: boolean;
  categories: FinancialCategory[];
  accounts: BankAccount[];
  accountAvatarSrcById: Record<string, string>;
  organizations: FinanceCategoryOrganization[];
  goals?: FinancialGoal[];
  /** Recurrings available to link from transaction rows / bulk bar. */
  recurrings?: FinancialRecurring[];
  emptyLabel?: string;
  /**
   * Section heading above the list (inline rule, same as Key metrics / Summary).
   * Pass `null` when a parent already titles the list (e.g. dashboard widget).
   */
  sectionTitle?: string | null;
  /** Highlights the open detail/overlay transaction when set. */
  activeTransactionId?: string | null;
  /** Rows fading out before removal (e.g. dashboard review inbox). */
  exitingTransactionIds?: ReadonlySet<string> | null;
  /** When false, render a flat list without month group headers. */
  groupByMonth?: boolean;
  /** Search / category / org / amount filters above the list. */
  showFilterBar?: boolean;
  /**
   * When false, hide the Recurring dropdown column. Linked recurrings still
   * show as a badge in the org cell (matches main Finance → Transactions).
   */
  showRecurringColumn?: boolean;
  /**
   * Keyboard zone for nested transaction j/k. Detail panels use `content` so
   * the parent entity list can keep `main`.
   */
  listKeyboardNavZone?: ListKeyboardNavZone;
  /** Opens a single-transaction detail (e.g. dashboard overlay). */
  onOpenTransaction?: (tx: FinancialTransaction) => void;
  onPatchTransaction?: (
    id: string,
    patch: FinanceCategoryTransactionPatch,
  ) => void;
  onBulkPatchTransactions?: (
    ids: string[],
    patch: FinanceCategoryTransactionPatch,
  ) => void;
  onBulkDeleteTransactions?: (ids: string[]) => void | Promise<void>;
  onCreateOrganizationFromQuery?: (
    query: string,
  ) => Promise<{ id: string }> | { id: string };
}) {
  const [collapsedMonths, setCollapsedMonths] = useState<
    Record<string, boolean>
  >({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastClickedRef = useRef<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    listKeyboardNavZone,
  );
  const shiftHeld = useKeyHeld("Shift");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterAmountMinCents, setFilterAmountMinCents] = useState<
    number | null
  >(null);
  const [filterAmountMaxCents, setFilterAmountMaxCents] = useState<
    number | null
  >(null);
  const [filterCategoryIds, setFilterCategoryIds] = useState<string[]>([]);
  const [filterOrganizationId, setFilterOrganizationId] = useState<
    string | null
  >(null);
  const [filterGoalId, setFilterGoalId] = useState<string | null>(null);
  const [filterRecurringId, setFilterRecurringId] = useState<string | null>(
    null,
  );

  const preAmountFilteredTransactions = useMemo(
    () =>
      showFilterBar
        ? filterFinanceTransactions(transactions, {
            search: filterSearch,
            amountMinCents: null,
            amountMaxCents: null,
            categoryIds: filterCategoryIds,
            organizationId: filterOrganizationId,
            goalId: filterGoalId,
            recurringId: filterRecurringId,
          })
        : transactions,
    [
      filterCategoryIds,
      filterGoalId,
      filterOrganizationId,
      filterRecurringId,
      filterSearch,
      showFilterBar,
      transactions,
    ],
  );

  const amountCentsSamples = useMemo(
    () => preAmountFilteredTransactions.map((tx) => tx.amountCents),
    [preAmountFilteredTransactions],
  );

  const filteredTransactions = useMemo(
    () =>
      showFilterBar
        ? filterFinanceTransactions(transactions, {
            search: filterSearch,
            amountMinCents: filterAmountMinCents,
            amountMaxCents: filterAmountMaxCents,
            categoryIds: filterCategoryIds,
            organizationId: filterOrganizationId,
            goalId: filterGoalId,
            recurringId: filterRecurringId,
          })
        : transactions,
    [
      filterAmountMaxCents,
      filterAmountMinCents,
      filterCategoryIds,
      filterGoalId,
      filterOrganizationId,
      filterRecurringId,
      filterSearch,
      showFilterBar,
      transactions,
    ],
  );

  const filterCategoryOptions = useMemo(
    () => [
      {
        value: DROPDOWN_NONE_VALUE,
        label: "No category",
        searchTerms: "none uncategorized no category",
      },
      ...buildCategoryDropdownOptions(categories),
    ],
    [categories],
  );
  const filterOrganizationOptions = useMemo(
    () => [
      {
        value: FINANCE_FILTER_ALL_VALUE,
        label: "Organizations",
        searchTerms: "all organizations any",
      },
      {
        value: DROPDOWN_NONE_VALUE,
        label: "No organization",
        searchTerms: "none unassigned no organization",
      },
      ...buildOrganizationDropdownOptions(organizations).filter(
        (option) => option.value !== DROPDOWN_NONE_VALUE,
      ),
    ],
    [organizations],
  );
  const filterGoalOptions = useMemo(
    () => [
      {
        value: FINANCE_FILTER_ALL_VALUE,
        label: "Goals",
        searchTerms: "all goals any",
      },
      {
        value: DROPDOWN_NO_GOAL_VALUE,
        label: "No goal",
        searchTerms: "none unassigned no goal",
      },
      ...[...goals]
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        )
        .map((entry) => ({
          value: entry.id,
          label: entry.name,
          searchTerms: `${entry.name} ${entry.listing}`,
        })),
    ],
    [goals],
  );
  const filterRecurringOptions = useMemo(
    () => [
      {
        value: FINANCE_FILTER_ALL_VALUE,
        label: "Recurrings",
        searchTerms: "all recurrings any",
      },
      {
        value: DROPDOWN_NO_RECURRING_VALUE,
        label: "No recurring",
        searchTerms: "none unassigned no recurring",
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
        })),
    ],
    [recurrings],
  );

  const hasActiveFilters =
    filterSearch.trim().length > 0 ||
    filterAmountMinCents != null ||
    filterAmountMaxCents != null ||
    filterCategoryIds.length > 0 ||
    filterOrganizationId != null ||
    filterGoalId != null ||
    filterRecurringId != null;

  // Only materially-different sets reset selection (not same-id optimistic
  // re-renders or scroll-driven reveals).
  const listSignature = `${filteredTransactions.length}:${filteredTransactions[0]?.id ?? ""}|${filterSearch}|${filterAmountMinCents ?? ""}|${filterAmountMaxCents ?? ""}|${filterCategoryIds.join(",")}|${filterOrganizationId ?? ""}|${filterGoalId ?? ""}|${filterRecurringId ?? ""}`;

  const { visibleCount, hasMore, sentinelRef } = useProgressiveReveal(
    filteredTransactions.length,
    {
      resetKey: listSignature,
      initial: groupByMonth ? 60 : Math.max(filteredTransactions.length, 1),
    },
  );

  const months = useMemo(() => {
    const slice = filteredTransactions.slice(0, visibleCount);
    if (!groupByMonth) {
      return [{ key: "all", label: "", items: slice }];
    }
    return groupTransactionsByMonth(slice);
  }, [filteredTransactions, groupByMonth, visibleCount]);
  /** Screen order for shift-click ranges (month groups → rows). */
  const visualOrderedIds = useMemo(
    () => months.flatMap((month) => month.items.map((tx) => tx.id)),
    [months],
  );

  const keyboardItemIds = useMemo(() => {
    const ids: string[] = [];
    for (const month of months) {
      if (groupByMonth && collapsedMonths[month.key]) continue;
      for (const tx of month.items) ids.push(tx.id);
    }
    return ids;
  }, [collapsedMonths, groupByMonth, months]);

  const openTransactionById = useCallback(
    (txId: string) => {
      if (!onOpenTransaction) return;
      const tx = filteredTransactions.find((entry) => entry.id === txId);
      if (tx) onOpenTransaction(tx);
    },
    [filteredTransactions, onOpenTransaction],
  );

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds: keyboardItemIds,
    selectedId: activeTransactionId,
    onNavigate: openTransactionById,
    zone: listKeyboardNavZone,
    enabled: keyboardItemIds.length > 0,
  });

  useEffect(() => {
    // Keep multi-select across bulk property edits. Drop only ids that are
    // no longer in the filtered list (entity switch, filters, delete refresh).
    const alive = new Set(filteredTransactions.map((tx) => tx.id));
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (alive.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
    if (lastClickedRef.current && !alive.has(lastClickedRef.current)) {
      lastClickedRef.current = null;
    }
  }, [filteredTransactions, listSignature]);

  const editable = Boolean(onPatchTransaction);
  const bulkEnabled = Boolean(onBulkPatchTransactions);
  const bulkBarEnabled = bulkEnabled || Boolean(onBulkDeleteTransactions);
  const showSelectAll =
    selectedIds.size > 0 && selectedIds.size < visualOrderedIds.length;
  const createOrganizationFromQueryLabel = onCreateOrganizationFromQuery
    ? (query: string) => getCreateEntityFromQueryLabel("organization", query)
    : undefined;

  const selectAllVisibleTransactions = useCallback(() => {
    setSelectedIds(new Set(visualOrderedIds));
    lastClickedRef.current =
      visualOrderedIds[visualOrderedIds.length - 1] ?? null;
  }, [visualOrderedIds]);

  useListSelectAllShortcut({
    enabled: bulkBarEnabled && visualOrderedIds.length > 0,
    onSelectAll: selectAllVisibleTransactions,
  });

  const createOrganizationForTransaction = (
    txId: string,
    query: string,
  ) => {
    if (!onCreateOrganizationFromQuery || !onPatchTransaction) return;
    void Promise.resolve(onCreateOrganizationFromQuery(query)).then(
      (created) => {
        if (!created?.id) return;
        onPatchTransaction(txId, { organizationId: created.id });
      },
    );
  };

  const createOrganizationForBulk = (query: string) => {
    if (!onCreateOrganizationFromQuery) return;
    void Promise.resolve(onCreateOrganizationFromQuery(query)).then(
      (created) => {
        if (!created?.id) return;
        setBulkDraft((current) => ({
          ...current,
          organizationId: created.id,
        }));
      },
    );
  };

  const toggleSelected = useCallback(
    (id: string, shiftKey: boolean) => {
      const useShift = shiftKey || shiftHeld.currentlyHeld();
      setSelectedIds((prev) => {
        const result = applyShiftRangeSelection(prev, id, {
          shiftKey: useShift,
          orderedIds: visualOrderedIds,
          lastClickedId: lastClickedRef.current,
        });
        lastClickedRef.current = result.lastClickedId;
        return result.next;
      });
    },
    [shiftHeld, visualOrderedIds],
  );

  const toggleHighlightedSelection = useCallback(
    (id: string) => {
      toggleSelected(id, false);
    },
    [toggleSelected],
  );

  useListToggleHighlightedSelectionShortcut({
    enabled: bulkEnabled && keyboardItemIds.length > 0,
    highlightedId,
    onToggle: toggleHighlightedSelection,
  });

  const applyBulk = useCallback(
    (patch: FinanceCategoryTransactionPatch) => {
      const ids = [...selectedIds];
      if (!ids.length) return;
      onBulkPatchTransactions?.(ids, patch);
      // Keep selection so another property can be set without re-selecting.
    },
    [onBulkPatchTransactions, selectedIds],
  );

  const [bulkDraft, setBulkDraft] = useState<FinanceCategoryTransactionPatch>(
    {},
  );
  const [bulkApplyPending, setBulkApplyPending] = useState(false);

  const clearBulkSelection = useCallback(() => {
    setBulkDraft({});
    setSelectedIds(new Set());
    lastClickedRef.current = null;
  }, []);

  useListClearSelectionShortcut({
    enabled: bulkBarEnabled && selectedIds.size > 0,
    onClear: clearBulkSelection,
  });

  const selectionDraftKey = useMemo(
    () => [...selectedIds].sort().join(","),
    [selectedIds],
  );

  useEffect(() => {
    setBulkDraft({});
  }, [selectionDraftKey]);

  const bulkDraftReady = Object.keys(bulkDraft).length > 0;

  const moveAccountOptions = useMemo(
    () =>
      [...accounts]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => {
          const avatarSrc = accountAvatarSrcById[entry.id] ?? null;
          const initial = entry.name.trim().charAt(0).toUpperCase() || "?";
          return {
            value: entry.id,
            label: entry.name,
            searchTerms: `${entry.name} ${entry.ibanOrMask ?? ""} ${entry.key}`,
            icon: avatarSrc ? (
              <EntityListAvatar src={avatarSrc} size={18} shape="rounded-square" />
            ) : (
              <span className="finance-account-dropdown-avatar-fallback">
                {initial}
              </span>
            ),
          };
        }),
    [accounts, accountAvatarSrcById],
  );

  const orgOptions = useMemo(
    () => buildOrganizationDropdownOptions(organizations),
    [organizations],
  );

  const categoryOptions = useMemo(
    () => buildCategoryDropdownOptions(categories),
    [categories],
  );

  // Size the category column from labels that appear in this list (not the full
  // catalog) so narrow panels like the dashboard review inbox stay compact.
  const categoryNames = useMemo(() => {
    const byId = new Map(categories.map((entry) => [entry.id, entry.name]));
    const names = new Set<string>();
    let hasUncategorized = false;
    for (const tx of filteredTransactions) {
      const name = tx.categoryId ? byId.get(tx.categoryId) : undefined;
      if (name) names.add(name);
      else hasUncategorized = true;
    }
    if (hasUncategorized || names.size === 0) names.add("Uncategorized");
    return [...names];
  }, [categories, filteredTransactions]);
  const categoryColumnWidthPx = useTxCategoryColumnWidthPx(categoryNames);
  const categoryColumnStyle = useMemo(
    () => txCategoryColumnCssVars(categoryColumnWidthPx),
    [categoryColumnWidthPx],
  );

  const goalOptions = useMemo(
    () => [
      {
        value: DROPDOWN_NO_GOAL_VALUE,
        label: "No goal",
        searchTerms: "no goal unassigned none",
        icon: <DefaultProjectIcon size={14} className="text-foreground/70" />,
      },
      ...[...goals]
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        )
        .map((entry) => ({
          value: entry.id,
          label: entry.name,
          searchTerms: `${entry.name} ${entry.listing}`,
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
    [goals],
  );
  const resolveGoal = useCallback((value: string | null) => {
    if (!value || value === DROPDOWN_NO_GOAL_VALUE) return null;
    return value;
  }, []);
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
  const resolveRecurring = useCallback((value: string | null) => {
    if (!value || value === DROPDOWN_NO_RECURRING_VALUE) return null;
    return value;
  }, []);

  const selectedTransactions = useMemo(
    () => transactions.filter((tx) => selectedIds.has(tx.id)),
    [selectedIds, transactions],
  );
  const bulkCategoryValue = useMemo(() => {
    if ("categoryId" in bulkDraft) {
      return bulkDraft.categoryId ?? DROPDOWN_NONE_VALUE;
    }
    return sharedNullableIdSelectionValue(
      selectedTransactions.map((tx) => tx.categoryId),
      DROPDOWN_NONE_VALUE,
    );
  }, [bulkDraft, selectedTransactions]);
  const bulkOrgValue = useMemo(() => {
    if ("organizationId" in bulkDraft) {
      return bulkDraft.organizationId ?? DROPDOWN_NONE_VALUE;
    }
    return sharedNullableIdSelectionValue(
      selectedTransactions.map((tx) => tx.organizationId),
      DROPDOWN_NONE_VALUE,
    );
  }, [bulkDraft, selectedTransactions]);
  const bulkAccountValue = useMemo(() => {
    if ("bankAccountId" in bulkDraft && bulkDraft.bankAccountId) {
      return bulkDraft.bankAccountId;
    }
    return sharedSelectionValue(
      selectedTransactions.map((tx) => tx.bankAccountId),
    );
  }, [bulkDraft, selectedTransactions]);
  const bulkGoalValue = useMemo(() => {
    if ("goalId" in bulkDraft) {
      return bulkDraft.goalId ?? DROPDOWN_NO_GOAL_VALUE;
    }
    return sharedNullableIdSelectionValue(
      selectedTransactions.map((tx) => tx.goalId),
      DROPDOWN_NO_GOAL_VALUE,
    );
  }, [bulkDraft, selectedTransactions]);
  const bulkRecurringValue = useMemo(() => {
    if ("recurringId" in bulkDraft) {
      return bulkDraft.recurringId ?? DROPDOWN_NO_RECURRING_VALUE;
    }
    return sharedNullableIdSelectionValue(
      selectedTransactions.map((tx) => tx.recurringId),
      DROPDOWN_NO_RECURRING_VALUE,
    );
  }, [bulkDraft, selectedTransactions]);

  const bulkCategoryOptions = useMemo(
    () =>
      relabelDropdownNoneOption(
        categoryOptions,
        DROPDOWN_NONE_VALUE,
        "Category",
      ),
    [categoryOptions],
  );
  const bulkOrgOptions = useMemo(
    () =>
      relabelDropdownNoneOption(orgOptions, DROPDOWN_NONE_VALUE, "Organization"),
    [orgOptions],
  );
  const bulkGoalOptions = useMemo(
    () =>
      relabelDropdownNoneOption(goalOptions, DROPDOWN_NO_GOAL_VALUE, "Goal"),
    [goalOptions],
  );
  const bulkRecurringOptions = useMemo(
    () =>
      relabelDropdownNoneOption(
        recurringOptions,
        DROPDOWN_NO_RECURRING_VALUE,
        "Recurring",
      ),
    [recurringOptions],
  );

  const selectedCount = selectedIds.size;
  const showFloatingFilter =
    showFilterBar && (transactions.length > 0 || hasActiveFilters);
  const filterBar = showFloatingFilter ? (
    <div
      className={[
        "finance-bulk-bar-dock",
        "finance-categories-view__tx-filter-dock",
        selectedCount > 0 ? "is-faded" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden={selectedCount > 0}
      inert={selectedCount > 0 ? true : undefined}
    >
      <FinanceTransactionsFilterBar
        className="finance-filter-bar--floating"
        search={filterSearch}
        onSearchChange={setFilterSearch}
        amountMinCents={filterAmountMinCents}
        amountMaxCents={filterAmountMaxCents}
        onAmountRangeChange={(min, max) => {
          setFilterAmountMinCents(min);
          setFilterAmountMaxCents(max);
        }}
        amountCentsSamples={amountCentsSamples}
        filterCategoryIds={filterCategoryIds}
        onFilterCategoryIdsChange={setFilterCategoryIds}
        categoryOptions={filterCategoryOptions}
        filterOrganizationId={filterOrganizationId}
        onFilterOrganizationChange={setFilterOrganizationId}
        organizationOptions={filterOrganizationOptions}
        filterGoalId={filterGoalId}
        onFilterGoalChange={setFilterGoalId}
        goalOptions={filterGoalOptions}
        filterRecurringId={filterRecurringId}
        onFilterRecurringChange={setFilterRecurringId}
        recurringOptions={filterRecurringOptions}
      />
    </div>
  ) : null;

  if (!transactions.length) {
    return (
      <div className="finance-categories-view__tx-section">
        {sectionTitle ? (
          <FinanceDetailSectionTitle>{sectionTitle}</FinanceDetailSectionTitle>
        ) : null}
        <div className="finance-categories-view__tx-empty">
          {loading ? "Loading transactions…" : emptyLabel}
        </div>
      </div>
    );
  }

  if (!filteredTransactions.length) {
    return (
      <div
        className={[
          "finance-categories-view__tx-section",
          showFloatingFilter ? "has-floating-filter" : null,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {sectionTitle ? (
          <FinanceDetailSectionTitle>{sectionTitle}</FinanceDetailSectionTitle>
        ) : null}
        <div className="finance-categories-view__tx-empty">
          {hasActiveFilters
            ? "No matching transactions."
            : loading
              ? "Loading transactions…"
              : emptyLabel}
        </div>
        {filterBar}
      </div>
    );
  }

  return (
    <div
      className={[
        "finance-categories-view__tx-section",
        showFloatingFilter ? "has-floating-filter" : null,
      ]
        .filter(Boolean)
        .join(" ")}
    >
    {sectionTitle ? (
      <FinanceDetailSectionTitle>{sectionTitle}</FinanceDetailSectionTitle>
    ) : null}
    <ul
      className={[
        "finance-categories-view__tx-groups",
        "finance-tx-clean",
        groupByMonth ? null : "finance-categories-view__tx-groups--flat",
        selectedCount > 0 ? "has-bulk-selection" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      style={categoryColumnStyle}
      role="list"
      ref={listRef}
      {...listContainerProps}
    >
      {months.map((month) => {
        const rows = month.items.map((tx) => {
            const txCategory =
              categories.find((entry) => entry.id === tx.categoryId) ?? null;
            const categoryDotColor = txCategory
              ? (getEntityIconColor(txCategory.icon) ?? "#9CA3AF")
              : null;
            const orgLabel =
              organizations.find((entry) => entry.id === tx.organizationId)
                ?.name ?? null;
            const txAccount =
              accounts.find((entry) => entry.id === tx.bankAccountId) ?? null;
            const txAccountAvatarSrc =
              accountAvatarSrcById[tx.bankAccountId] ?? null;
            const txAccountInitial =
              txAccount?.name.trim().charAt(0).toUpperCase() || "?";

            const isSelected = selectedIds.has(tx.id);
            const isActive = activeTransactionId === tx.id;
            const isExiting = Boolean(exitingTransactionIds?.has(tx.id));
            const openable = Boolean(onOpenTransaction);

            return (
              <li
                key={tx.id}
                className={[
                  "finance-tx-row",
                  openable ? null : "finance-tx-row--static",
                  isActive ? "is-panel-selected" : null,
                  isSelected ? "is-selected" : null,
                  isExiting ? "is-exiting" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                {...keyboardNavItemProps(tx.id)}
              >
                <div
                  className={[
                    "finance-tx-row__line",
                    keyboardNavListItemClass(highlightedId === tx.id),
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  role={openable ? "button" : undefined}
                  tabIndex={openable ? 0 : undefined}
                  aria-pressed={openable ? isActive : undefined}
                  onClick={
                    openable
                      ? () => onOpenTransaction?.(tx)
                      : undefined
                  }
                  onKeyDown={
                    openable
                      ? (event) => {
                          if (!isDirectRoleButtonActivationKey(event)) {
                            return;
                          }
                          event.preventDefault();
                          onOpenTransaction?.(tx);
                        }
                      : undefined
                  }
                >
                  <div className="finance-tx-row__data">
                    {bulkEnabled ? (
                      <span
                        className="finance-tx-row__check"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <PolishedCheckbox
                          checked={isSelected}
                          ariaLabel={`Select ${txDisplayLabel(tx)}`}
                          onCheckedChange={(_checked, event) =>
                            toggleSelected(
                              tx.id,
                              Boolean(event.shiftKey) ||
                                shiftHeld.currentlyHeld(),
                            )
                          }
                        />
                      </span>
                    ) : null}
                    <div className="finance-tx-row__date-cell">
                      <span className="finance-tx-row__date">
                        {txDayLabel(tx.bookedOn)}
                      </span>
                    </div>
                    <div className="finance-tx-row__cell finance-tx-row__cell--category">
                      <div className="finance-tx-row__cell-inner">
                        {editable ? (
                          <SearchableDropdown
                            ariaLabel="Category"
                            className="property-dropdown"
                            taskPropertyDropdownId="category"
                            triggerClassName="property-dropdown-trigger--inline-chip finance-tx-row__dropdown-trigger"
                            value={tx.categoryId}
                            options={categoryOptions}
                            searchPlaceholder="Category"
                            panelWidth={220}
                            renderTrigger={({
                              selected,
                              open,
                              disabled,
                              triggerId,
                              onToggle,
                            }) => (
                              <button
                                type="button"
                                id={triggerId}
                                className={[
                                  "property-dropdown-trigger",
                                  "property-dropdown-trigger--inline-chip",
                                  "finance-tx-row__dropdown-trigger",
                                  "finance-tx-row__category-trigger",
                                  !selected ? "is-muted" : null,
                                  open ? "is-open" : null,
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                disabled={disabled}
                                aria-haspopup="listbox"
                                aria-expanded={open}
                                aria-label="Category"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onToggle();
                                }}
                                onMouseDown={(event) => event.stopPropagation()}
                              >
                                <span
                                  className="finance-tx-row__category-dot"
                                  style={{
                                    background:
                                      categoryDotColor ??
                                      "color-mix(in srgb, var(--foreground) 30%, transparent)",
                                  }}
                                  aria-hidden="true"
                                />
                                <span className="property-dropdown-trigger__label">
                                  {selected?.label ??
                                    txCategory?.name ??
                                    "Uncategorized"}
                                </span>
                              </button>
                            )}
                            onChange={(value) =>
                              onPatchTransaction?.(tx.id, {
                                categoryId: resolveDropdownNone(value),
                              })
                            }
                          />
                        ) : (
                          <span className="property-dropdown-trigger property-dropdown-trigger--inline-chip finance-tx-row__category-trigger is-static">
                            <span
                              className="finance-tx-row__category-dot"
                              style={{
                                background:
                                  categoryDotColor ??
                                  "color-mix(in srgb, var(--foreground) 30%, transparent)",
                              }}
                              aria-hidden="true"
                            />
                            <span className="property-dropdown-trigger__label">
                              {txCategory?.name ?? "Uncategorized"}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="finance-tx-row__source">
                      <div className="finance-tx-row__bank">
                        {editable ? (
                          <SearchableDropdown
                            ariaLabel="Move to bank account"
                            className="finance-tx-row__bank-dropdown"
                            taskPropertyDropdownId="account"
                            value={tx.bankAccountId}
                            options={moveAccountOptions}
                            searchPlaceholder="Move to account…"
                            panelWidth={260}
                            panelAlign="start"
                            disabled={moveAccountOptions.length < 2}
                            renderTrigger={({
                              open,
                              disabled,
                              triggerId,
                              onToggle,
                            }) => (
                              <button
                                type="button"
                                id={triggerId}
                                className={[
                                  "finance-tx-row__bank-icon",
                                  open ? "is-open" : null,
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                disabled={disabled}
                                aria-haspopup="listbox"
                                aria-expanded={open}
                                title={txAccount?.name ?? "Bank account"}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onToggle();
                                }}
                                onMouseDown={(event) => event.stopPropagation()}
                              >
                                {txAccountAvatarSrc ? (
                                  <EntityListAvatar
                                    src={txAccountAvatarSrc}
                                    size={18}
                                    shape="rounded-square"
                                  />
                                ) : (
                                  <span className="finance-account-dropdown-avatar-fallback">
                                    {txAccountInitial}
                                  </span>
                                )}
                              </button>
                            )}
                            onChange={(value) => {
                              if (value === tx.bankAccountId) return;
                              onPatchTransaction?.(tx.id, {
                                bankAccountId: value,
                              });
                            }}
                          />
                        ) : (
                          <span
                            className="finance-tx-row__bank-icon is-static"
                            title={txAccount?.name ?? "Bank account"}
                          >
                            {txAccountAvatarSrc ? (
                              <EntityListAvatar
                                src={txAccountAvatarSrc}
                                size={18}
                                shape="rounded-square"
                              />
                            ) : (
                              <span className="finance-account-dropdown-avatar-fallback">
                                {txAccountInitial}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                      <div className="finance-tx-row__cell finance-tx-row__cell--org">
                        <div className="finance-tx-row__cell-inner finance-tx-row__cell-inner--org">
                          {editable ? (
                            <SearchableDropdown
                              ariaLabel="Organization"
                              className="property-dropdown"
                              taskPropertyDropdownId="merchant"
                              triggerClassName="property-dropdown-trigger--inline-chip finance-tx-row__dropdown-trigger finance-tx-row__org-trigger"
                              value={tx.organizationId}
                              options={orgOptions}
                              searchPlaceholder="Organization"
                              panelWidth={260}
                              renderTrigger={({
                                selected,
                                open,
                                disabled,
                                triggerId,
                                onToggle,
                              }) => (
                                <button
                                  type="button"
                                  id={triggerId}
                                  className={[
                                    "property-dropdown-trigger",
                                    "property-dropdown-trigger--inline-chip",
                                    "finance-tx-row__dropdown-trigger",
                                    "finance-tx-row__org-trigger",
                                    selected ? "is-filled" : "is-empty",
                                    open ? "is-open" : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  disabled={disabled}
                                  aria-haspopup="listbox"
                                  aria-expanded={open}
                                  aria-label="Organization"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onToggle();
                                  }}
                                  onMouseDown={(event) => event.stopPropagation()}
                                >
                                  <span className="property-dropdown-trigger__label">
                                    {selected?.label ??
                                      orgLabel ??
                                      "No Merchant"}
                                  </span>
                                </button>
                              )}
                              onChange={(value) =>
                                onPatchTransaction?.(tx.id, {
                                  organizationId: resolveDropdownNone(value),
                                })
                              }
                              createFromQueryLabel={
                                createOrganizationFromQueryLabel
                              }
                              onCreateFromQuery={
                                onCreateOrganizationFromQuery
                                  ? (query) =>
                                      createOrganizationForTransaction(
                                        tx.id,
                                        query,
                                      )
                                  : undefined
                              }
                            />
                          ) : (
                            <span
                              className={[
                                "property-dropdown-trigger",
                                "property-dropdown-trigger--inline-chip",
                                "finance-tx-row__dropdown-trigger",
                                "finance-tx-row__org-trigger",
                                "is-static",
                                orgLabel ? "is-filled" : "is-empty",
                              ].join(" ")}
                            >
                              <span className="property-dropdown-trigger__label">
                                {orgLabel ?? "No Merchant"}
                              </span>
                            </span>
                          )}
                          {tx.goalId ? <FinanceGoalBadgeIcon /> : null}
                          {tx.recurringId ? (
                            <FinanceRecurringBadgeIcon />
                          ) : null}
                          <span
                            className="finance-tx-row__payee-hint"
                            title={txDisplayLabel(tx)}
                          >
                            {txDisplayLabel(tx)}
                          </span>
                        </div>
                      </div>
                      {showRecurringColumn ? (
                        <div className="finance-tx-row__cell finance-tx-row__cell--recurring">
                          <div className="finance-tx-row__cell-inner">
                            {editable ? (
                              <SearchableDropdown
                                ariaLabel="Recurring"
                                className="property-dropdown"
                                taskPropertyDropdownId="recurring"
                                triggerClassName="property-dropdown-trigger--inline-chip finance-tx-row__dropdown-trigger"
                                value={tx.recurringId}
                                options={recurringOptions}
                                searchPlaceholder="Recurring"
                                panelWidth={240}
                                renderTrigger={({
                                  selected,
                                  open,
                                  disabled,
                                  triggerId,
                                  onToggle,
                                }) => {
                                  const linked =
                                    recurrings.find(
                                      (entry) => entry.id === tx.recurringId,
                                    ) ?? null;
                                  return (
                                    <button
                                      type="button"
                                      id={triggerId}
                                      className={[
                                        "property-dropdown-trigger",
                                        "property-dropdown-trigger--inline-chip",
                                        "finance-tx-row__dropdown-trigger",
                                        "finance-tx-row__recurring-trigger",
                                        linked ? "is-filled" : "is-empty",
                                        open ? "is-open" : null,
                                      ]
                                        .filter(Boolean)
                                        .join(" ")}
                                      disabled={disabled}
                                      aria-haspopup="listbox"
                                      aria-expanded={open}
                                      aria-label="Recurring"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onToggle();
                                      }}
                                      onMouseDown={(event) =>
                                        event.stopPropagation()
                                      }
                                    >
                                      <span className="property-dropdown-trigger__label">
                                        {selected?.label ??
                                          linked?.name ??
                                          "No recurring"}
                                      </span>
                                    </button>
                                  );
                                }}
                                onChange={(value) =>
                                  onPatchTransaction?.(tx.id, {
                                    recurringId: resolveRecurring(value),
                                  })
                                }
                              />
                            ) : (
                              <span
                                className={[
                                  "property-dropdown-trigger",
                                  "property-dropdown-trigger--inline-chip",
                                  "finance-tx-row__dropdown-trigger",
                                  "finance-tx-row__recurring-trigger",
                                  "is-static",
                                  tx.recurringId ? "is-filled" : "is-empty",
                                ].join(" ")}
                              >
                                <span className="property-dropdown-trigger__label">
                                  {recurrings.find(
                                    (entry) => entry.id === tx.recurringId,
                                  )?.name ?? "No recurring"}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <span className="finance-tx-row__spacer" />
                    <span
                      className={[
                        "finance-tx-row__amount",
                        tx.amountCents < 0 ? "is-debit" : "is-credit",
                      ].join(" ")}
                    >
                      {formatTxAmount(tx.amountCents, tx.currency)}
                    </span>
                  </div>
                </div>
              </li>
            );
        });

        if (!groupByMonth) {
          return <Fragment key={month.key}>{rows}</Fragment>;
        }

        return (
          <ProjectTypeGroupSection
            key={month.key}
            title={month.label}
            collapsed={Boolean(collapsedMonths[month.key])}
            onToggle={() =>
              setCollapsedMonths((current) => ({
                ...current,
                [month.key]: !current[month.key],
              }))
            }
          >
            {rows}
          </ProjectTypeGroupSection>
        );
      })}
      {groupByMonth && hasMore ? (
        <li
          ref={sentinelRef}
          className="finance-tx-sentinel"
          aria-hidden="true"
        />
      ) : null}
    </ul>
    {bulkBarEnabled && selectedCount > 0 ? (
      <FinanceBulkBar
        dockClassName="finance-categories-view__tx-bulk-dock"
        selectionCount={selectedCount}
        showSelectAll={showSelectAll}
        onSelectAll={selectAllVisibleTransactions}
        onClear={clearBulkSelection}
        applyEnabled={bulkEnabled && bulkDraftReady}
        applyPending={bulkApplyPending}
        onApply={
          bulkEnabled
            ? async () => {
                if (!bulkDraftReady) return;
                setBulkApplyPending(true);
                try {
                  await Promise.resolve(applyBulk(bulkDraft));
                  setBulkDraft({});
                } finally {
                  setBulkApplyPending(false);
                }
              }
            : undefined
        }
        onDelete={
          onBulkDeleteTransactions
            ? async () => {
                const ids = [...selectedIds];
                await onBulkDeleteTransactions(ids);
                setBulkDraft({});
                setSelectedIds(new Set());
                lastClickedRef.current = null;
              }
            : undefined
        }
      >
        {bulkEnabled ? (
          <>
            <SearchableDropdown
              ariaLabel="Bulk set category"
              className="property-dropdown"
              taskPropertyDropdownId="category"
              triggerClassName={withBulkDropdownFillState(
                FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME,
                bulkCategoryValue,
                DROPDOWN_NONE_VALUE,
              )}
              value={bulkCategoryValue}
              options={bulkCategoryOptions}
              emptySelectionLabel="Category"
              showIcon={bulkDropdownShowIcon(
                bulkCategoryValue,
                DROPDOWN_NONE_VALUE,
              )}
              searchPlaceholder="Set category"
              panelWidth={220}
              onChange={(value) =>
                setBulkDraft((current) => ({
                  ...current,
                  categoryId: resolveDropdownNone(value),
                }))
              }
            />
            <SearchableDropdown
              ariaLabel="Bulk set organization"
              className="property-dropdown"
              taskPropertyDropdownId="organization"
              triggerClassName={withBulkDropdownFillState(
                FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME,
                bulkOrgValue,
                DROPDOWN_NONE_VALUE,
              )}
              value={bulkOrgValue}
              options={bulkOrgOptions}
              emptySelectionLabel="Organization"
              showIcon={bulkDropdownShowIcon(
                bulkOrgValue,
                DROPDOWN_NONE_VALUE,
              )}
              searchPlaceholder="Set organization"
              panelWidth={240}
              createFromQueryLabel={createOrganizationFromQueryLabel}
              onCreateFromQuery={
                onCreateOrganizationFromQuery
                  ? createOrganizationForBulk
                  : undefined
              }
              onChange={(value) =>
                setBulkDraft((current) => ({
                  ...current,
                  organizationId: resolveDropdownNone(value),
                }))
              }
            />
            <SearchableDropdown
              ariaLabel="Bulk move to account"
              className="property-dropdown"
              taskPropertyDropdownId="account"
              triggerClassName={withBulkDropdownFillState(
                FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME,
                bulkAccountValue,
              )}
              value={bulkAccountValue}
              options={moveAccountOptions}
              emptySelectionLabel="Account"
              showIcon={bulkDropdownShowIcon(bulkAccountValue)}
              searchPlaceholder="Move to account"
              panelWidth={240}
              onChange={(value) => {
                if (!value) return;
                setBulkDraft((current) => ({
                  ...current,
                  bankAccountId: value,
                }));
              }}
            />
            <SearchableDropdown
              ariaLabel="Bulk set goal"
              className="property-dropdown"
              taskPropertyDropdownId="goal"
              triggerClassName={withBulkDropdownFillState(
                FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME,
                bulkGoalValue,
                DROPDOWN_NO_GOAL_VALUE,
              )}
              value={bulkGoalValue}
              options={bulkGoalOptions}
              emptySelectionLabel="Goal"
              showIcon={bulkDropdownShowIcon(
                bulkGoalValue,
                DROPDOWN_NO_GOAL_VALUE,
              )}
              searchPlaceholder="Set goal"
              panelWidth={240}
              onChange={(value) =>
                setBulkDraft((current) => ({
                  ...current,
                  goalId: resolveGoal(value),
                }))
              }
            />
            <SearchableDropdown
              ariaLabel="Bulk set recurring"
              className="property-dropdown"
              taskPropertyDropdownId="recurring"
              triggerClassName={withBulkDropdownFillState(
                FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME,
                bulkRecurringValue,
                DROPDOWN_NO_RECURRING_VALUE,
              )}
              value={bulkRecurringValue}
              options={bulkRecurringOptions}
              emptySelectionLabel="Recurring"
              showIcon={bulkDropdownShowIcon(
                bulkRecurringValue,
                DROPDOWN_NO_RECURRING_VALUE,
              )}
              searchPlaceholder="Set recurring"
              panelWidth={240}
              onChange={(value) =>
                setBulkDraft((current) => ({
                  ...current,
                  recurringId: resolveRecurring(value),
                }))
              }
            />
          </>
        ) : null}
      </FinanceBulkBar>
    ) : null}
    {filterBar}
    </div>
  );
}

function CategoryRow({
  category,
  depth,
  selected,
  highlighted = false,
  spentCents,
  showAmounts,
  onSelect,
  onAddChild,
  pointerReorderBind = null,
  dragging = false,
  showDragInsertBefore = false,
}: {
  category: FinancialCategory;
  depth: 0 | 1;
  selected: boolean;
  highlighted?: boolean;
  spentCents: number;
  showAmounts: boolean;
  onSelect: () => void;
  onAddChild?: () => void;
  pointerReorderBind?: GroupedListPointerItemBind | null;
  dragging?: boolean;
  showDragInsertBefore?: boolean;
}) {
  const canPointerReorder = Boolean(pointerReorderBind);
  return (
    <li
      className={[
        "finance-categories-view__row",
        depth === 1 ? "finance-categories-view__row--child" : null,
        selected ? "is-selected" : null,
        showDragInsertBefore
          ? "finance-categories-view__row--insert-before"
          : null,
        dragging ? "finance-categories-view__row--dragging" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      {...keyboardNavItemProps(category.id)}
      {...(pointerReorderBind ?? {})}
    >
      <div
        className={[
          "finance-categories-view__row-main",
          canPointerReorder
            ? "finance-categories-view__row-main--draggable"
            : null,
          keyboardNavListItemClass(highlighted),
        ]
          .filter(Boolean)
          .join(" ")}
        role="button"
        tabIndex={0}
        data-tauri-drag-region="false"
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onSelect();
        }}
      >
        <span className="finance-categories-view__row-leading">
          <span className="finance-categories-view__row-icon" aria-hidden="true">
            <CategoryIcon icon={category.icon} size={16} />
          </span>
          <span className="finance-categories-view__row-meta">
            <span className="finance-categories-view__row-name">
              {category.name}
            </span>
          </span>
        </span>
        {showAmounts ? (
          <CategoryAmountColumns
            spentCents={spentCents}
            budgetCents={category.budgetCents}
          />
        ) : (
          <span className="finance-categories-view__amounts-spacer" />
        )}
        {onAddChild ? (
          <button
            type="button"
            className="finance-categories-view__row-add"
            aria-label={`Add subcategory under ${category.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onAddChild();
            }}
          >
            <PlusIcon />
          </button>
        ) : (
          <span className="finance-categories-view__row-action-spacer" />
        )}
      </div>
    </li>
  );
}

export function FinanceCategoriesView({
  categories,
  spentCentsByCategoryId = {},
  spentMonth = null,
  latestMonth = null,
  pending = false,
  error = null,
  onSpentMonthChange,
  categoryMetrics = null,
  categoryMetricsLoading = false,
  accounts = [],
  accountAvatarSrcById = {},
  organizations = [],
  goals = [],
  recurrings = [],
  onPatchTransaction,
  onBulkPatchTransactions,
  onBulkDeleteTransactions,
  onCreateOrganizationFromQuery,
  onChromeStateChange,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
}: FinanceCategoriesViewProps) {
  const resolvedLatestMonth = latestMonth ?? localMonthKey();
  const [localCategories, setLocalCategories] = useState(categories);
  useEffect(() => {
    setLocalCategories(categories);
  }, [categories]);

  const groups = useMemo(
    () => buildListingGroups(localCategories),
    [localCategories],
  );
  const budgetColumnWidthPx = useBudgetColumnWidthPx(localCategories);
  const childCountByParent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const category of localCategories) {
      if (!category.parentId) continue;
      counts.set(
        category.parentId,
        (counts.get(category.parentId) ?? 0) + 1,
      );
    }
    return counts;
  }, [localCategories]);

  const rolledSpentByCategoryId = useMemo(() => {
    const rolled: Record<string, number> = { ...spentCentsByCategoryId };
    for (const category of localCategories) {
      if (!category.parentId) continue;
      const childSpend = spentCentsByCategoryId[category.id] ?? 0;
      if (!childSpend) continue;
      rolled[category.parentId] = (rolled[category.parentId] ?? 0) + childSpend;
    }
    return rolled;
  }, [localCategories, spentCentsByCategoryId]);

  const spentColumnWidthPx = useSpentColumnWidthPx(
    spentCentsByCategoryId,
    rolledSpentByCategoryId,
  );

  const overview = useMemo(() => {
    const regularRoots =
      groups.find((group) => group.id === "regular")?.roots ?? [];
    const slices: OverviewSlice[] = regularRoots.map((node, index) => {
      const color =
        getEntityIconColor(node.category.icon) ??
        ENTITY_ICON_COLOR_PRESETS[index % ENTITY_ICON_COLOR_PRESETS.length]!;
      return {
        id: node.category.id,
        name: node.category.name,
        color,
        spentCents: rolledSpentByCategoryId[node.category.id] ?? 0,
      };
    });
    const spentCents = slices.reduce(
      (sum, slice) => sum + Math.max(0, slice.spentCents),
      0,
    );
    const budgetCents = regularRoots.reduce((sum, node) => {
      const own =
        node.category.budgetCents != null && node.category.budgetCents > 0
          ? node.category.budgetCents
          : 0;
      if (own > 0) return sum + own;
      // Fall back to child budgets when the parent has none.
      return (
        sum +
        node.children.reduce((childSum, child) => {
          const childBudget =
            child.budgetCents != null && child.budgetCents > 0
              ? child.budgetCents
              : 0;
          return childSum + childBudget;
        }, 0)
      );
    }, 0);
    return { slices, spentCents, budgetCents };
  }, [groups, rolledSpentByCategoryId]);
  const [collapsed, setCollapsed] = useState<
    Partial<Record<FinancialCategoryListing, boolean>>
  >({});
  const [collapsedParents, setCollapsedParents] = useState<
    Record<string, boolean>
  >({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [createState, setCreateState] = useState<CreateModalState>(null);
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );

  const canReorder = Boolean(onReorder);

  const handleCategoryReorder = useCallback(
    (request: FinanceListReorderRequest) => {
      setLocalCategories((current) =>
        applyOptimisticCategoryReorder(current, request),
      );
      if (request.fromGroupKey !== request.toGroupKey) {
        if (request.toGroupKey.startsWith("listing:")) {
          const listing = request.toGroupKey.slice("listing:".length);
          if (listing === "regular" || listing === "excluded") {
            setCollapsed((current) => ({
              ...current,
              [listing]: false,
            }));
          }
        } else if (request.toGroupKey.startsWith("parent:")) {
          const parentId = request.toGroupKey.slice("parent:".length);
          if (parentId) {
            setCollapsedParents((current) => ({
              ...current,
              [parentId]: false,
            }));
          }
        }
      }
      onReorder?.(request);
    },
    [onReorder],
  );

  const getItemGroupKey = useCallback(
    (itemId: string) => {
      const category = localCategories.find((entry) => entry.id === itemId);
      return category ? financeCategoryGroupKey(category) : undefined;
    },
    [localCategories],
  );

  const {
    draggingItemId,
    insertBeforeKey,
    bindItem,
    bindAppendZone,
    consumeClickSuppression,
  } = useGroupedListPointerReorder({
    enabled: canReorder,
    getItemGroupKey,
    itemOrderKey: financeCategoryOrderKey,
    groupAppendOrderKey: financeCategoryGroupAppendOrderKey,
    onReorder: handleCategoryReorder,
  });

  const selectCategory = useCallback(
    (categoryId: string) => {
      if (consumeClickSuppression()) return;
      setSelectedId(categoryId);
      setDetailCollapsed(false);
    },
    [consumeClickSuppression],
  );

  const closeCategoryDetail = useCallback(() => {
    setSelectedId(null);
  }, []);

  useListDismissDetailShortcut({
    enabled: selectedId != null,
    onDismiss: closeCategoryDetail,
  });

  const keyboardItemIds = useMemo(() => {
    const ids: string[] = [];
    for (const group of groups) {
      if (collapsed[group.id]) continue;
      for (const node of group.roots) {
        ids.push(node.category.id);
        if (
          node.children.length > 0 &&
          !collapsedParents[node.category.id]
        ) {
          for (const child of node.children) {
            ids.push(child.id);
          }
        }
      }
    }
    return ids;
  }, [collapsed, collapsedParents, groups]);

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds: keyboardItemIds,
    selectedId,
    onNavigate: selectCategory,
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: keyboardItemIds.length > 0,
  });

  const {
    containerRef,
    detailPaneRef,
    detailWidth,
    isResized: detailResized,
    beginResize: beginDetailResize,
    resetWidth: resetDetailWidth,
  } = useFinancePanelResize(FINANCE_CAT_DETAIL_WIDTH_KEY);

  const selected =
    localCategories.find((entry) => entry.id === selectedId) ?? null;
  const selectedHasChildren = selected
    ? (childCountByParent.get(selected.id) ?? 0) > 0
    : false;

  const groupOptions = useMemo<FinanceCategoryGroupOption[]>(() => {
    const options: FinanceCategoryGroupOption[] = [
      { id: null, name: "No group (top level)" },
    ];
    // Parent candidates must share the selected category's listing so
    // Excluded categories only nest under Excluded roots (and Regular under Regular).
    const selectedListing = selected
      ? normalizeListing(selected.listing)
      : null;
    for (const entry of localCategories) {
      // Only top-level categories can be parents (1-level nesting).
      if (entry.parentId != null) continue;
      if (entry.id === selectedId) continue;
      if (
        selectedListing &&
        normalizeListing(entry.listing) !== selectedListing
      ) {
        continue;
      }
      options.push({ id: entry.id, name: entry.name });
    }
    return options;
  }, [localCategories, selected, selectedId]);

  useEffect(() => {
    if (
      selectedId &&
      !localCategories.some((entry) => entry.id === selectedId)
    ) {
      setSelectedId(null);
    }
  }, [localCategories, selectedId]);

  useEffect(() => {
    if (!selectedId) setDetailCollapsed(false);
  }, [selectedId]);

  useEffect(() => {
    if (!onChromeStateChange) return;
    if (!selected) {
      onChromeStateChange(null);
      return;
    }
    const target = selected;
    onChromeStateChange({
      hasSelection: true,
      detailCollapsed,
      detailResized,
      onToggleDetail: () => setDetailCollapsed((current) => !current),
      category: target,
      currentListing: normalizeListing(target.listing),
      currentKind: normalizeKind(target.kind),
      currentParentId: target.parentId,
      canChangeGroup: !selectedHasChildren,
      groupOptions,
      onSetListing: (listing) => {
        void onUpdate(target.id, { listing });
      },
      onSetKind: (kind) => {
        void onUpdate(target.id, { kind });
      },
      onSetGroup: (parentId) => {
        void onUpdate(target.id, { parentId });
      },
      onDelete: async () => {
        await Promise.resolve(onDelete(target.id));
        setSelectedId(null);
      },
    });
  }, [
    detailResized,
    groupOptions,
    detailCollapsed,
    onChromeStateChange,
    onDelete,
    onUpdate,
    selected,
    selectedHasChildren,
  ]);

  useEffect(() => {
    return () => onChromeStateChange?.(null);
  }, [onChromeStateChange]);

  return (
    <EntityDetailLayout sectionLabel="Finance" title="Categories">
      <div
        ref={containerRef}
        className={[
          "finance-categories-view",
          selected ? "has-selection" : null,
          selected && detailCollapsed ? "is-detail-collapsed" : null,
          detailWidth != null ? "is-detail-resized" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          {
            "--finance-cat-spent-w": `${spentColumnWidthPx}px`,
            "--finance-cat-budget-w": `${budgetColumnWidthPx}px`,
            ...(detailWidth != null
              ? { "--finance-cat-detail-w": `${detailWidth}px` }
              : {}),
          } as CSSProperties
        }
      >
        <div className="finance-categories-view__list-pane">
          <FinanceMonthNavigator
            month={spentMonth}
            latestMonth={resolvedLatestMonth}
            onChange={onSpentMonthChange}
          />
          <BudgetOverviewCard
            spentCents={overview.spentCents}
            budgetCents={overview.budgetCents}
            spentMonth={spentMonth}
            slices={overview.slices}
          />

          <ul
            className="overview-grouped-list"
            role="list"
            ref={listRef}
            {...listContainerProps}
          >
            {groups.map((group) => {
              const isCollapsed = Boolean(collapsed[group.id]);
              const showColumnHeaders = group.id === "regular";
              const listingGroupKey = financeCategoryListingGroupKey(group.id);
              const listingAppendKey =
                financeCategoryGroupAppendOrderKey(listingGroupKey);
              return (
                <ProjectTypeGroupSection
                  key={group.id}
                  title={`${group.label} (${group.count})`}
                  collapsed={isCollapsed}
                  onToggle={() =>
                    setCollapsed((current) => ({
                      ...current,
                      [group.id]: !current[group.id],
                    }))
                  }
                  onAdd={() => {
                    setCollapsed((current) => ({
                      ...current,
                      [group.id]: false,
                    }));
                    setCreateError(null);
                    setCreateState({
                      listing: group.id,
                      parentId: null,
                    });
                  }}
                  addActionLabel="category"
                  pointerReorderAppend={
                    canReorder ? bindAppendZone(listingGroupKey) : null
                  }
                  showPointerAppendIndicator={
                    insertBeforeKey === listingAppendKey
                  }
                  trailing={
                    showColumnHeaders ? (
                      <span className="finance-categories-view__column-headers">
                        <span>Spent</span>
                        <span
                          className="finance-categories-view__column-headers-gap"
                          aria-hidden="true"
                        />
                        <span>Budget</span>
                      </span>
                    ) : null
                  }
                >
                  {group.roots.length === 0 ? (
                    <li className="finance-categories-view__group-empty">
                      Nothing here yet
                    </li>
                  ) : (
                    group.roots.map((node) => {
                      const openCreateChild = () => {
                        setCreateError(null);
                        setCreateState({
                          listing: normalizeListing(node.category.listing),
                          parentId: node.category.id,
                          parentName: node.category.name,
                        });
                      };
                      const parentSpent =
                        rolledSpentByCategoryId[node.category.id] ?? 0;
                      const parentListingKey = financeCategoryListingGroupKey(
                        normalizeListing(node.category.listing),
                      );
                      const parentOrderKey = financeCategoryOrderKey(
                        node.category.id,
                      );
                      const parentAppendKey =
                        financeCategoryGroupAppendOrderKey(
                          financeCategoryParentGroupKey(node.category.id),
                        );

                      if (node.children.length > 0) {
                        const parentCollapsed = Boolean(
                          collapsedParents[node.category.id],
                        );
                        return (
                          <StatusGroupSection
                            key={node.category.id}
                            groupKey={node.category.id}
                            title={node.category.name}
                            headerStyle={getTaskStatusHeaderGradientStyle(
                              "backlog",
                            )}
                            highlighted={selectedId === node.category.id}
                            keyboardNavItemId={node.category.id}
                            keyboardHighlighted={
                              highlightedId === node.category.id
                            }
                            persistentChevron
                            icon={
                              <span
                                className="finance-categories-view__child-count"
                                style={
                                  {
                                    "--finance-cat-count-color": categoryColor(
                                      node.category.icon,
                                    ),
                                  } as CSSProperties
                                }
                              >
                                {node.children.length}
                              </span>
                            }
                            collapsed={parentCollapsed}
                            onToggle={() =>
                              setCollapsedParents((current) => ({
                                ...current,
                                [node.category.id]: !current[node.category.id],
                              }))
                            }
                            onTitleClick={() =>
                              selectCategory(node.category.id)
                            }
                            onAdd={openCreateChild}
                            addActionLabel="subcategory"
                            pointerReorderItem={
                              canReorder
                                ? bindItem(node.category.id, parentListingKey)
                                : null
                            }
                            dragging={draggingItemId === node.category.id}
                            showDragInsertBefore={
                              insertBeforeKey === parentOrderKey
                            }
                            pointerReorderAppend={
                              canReorder
                                ? bindAppendZone(
                                    financeCategoryParentGroupKey(
                                      node.category.id,
                                    ),
                                  )
                                : null
                            }
                            showPointerAppendIndicator={
                              insertBeforeKey === parentAppendKey
                            }
                            trailing={
                              <CategoryAmountColumns
                                spentCents={parentSpent}
                                budgetCents={node.category.budgetCents}
                              />
                            }
                          >
                            {node.children.map((child) => (
                              <CategoryRow
                                key={child.id}
                                category={child}
                                depth={1}
                                selected={selectedId === child.id}
                                highlighted={highlightedId === child.id}
                                spentCents={
                                  spentCentsByCategoryId[child.id] ?? 0
                                }
                                showAmounts
                                onSelect={() => selectCategory(child.id)}
                                pointerReorderBind={
                                  canReorder
                                    ? bindItem(
                                        child.id,
                                        financeCategoryParentGroupKey(
                                          node.category.id,
                                        ),
                                      )
                                    : null
                                }
                                dragging={draggingItemId === child.id}
                                showDragInsertBefore={
                                  insertBeforeKey ===
                                  financeCategoryOrderKey(child.id)
                                }
                              />
                            ))}
                          </StatusGroupSection>
                        );
                      }

                      return (
                        <CategoryRow
                          key={node.category.id}
                          category={node.category}
                          depth={0}
                          selected={selectedId === node.category.id}
                          highlighted={highlightedId === node.category.id}
                          spentCents={parentSpent}
                          showAmounts
                          onSelect={() => selectCategory(node.category.id)}
                          onAddChild={openCreateChild}
                          pointerReorderBind={
                            canReorder
                              ? bindItem(node.category.id, parentListingKey)
                              : null
                          }
                          dragging={draggingItemId === node.category.id}
                          showDragInsertBefore={
                            insertBeforeKey === parentOrderKey
                          }
                        />
                      );
                    })
                  )}
                </ProjectTypeGroupSection>
              );
            })}
          </ul>

          {error && !selected ? (
            <p className="entity-delete-modal-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        {selected && !detailCollapsed ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize category panel"
            title="Drag to resize"
            className="finance-categories-view__resize-handle"
            onPointerDown={(event) => {
              event.preventDefault();
              beginDetailResize(event.clientX);
            }}
            onDoubleClick={resetDetailWidth}
          />
        ) : null}

        <div className="finance-categories-view__detail-pane" ref={detailPaneRef}>
          <CategoryDetailPanel
            category={selected}
            hasChildren={selectedHasChildren}
            spentCents={
              selected
                ? (rolledSpentByCategoryId[selected.id] ??
                  spentCentsByCategoryId[selected.id] ??
                  0)
                : 0
            }
            spentMonth={spentMonth}
            metrics={
              selected && categoryMetrics?.categoryId === selected.id
                ? categoryMetrics
                : null
            }
            metricsLoading={categoryMetricsLoading}
            categories={localCategories}
            accounts={accounts}
            accountAvatarSrcById={accountAvatarSrcById}
            organizations={organizations}
            goals={goals}
            recurrings={recurrings}
            onPatchTransaction={onPatchTransaction}
            onBulkPatchTransactions={onBulkPatchTransactions}
            onBulkDeleteTransactions={onBulkDeleteTransactions}
            onCreateOrganizationFromQuery={onCreateOrganizationFromQuery}
            pending={pending}
            error={selected ? error : null}
            onUpdate={(patch) => {
              if (!selected) return;
              return onUpdate(selected.id, patch);
            }}
            onDelete={async () => {
              if (!selected) return;
              await onDelete(selected.id);
              setSelectedId(null);
            }}
          />
        </div>

        <CreateCategoryModal
          state={createState}
          pending={createPending}
          error={createError}
          onClose={() => {
            if (createPending) return;
            setCreateState(null);
            setCreateError(null);
          }}
          onSubmit={async (name) => {
            if (!createState) return;
            setCreatePending(true);
            setCreateError(null);
            try {
              const parent = createState.parentId
                ? localCategories.find(
                    (entry) => entry.id === createState.parentId,
                  )
                : null;
              await onCreate({
                name,
                listing: createState.listing,
                parentId: createState.parentId,
                kind: parent?.kind ?? "expense",
              });
              setCreateState(null);
            } catch (reason) {
              setCreateError(
                reason instanceof Error
                  ? reason.message
                  : "Could not create category.",
              );
            } finally {
              setCreatePending(false);
            }
          }}
        />
      </div>
    </EntityDetailLayout>
  );
}
