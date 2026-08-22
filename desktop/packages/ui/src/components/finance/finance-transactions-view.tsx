"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import type {
  BankAccount,
  BankAccountType,
  FinancialCategory,
  FinancialGoal,
  FinancialRecurring,
  FinancialTransaction,
} from "@backsteros/contracts";

import { groupTransactionsByMonthWeek } from "../../finance/group-transactions-by-month-week.js";
import {
  computeAmountRangeDomain,
  isFullAmountRange,
} from "../../finance/filter-finance-transactions.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../../list-nav/list-keyboard-nav-zone.js";
import { useListDismissDetailShortcut } from "../../list-nav/use-list-clear-selection-shortcut.js";
import { useListSelectAllShortcut } from "../../list-nav/use-list-select-all-shortcut.js";
import { useListToggleHighlightedSelectionShortcut } from "../../list-nav/use-list-toggle-highlighted-selection-shortcut.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "../list-nav/list-keyboard-navigation-provider.js";
import { getCreateEntityFromQueryLabel } from "../../dropdowns/searchable-dropdown-create-from-query.js";
import { useFinancePanelResize } from "../../finance/use-finance-panel-resize.js";
import { useProgressiveReveal } from "../../shared/use-progressive-reveal.js";
import { EntityDetailLayout } from "../entity/entity-detail-layout.js";
import type { AvatarActionResult } from "../entity/avatar-upload.js";
import { FinanceCsvDropzone } from "./finance-csv-dropzone.js";
import { FinanceTransactionsFilterBar } from "./finance-transactions-filter-bar.js";
import {
  ALL_BANK_ACCOUNTS_VALUE,
  useFinanceTransactionsAccountControls,
  type FinanceBankAccountCreateInput,
} from "./finance-transactions-account-controls.js";
import type { FinanceTransactionsChromeState } from "./finance-transactions-actions-menu.js";
import { FinanceTransactionsBulkBarSection } from "./finance-transactions-bulk-bar-section.js";
import { FinanceTransactionDetailPanel } from "./finance-transactions-detail-pane.js";
import { FinanceTransactionsGroupedList } from "./finance-transactions-grouped-list.js";
import {
  resolveCategory,
  resolveGoal,
  resolveOrg,
  resolveProject,
  resolveRecurring,
} from "./finance-transactions-helpers.js";
import { useFinanceTransactionsOptions } from "./finance-transactions-options.js";

export { type FinanceBankAccountCreateInput } from "./finance-transactions-account-controls.js";
export {
  TransactionActionsMenu,
  type FinanceTransactionsChromeState,
} from "./finance-transactions-actions-menu.js";
export {
  FinanceTransactionDetailPanel,
  type FinanceTransactionDetailPanelProps,
  type FinanceTransactionPatch,
} from "./finance-transactions-detail-pane.js";

const FINANCE_TX_DETAIL_WIDTH_KEY =
  "backsteros-desktop.finance-transactions-detail-width";

export type FinanceTransactionsViewProps = {
  /** Currently selected account; null when viewing all accounts or none exist. */
  account: BankAccount | null;
  /** When true (and accounts exist), show transactions across every account. */
  allAccountsSelected?: boolean;
  accounts: BankAccount[];
  accountAvatarSrcById?: Record<string, string>;
  onSelectAccount: (accountId: string) => void;
  onSelectAllAccounts?: () => void;
  /** Open import flow with a CSV chosen from the empty-state dropzone. */
  onRequestImportWithFile?: (file: File) => void;
  onCreateAccount: (input: FinanceBankAccountCreateInput) => void | Promise<void>;
  onUploadAccountAvatar?: (
    accountId: string,
    file: File,
  ) => Promise<AvatarActionResult>;
  onRemoveAccountAvatar?: (accountId: string) => Promise<AvatarActionResult>;
  onDeleteAccount?: (accountId: string) => void | Promise<void>;
  transactions: FinancialTransaction[];
  organizations: Array<{
    id: string;
    name: string;
    key?: string | null;
    avatarSrc?: string | null;
  }>;
  projects: Array<{
    id: string;
    key: string;
    name: string;
    icon?: string | null;
    type?: string | null;
  }>;
  categories: FinancialCategory[];
  goals?: FinancialGoal[];
  recurrings?: FinancialRecurring[];
  loading?: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  /** Inclusive lower bound in cents; `null` = full domain (client-only filter). */
  amountMinCents: number | null;
  /** Inclusive upper bound in cents; `null` = full domain (client-only filter). */
  amountMaxCents: number | null;
  onAmountRangeChange: (
    minCents: number | null,
    maxCents: number | null,
  ) => void;
  /**
   * Category multi-filter: empty = all, may include {@link DROPDOWN_NONE_VALUE}
   * for uncategorized, otherwise category ids.
   */
  filterCategoryIds: string[];
  onFilterCategoryIdsChange: (values: string[]) => void;
  /**
   * Organization filter: `null` = all, {@link DROPDOWN_NONE_VALUE} = no org,
   * otherwise an organization id.
   */
  filterOrganizationId: string | null;
  onFilterOrganizationChange: (value: string | null) => void;
  /**
   * Goal filter: `null` = all, {@link DROPDOWN_NO_GOAL_VALUE} = no goal,
   * otherwise a goal id.
   */
  filterGoalId: string | null;
  onFilterGoalChange: (value: string | null) => void;
  /**
   * Recurring filter: `null` = all, {@link DROPDOWN_NO_RECURRING_VALUE} = none,
   * otherwise a recurring id.
   */
  filterRecurringId: string | null;
  onFilterRecurringChange: (value: string | null) => void;
  selectedIds: Set<string>;
  /**
   * Toggle one row, or shift-select a range. `orderedIds` is the **visible
   * list order** (month → week → row), not raw API order.
   */
  onToggleSelected: (
    id: string,
    shiftKey: boolean,
    orderedIds: readonly string[],
  ) => void;
  onSetGroupSelected: (ids: string[], selected: boolean) => void;
  onClearSelection: () => void;
  /**
   * Select every transaction in the current account/filter view (loads
   * remaining pages when needed). Never crosses into other accounts or
   * ignores active filters.
   */
  onSelectAllTransactions?: () => void | Promise<void>;
  selectAllPending?: boolean;
  onPatchTransaction: (
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
  ) => void;
  onBulkPatch: (patch: {
    bankAccountId?: string;
    organizationId?: string | null;
    projectId?: string | null;
    categoryId?: string | null;
    goalId?: string | null;
    recurringId?: string | null;
    displayName?: string | null;
    notes?: string | null;
  }) => void | Promise<void>;
  /** Permanently delete the currently selected transactions. */
  onBulkDelete?: () => void | Promise<void>;
  /** Permanently delete a single transaction (detail ⋯ menu). */
  onDeleteTransaction?: (id: string) => void | Promise<void>;
  /**
   * Create an organization from a typed dropdown query (no match).
   * Caller should create the org and return its id so the transaction can be linked.
   */
  onCreateOrganizationFromQuery?: (
    query: string,
  ) => Promise<{ id: string }> | { id: string };
  onLoadMore?: () => void;
  hasMore?: boolean;
  onUpdateAccount?: (
    accountId: string,
    patch: {
      name?: string;
      ibanOrMask?: string | null;
      type?: BankAccountType;
    },
  ) => void | Promise<void>;
  onChromeStateChange?: (state: FinanceTransactionsChromeState | null) => void;
};

export function FinanceTransactionsView({
  account,
  allAccountsSelected = false,
  accounts,
  accountAvatarSrcById = {},
  onSelectAccount,
  onSelectAllAccounts,
  onRequestImportWithFile,
  onCreateAccount,
  onUploadAccountAvatar,
  onRemoveAccountAvatar,
  onDeleteAccount,
  transactions,
  organizations,
  projects,
  categories,
  goals = [],
  recurrings = [],
  loading = false,
  search,
  onSearchChange,
  amountMinCents,
  amountMaxCents,
  onAmountRangeChange,
  filterCategoryIds,
  onFilterCategoryIdsChange,
  filterOrganizationId,
  onFilterOrganizationChange,
  filterGoalId,
  onFilterGoalChange,
  filterRecurringId,
  onFilterRecurringChange,
  selectedIds,
  onToggleSelected,
  onSetGroupSelected,
  onClearSelection,
  onSelectAllTransactions,
  selectAllPending = false,
  onPatchTransaction,
  onBulkPatch,
  onBulkDelete,
  onDeleteTransaction,
  onCreateOrganizationFromQuery,
  onLoadMore,
  hasMore = false,
  onUpdateAccount,
  onChromeStateChange,
}: FinanceTransactionsViewProps) {
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>(
    {},
  );
  const [collapsedWeeks, setCollapsedWeeks] = useState<Record<string, boolean>>(
    {},
  );
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );

  const {
    containerRef,
    detailPaneRef,
    detailWidth,
    isResized: detailResized,
    beginResize,
    resetWidth,
  } = useFinancePanelResize(FINANCE_TX_DETAIL_WIDTH_KEY);

  const {
    resolveAccountAvatarSrc,
    openCreateModal,
    moveAccountOptions,
    accountSwitcher,
    accountModalElement,
  } = useFinanceTransactionsAccountControls({
    account,
    allAccountsSelected,
    accounts,
    accountAvatarSrcById,
    onSelectAccount,
    onSelectAllAccounts,
    onCreateAccount,
    onUpdateAccount,
    onUploadAccountAvatar,
    onRemoveAccountAvatar,
    onDeleteAccount,
  });

  const {
    orgOptions,
    projectOptions,
    goalOptions,
    recurringOptions,
    categoryOptions,
    categoryColumnStyle,
    filterCategoryOptions,
    filterOrganizationOptions,
    filterGoalOptions,
    filterRecurringOptions,
  } = useFinanceTransactionsOptions({
    organizations,
    projects,
    categories,
    goals,
    recurrings,
  });

  const amountCentsSamples = useMemo(
    () => transactions.map((tx) => tx.amountCents),
    [transactions],
  );

  const amountDomain = useMemo(
    () => computeAmountRangeDomain(amountCentsSamples),
    [amountCentsSamples],
  );

  const amountFilterActive = !isFullAmountRange(
    amountMinCents,
    amountMaxCents,
    amountDomain,
  );

  const visibleTransactions = useMemo(() => {
    if (!amountFilterActive) return transactions;
    return transactions.filter((tx) => {
      if (amountMinCents != null && tx.amountCents < amountMinCents) {
        return false;
      }
      if (amountMaxCents != null && tx.amountCents > amountMaxCents) {
        return false;
      }
      return true;
    });
  }, [
    amountFilterActive,
    amountMaxCents,
    amountMinCents,
    transactions,
  ]);

  const groups = useMemo(
    () => groupTransactionsByMonthWeek(visibleTransactions),
    [visibleTransactions],
  );
  /** Screen order for shift-click ranges (month → week → row). */
  const visualOrderedIds = useMemo(
    () =>
      groups.flatMap((month) =>
        month.weeks.flatMap((week) => week.items.map((tx) => tx.id)),
      ),
    [groups],
  );

  const selectionKey = allAccountsSelected
    ? ALL_BANK_ACCOUNTS_VALUE
    : (account?.id ?? null);

  // Progressive rendering: only mount a bounded window of rows and reveal more
  // on scroll; fetch the next server page once everything loaded is visible.
  const revealResetKey = `${selectionKey ?? ""}|${search}|${amountMinCents ?? ""}|${amountMaxCents ?? ""}|${filterCategoryIds.join(",")}|${filterOrganizationId ?? ""}|${filterGoalId ?? ""}|${filterRecurringId ?? ""}`;
  const { visibleCount, sentinelRef } = useProgressiveReveal(
    visualOrderedIds.length,
    {
      resetKey: revealResetKey,
      onReachEnd: () => {
        if (!loading && hasMore) onLoadMore?.();
      },
    },
  );
  const visibleIdSet = useMemo(
    () => new Set(visualOrderedIds.slice(0, visibleCount)),
    [visualOrderedIds, visibleCount],
  );

  const keyboardItemIds = useMemo(() => {
    const ids: string[] = [];
    for (const month of groups) {
      if (collapsedMonths[month.monthKey]) continue;
      for (const week of month.weeks) {
        if (collapsedWeeks[week.weekKey]) continue;
        for (const tx of week.items) {
          if (!visibleIdSet.has(tx.id)) continue;
          ids.push(tx.id);
        }
      }
    }
    return ids;
  }, [collapsedMonths, collapsedWeeks, groups, visibleIdSet]);

  const openTransaction = useCallback((txId: string) => {
    setSelectedTxId(txId);
    setDetailCollapsed(false);
  }, []);

  const closeTransactionDetail = useCallback(() => {
    setSelectedTxId(null);
  }, []);

  useListDismissDetailShortcut({
    enabled: selectedTxId != null,
    onDismiss: closeTransactionDetail,
  });

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds: keyboardItemIds,
    selectedId: selectedTxId,
    onNavigate: openTransaction,
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: keyboardItemIds.length > 0,
  });

  const toggleHighlightedSelection = useCallback(
    (id: string) => {
      onToggleSelected(id, false, visualOrderedIds);
    },
    [onToggleSelected, visualOrderedIds],
  );

  useListToggleHighlightedSelectionShortcut({
    enabled: keyboardItemIds.length > 0,
    highlightedId,
    onToggle: toggleHighlightedSelection,
  });

  useEffect(() => {
    setCollapsedMonths({});
    setCollapsedWeeks({});
    setSelectedTxId(null);
  }, [selectionKey]);

  const selectedTx =
    transactions.find((tx) => tx.id === selectedTxId) ?? null;

  useEffect(() => {
    if (
      selectedTxId &&
      !transactions.some((tx) => tx.id === selectedTxId)
    ) {
      setSelectedTxId(null);
    }
  }, [transactions, selectedTxId]);

  useEffect(() => {
    if (!selectedTxId) setDetailCollapsed(false);
  }, [selectedTxId]);

  useEffect(() => {
    if (!onChromeStateChange) return;
    if (!selectedTx) {
      onChromeStateChange(null);
      return;
    }
    onChromeStateChange({
      hasSelection: true,
      transaction: selectedTx,
      detailCollapsed,
      detailResized,
      onToggleDetail: () => setDetailCollapsed((current) => !current),
      onDelete: async () => {
        if (onDeleteTransaction) {
          await Promise.resolve(onDeleteTransaction(selectedTx.id));
          return;
        }
        if (onBulkDelete) {
          await Promise.resolve(onBulkDelete());
        }
      },
    });
  }, [
    detailCollapsed,
    detailResized,
    onBulkDelete,
    onChromeStateChange,
    onDeleteTransaction,
    selectedTx,
  ]);

  useEffect(() => {
    return () => onChromeStateChange?.(null);
  }, [onChromeStateChange]);

  const selectionCount = selectedIds.size;
  const allLoadedSelected =
    visibleTransactions.length > 0 &&
    visibleTransactions.every((tx) => selectedIds.has(tx.id));
  const allMatchingSelected = allLoadedSelected && !hasMore;
  const showSelectAll =
    Boolean(onSelectAllTransactions) &&
    selectionCount > 0 &&
    !allMatchingSelected;
  const hasActiveFilters =
    search.trim().length > 0 ||
    amountFilterActive ||
    filterCategoryIds.length > 0 ||
    filterOrganizationId != null ||
    filterGoalId != null ||
    filterRecurringId != null;

  useListSelectAllShortcut({
    enabled: Boolean(onSelectAllTransactions) && visibleTransactions.length > 0,
    onSelectAll: onSelectAllTransactions,
  });

  const createOrganizationFromQueryLabel = onCreateOrganizationFromQuery
    ? (query: string) => getCreateEntityFromQueryLabel("organization", query)
    : undefined;

  const createOrganizationForTransaction = (
    query: string,
    transactionId: string,
  ) => {
    if (!onCreateOrganizationFromQuery) return;
    void Promise.resolve(onCreateOrganizationFromQuery(query)).then(
      (created) => {
        if (!created?.id) return;
        onPatchTransaction(transactionId, { organizationId: created.id });
      },
    );
  };

  let body: ReactNode;
  if (accounts.length === 0) {
    body = (
      <div className="finance-empty-state">
        <p className="finance-empty">
          Create a bank account to start importing CSVs.
        </p>
        <button type="button" className="bos-button" onClick={openCreateModal}>
          Create bank account
        </button>
      </div>
    );
  } else if (!allAccountsSelected && !account) {
    body = (
      <div className="finance-empty-state">
        <p className="finance-empty">Bank account not found.</p>
      </div>
    );
  } else {
    body = (
      <div
        ref={containerRef}
        className={[
          "finance-transactions-view",
          "finance-tx-clean",
          selectedTx ? "has-selection" : null,
          selectedTx && detailCollapsed ? "is-detail-collapsed" : null,
          detailWidth != null ? "is-detail-resized" : null,
          selectionCount > 0 ? "has-bulk-selection" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          detailWidth != null
            ? ({ "--finance-cat-detail-w": `${detailWidth}px` } as CSSProperties)
            : undefined
        }
      >
        <div className="finance-categories-view__list-pane finance-transactions-view__list-pane">
          <div className="finance-transactions finance-transactions--in-split">
        <div className="finance-transactions__scroll" style={categoryColumnStyle}>
        {loading && !transactions.length ? (
          <p className="finance-empty">Loading transactions…</p>
        ) : !visibleTransactions.length && (hasActiveFilters || transactions.length > 0) ? (
          <p className="finance-empty">No matching transactions.</p>
        ) : !transactions.length ? (
          <div className="finance-tx-empty-dropzone">
            <FinanceCsvDropzone
              onFileSelect={(file) => {
                if (file) onRequestImportWithFile?.(file);
              }}
            />
          </div>
        ) : (
          <FinanceTransactionsGroupedList
            groups={groups}
            listRef={listRef}
            listContainerProps={listContainerProps}
            collapsedMonths={collapsedMonths}
            setCollapsedMonths={setCollapsedMonths}
            collapsedWeeks={collapsedWeeks}
            setCollapsedWeeks={setCollapsedWeeks}
            selectedIds={selectedIds}
            onSetGroupSelected={onSetGroupSelected}
            visibleIdSet={visibleIdSet}
            organizations={organizations}
            categories={categories}
            accounts={accounts}
            account={account}
            resolveAccountAvatarSrc={resolveAccountAvatarSrc}
            selectedTxId={selectedTxId}
            setSelectedTxId={setSelectedTxId}
            openTransaction={openTransaction}
            highlightedId={highlightedId}
            onToggleSelected={onToggleSelected}
            visualOrderedIds={visualOrderedIds}
            categoryOptions={categoryOptions}
            moveAccountOptions={moveAccountOptions}
            orgOptions={orgOptions}
            recurringOptions={recurringOptions}
            onPatchTransaction={onPatchTransaction}
            createOrganizationFromQueryLabel={createOrganizationFromQueryLabel}
            createOrganizationForTransaction={createOrganizationForTransaction}
            onCreateOrganizationFromQuery={onCreateOrganizationFromQuery}
          />
        )}

        {visibleTransactions.length > 0 &&
        (visibleCount < visibleTransactions.length || hasMore) ? (
          <div
            ref={sentinelRef}
            className="finance-tx-sentinel"
            aria-hidden="true"
          />
        ) : null}

        {hasMore && onLoadMore ? (
          <button
            type="button"
            className="bos-button finance-load-more"
            onClick={onLoadMore}
          >
            Load more
          </button>
        ) : null}
        </div>

        <div className="finance-bulk-bar-dock finance-tx-chrome-dock">
          {transactions.length > 0 || hasActiveFilters ? (
            <div
              className={[
                "finance-tx-chrome-dock__filter",
                selectionCount > 0 ? "is-faded" : null,
              ]
                .filter(Boolean)
                .join(" ")}
              aria-hidden={selectionCount > 0}
              inert={selectionCount > 0 ? true : undefined}
            >
              <FinanceTransactionsFilterBar
                className="finance-filter-bar--floating"
                leading={accountSwitcher}
                search={search}
                onSearchChange={onSearchChange}
                amountMinCents={amountMinCents}
                amountMaxCents={amountMaxCents}
                onAmountRangeChange={onAmountRangeChange}
                amountCentsSamples={amountCentsSamples}
                filterCategoryIds={filterCategoryIds}
                onFilterCategoryIdsChange={onFilterCategoryIdsChange}
                categoryOptions={filterCategoryOptions}
                filterOrganizationId={filterOrganizationId}
                onFilterOrganizationChange={onFilterOrganizationChange}
                organizationOptions={filterOrganizationOptions}
                filterGoalId={filterGoalId}
                onFilterGoalChange={onFilterGoalChange}
                goalOptions={filterGoalOptions}
                filterRecurringId={filterRecurringId}
                onFilterRecurringChange={onFilterRecurringChange}
                recurringOptions={filterRecurringOptions}
              />
            </div>
          ) : null}
        </div>

        <FinanceTransactionsBulkBarSection
          selectionCount={selectionCount}
          showSelectAll={showSelectAll}
          selectAllPending={selectAllPending}
          onSelectAllTransactions={onSelectAllTransactions}
          onClearSelection={onClearSelection}
          selectedIds={selectedIds}
          transactions={transactions}
          onBulkPatch={onBulkPatch}
          onBulkDelete={onBulkDelete}
          orgOptions={orgOptions}
          projectOptions={projectOptions}
          goalOptions={goalOptions}
          recurringOptions={recurringOptions}
          categoryOptions={categoryOptions}
          moveAccountOptions={moveAccountOptions}
          createOrganizationFromQueryLabel={createOrganizationFromQueryLabel}
          onCreateOrganizationFromQuery={onCreateOrganizationFromQuery}
        />
          </div>
        </div>

        {selectedTx && !detailCollapsed ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize transaction panel"
            title="Drag to resize"
            className="finance-categories-view__resize-handle"
            onPointerDown={(event) => {
              event.preventDefault();
              beginResize(event.clientX);
            }}
            onDoubleClick={resetWidth}
          />
        ) : null}

        <div
          className="finance-categories-view__detail-pane"
          ref={detailPaneRef}
        >
          <FinanceTransactionDetailPanel
            transaction={selectedTx}
            organizations={organizations}
            categoryOptions={categoryOptions}
            orgOptions={orgOptions}
            projectOptions={projectOptions}
            goalOptions={goalOptions}
            recurringOptions={recurringOptions}
            moveAccountOptions={moveAccountOptions}
            onPatchTransaction={onPatchTransaction}
            onCreateOrganizationFromQuery={onCreateOrganizationFromQuery}
            resolveCategory={resolveCategory}
            resolveOrg={resolveOrg}
            resolveProject={resolveProject}
            resolveGoal={resolveGoal}
            resolveRecurring={resolveRecurring}
          />
        </div>
      </div>
    );
  }

  return (
    <EntityDetailLayout
      sectionLabel="Finance"
      title={
        allAccountsSelected
          ? "All accounts"
          : (account?.name ?? "Finance")
      }
    >
      <div className="finance-detail">{body}</div>

      {accountModalElement}
    </EntityDetailLayout>
  );
}
