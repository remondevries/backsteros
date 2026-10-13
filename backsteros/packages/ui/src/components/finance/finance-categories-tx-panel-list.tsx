"use client";

import type {
  BankAccount,
  FinancialCategory,
  FinancialGoal,
  FinancialRecurring,
  FinancialTransaction,
} from "@backsteros/contracts";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
import { isDirectRoleButtonActivationKey } from "../../shortcuts/shortcut-guards.js";
import {
  keyboardNavItemProps,
  keyboardNavListItemClass,
} from "../../list-nav/keyboard-nav-item.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../../list-nav/list-keyboard-nav-zone.js";
import type { ListKeyboardNavZone } from "../../list-nav/list-keyboard-nav-zone.js";
import {
  useListClearSelectionShortcut,
} from "../../list-nav/use-list-clear-selection-shortcut.js";
import { useListSelectAllShortcut } from "../../list-nav/use-list-select-all-shortcut.js";
import { useListToggleHighlightedSelectionShortcut } from "../../list-nav/use-list-toggle-highlighted-selection-shortcut.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "../list-nav/list-keyboard-navigation-provider.js";
import { DefaultProjectIcon } from "../projects/default-project-icon.js";
import {
  DROPDOWN_NONE_VALUE,
  DROPDOWN_NO_GOAL_VALUE,
  DROPDOWN_NO_RECURRING_VALUE,
  buildOrganizationDropdownOptions,
  resolveDropdownNone,
} from "../dropdowns/dropdown-options.js";
import { EntityListAvatar } from "../entity/entity-list-avatar.js";
import { FinanceDetailSectionTitle } from "./finance-detail-section-title.js";
import { FinanceGoalBadgeIcon } from "./finance-goal-badge-icon.js";
import { FinanceRecurringBadgeIcon } from "./finance-recurring-badge-icon.js";
import { PolishedCheckbox } from "../shared/polished-checkbox.js";
import {
  getEntityIconColor,
  ProjectOcticon,
} from "../projects/project-octicon.js";
import { SearchableDropdown } from "../dropdowns/searchable-dropdown.js";
import { getCreateEntityFromQueryLabel } from "../../dropdowns/searchable-dropdown-create-from-query.js";
import {
  txCategoryColumnCssVars,
  useTxCategoryColumnWidthPx,
} from "../../finance/finance-tx-category-column-width.js";
import { useProgressiveReveal } from "../../shared/use-progressive-reveal.js";
import { ProjectTypeGroupSection } from "../projects/project-type-group-section.js";
import { formatMonthLong } from "./finance-month-navigator.js";
import {
  buildCategoryDropdownOptions,
  type FinanceCategoryOrganization,
  type FinanceCategoryTransactionPatch,
} from "./finance-categories-shared.js";

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
