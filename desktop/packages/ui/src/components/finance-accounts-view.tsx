"use client";

import type {
  BankAccount,
  BankAccountCashflowMonth,
  BankAccountType,
  FinancialCategory,
  FinancialGoal,
  FinancialRecurring,
  FinancialTransaction,
} from "@backsteros/contracts";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  bankAccountTypeForFinanceAccountGroupId,
  groupBankAccountsForFinanceNav,
  type FinanceAccountGroupId,
} from "../finance/finance-nav.js";
import {
  applyOptimisticAccountReorder,
  financeAccountGroupAppendOrderKey,
  financeAccountGroupKey,
  financeAccountOrderKey,
  type FinanceListReorderRequest,
} from "../finance/finance-list-reorder.js";
import { useFinancePanelResize } from "../finance/use-finance-panel-resize.js";
import {
  useGroupedListPointerReorder,
} from "../list-nav/use-grouped-list-pointer-reorder.js";
import {
  keyboardNavItemProps,
  keyboardNavListItemClass,
} from "../list-nav/keyboard-nav-item.js";
import {
  LIST_KEYBOARD_NAV_ZONE_CONTENT,
  LIST_KEYBOARD_NAV_ZONE_MAIN,
} from "../list-nav/list-keyboard-nav-zone.js";
import {
  ENTITY_TITLE_INPUT_ATTRIBUTE,
  useListDismissDetailShortcut,
} from "../list-nav/use-list-clear-selection-shortcut.js";
import {
  focusAndSelectTitleInput,
  useTitleRenameShortcut,
} from "../shortcuts/title-rename-shortcut.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "./list-keyboard-navigation-provider.js";
import {
  AvatarUpload,
  type AvatarActionResult,
} from "./avatar-upload.js";
import {
  EntityActionsMenu,
  type EntityActionsMenuItem,
} from "./entity-actions/entity-actions-menu.js";
import { useEntityHeaderActionsContext } from "./entity-actions/entity-header-actions-context.js";
import { EntityDetailLayout } from "./entity-detail-layout.js";
import { EntityListAvatar } from "./entity-list-avatar.js";
import { AccountIncomeExpenseChart } from "./account-income-expense-chart.js";
import { buildNonCashflowCategoryIdSet } from "../finance/cashflow-exclusion.js";
import {
  FinanceYearNavigator,
  localCalendarYear,
} from "./finance-month-navigator.js";
import {
  DEFAULT_ENTITY_ICON_COLOR,
  ENTITY_ICON_COLOR_PRESETS,
  getEntityIconColor,
  isValidEntityIconColor,
  serializeEntityIcon,
} from "../entity/entity-icon.js";
import { EntityIconPicker } from "./entity-icon-picker.js";
import {
  FinanceOverviewPie,
  type FinanceOverviewPieSlice,
} from "./finance-overview-pie.js";
import {
  FinanceTransactionsPanelList,
  type FinanceCategoryOrganization,
  type FinanceCategoryTransactionPatch,
} from "./finance-categories-view.js";
import { ProjectTypeGroupSection } from "./project-type-group-section.js";

const FINANCE_ACCOUNT_DETAIL_WIDTH_KEY =
  "backsteros-desktop.finance-accounts-detail-width";

const ACCOUNT_FALLBACK_COLOR = DEFAULT_ENTITY_ICON_COLOR;

function resolveAccountPieColor(
  account: Pick<BankAccount, "id" | "color">,
  index: number,
): string {
  const selected = account.color?.trim();
  if (selected && isValidEntityIconColor(selected)) {
    return selected;
  }
  return (
    ENTITY_ICON_COLOR_PRESETS[index % ENTITY_ICON_COLOR_PRESETS.length] ??
    ACCOUNT_FALLBACK_COLOR
  );
}

/** Per-account transactions + aggregates for the detail panel. */
export type FinanceAccountMetrics = {
  accountId: string;
  balanceCents: number;
  transactions: FinancialTransaction[];
  /** Server cashflow aggregate for the chart (preferred over summing rows). */
  cashflowYear?: number | null;
  cashflowMonths?: BankAccountCashflowMonth[] | null;
  cashflowLoading?: boolean;
};

/** Drives the accounts breadcrumb path + list collapse control. */
export type FinanceAccountsChromeState = {
  hasSelection: boolean;
  account: BankAccount | null;
  detailCollapsed: boolean;
  /** True once the detail pane has been drag-resized off the 50/50 split. */
  detailResized: boolean;
  onToggleDetail: () => void;
  onDelete: () => void | Promise<void>;
};

export type FinanceAccountUpdateInput = {
  name?: string;
  ibanOrMask?: string | null;
  type?: BankAccountType;
  color?: string | null;
  sortOrder?: number;
};

export type FinanceAccountsViewProps = {
  accounts: BankAccount[];
  accountAvatarSrcById?: Record<string, string>;
  /** Running balance per account id (sum of transaction amounts). */
  balanceCentsByAccountId?: Record<string, number>;
  categories?: FinancialCategory[];
  organizations?: FinanceCategoryOrganization[];
  goals?: FinancialGoal[];
  recurrings?: FinancialRecurring[];
  accountMetrics?: FinanceAccountMetrics | null;
  accountMetricsLoading?: boolean;
  /** Calendar year for the selected-account income/expense chart. */
  cashflowYear?: number;
  /** Furthest year the year navigator may reach. */
  latestCashflowYear?: number;
  onCashflowYearChange?: (year: number) => void;
  pending?: boolean;
  onSelectedAccountChange?: (accountId: string | null) => void;
  onChromeStateChange?: (state: FinanceAccountsChromeState | null) => void;
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
  onCreateAccount?: (type: BankAccountType) => void;
  onDeleteAccount?: (accountId: string) => void | Promise<void>;
  onUpdateAccount?: (
    accountId: string,
    patch: FinanceAccountUpdateInput,
  ) => void | Promise<void>;
  onUploadAvatar?: (
    accountId: string,
    file: File,
  ) => Promise<AvatarActionResult>;
  onRemoveAvatar?: (accountId: string) => Promise<AvatarActionResult>;
  /** Persist list order (and type when dropped across groups). */
  onReorder?: (request: FinanceListReorderRequest) => void;
};

/**
 * Three-dot overflow for the selected account — delete with the shared
 * confirmation modal (same pattern as category delete).
 */
export function AccountActionsMenu({
  account,
  onDelete,
  disabled = false,
}: {
  account: BankAccount;
  onDelete: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const { openDeleteModal, isDeletePending } = useEntityHeaderActionsContext();

  const items: EntityActionsMenuItem[] = [
    {
      id: "delete",
      label: "Delete account",
      danger: true,
      disabled: isDeletePending,
      onSelect: () => {
        openDeleteModal({
          entityLabel: account.name,
          confirmLabel: "Delete account",
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
                    : "Could not delete account.",
              };
            }
          },
        });
      },
    },
  ];

  return (
    <EntityActionsMenu
      ariaLabel={`Actions for ${account.name}`}
      triggerAriaLabel="Account actions"
      disabled={disabled || isDeletePending}
      items={items}
    />
  );
}

function formatMoney(cents: number, currency = "EUR"): string {
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

function AccountsOverviewCard({
  totalCents,
  accountCount,
  currency,
  slices,
  colorKey,
}: {
  totalCents: number;
  accountCount: number;
  currency: string;
  slices: FinanceOverviewPieSlice[];
  colorKey: string;
}) {
  return (
    <div
      className="finance-categories-view__overview"
      aria-label="Accounts overview"
    >
      <div className="finance-categories-view__overview-stat finance-categories-view__overview-stat--spent">
        <span className="finance-categories-view__overview-value">
          {formatMoney(totalCents, currency)}
        </span>
        <span className="finance-categories-view__overview-label">
          total balance
        </span>
      </div>
      <FinanceOverviewPie key={colorKey} slices={slices} />
      <div className="finance-categories-view__overview-stat finance-categories-view__overview-stat--budget">
        <span className="finance-categories-view__overview-value">
          {accountCount}
        </span>
        <span className="finance-categories-view__overview-label">
          {accountCount === 1 ? "account" : "accounts"}
        </span>
      </div>
    </div>
  );
}

export function FinanceAccountsView({
  accounts,
  accountAvatarSrcById = {},
  balanceCentsByAccountId = {},
  categories = [],
  organizations = [],
  goals = [],
  recurrings = [],
  accountMetrics = null,
  accountMetricsLoading = false,
  cashflowYear: cashflowYearProp,
  latestCashflowYear: latestCashflowYearProp,
  onCashflowYearChange,
  pending = false,
  onSelectedAccountChange,
  onChromeStateChange,
  onPatchTransaction,
  onBulkPatchTransactions,
  onBulkDeleteTransactions,
  onCreateOrganizationFromQuery,
  onCreateAccount,
  onDeleteAccount,
  onUpdateAccount,
  onUploadAvatar,
  onRemoveAvatar,
  onReorder,
}: FinanceAccountsViewProps) {
  const [localAccounts, setLocalAccounts] = useState(accounts);
  useEffect(() => {
    setLocalAccounts(accounts);
  }, [accounts]);

  const [localCashflowYear, setLocalCashflowYear] = useState(() =>
    localCalendarYear(),
  );
  const latestCashflowYear = latestCashflowYearProp ?? localCalendarYear();
  const cashflowYear = cashflowYearProp ?? localCashflowYear;
  const setCashflowYear = onCashflowYearChange ?? setLocalCashflowYear;

  const groups = useMemo(
    () =>
      groupBankAccountsForFinanceNav(localAccounts).map((group) => ({
        ...group,
        accounts: [...group.accounts].sort(
          (a, b) =>
            (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
            a.name.localeCompare(b.name),
        ),
      })),
    [localAccounts],
  );
  const [collapsedGroups, setCollapsedGroups] = useState<
    Partial<Record<FinanceAccountGroupId, boolean>>
  >({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );

  const canReorder = Boolean(onReorder);

  const handleAccountReorder = useCallback(
    (request: FinanceListReorderRequest) => {
      setLocalAccounts((current) =>
        applyOptimisticAccountReorder(current, request),
      );
      if (request.fromGroupKey !== request.toGroupKey) {
        setCollapsedGroups((current) => ({
          ...current,
          [request.toGroupKey as FinanceAccountGroupId]: false,
        }));
      }
      onReorder?.(request);
    },
    [onReorder],
  );

  const getItemGroupKey = useCallback(
    (itemId: string) => {
      const account = localAccounts.find((entry) => entry.id === itemId);
      return account ? financeAccountGroupKey(account) : undefined;
    },
    [localAccounts],
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
    itemOrderKey: financeAccountOrderKey,
    groupAppendOrderKey: (groupKey) =>
      financeAccountGroupAppendOrderKey(groupKey as FinanceAccountGroupId),
    onReorder: handleAccountReorder,
  });

  const selectAccount = useCallback(
    (accountId: string) => {
      if (consumeClickSuppression()) return;
      setSelectedId(accountId);
      setDetailCollapsed(false);
    },
    [consumeClickSuppression],
  );

  const closeAccountDetail = useCallback(() => {
    setSelectedId(null);
  }, []);

  useListDismissDetailShortcut({
    enabled: selectedId != null,
    onDismiss: closeAccountDetail,
  });

  const keyboardItemIds = useMemo(() => {
    const ids: string[] = [];
    for (const group of groups) {
      if (collapsedGroups[group.id]) continue;
      for (const account of group.accounts) {
        ids.push(account.id);
      }
    }
    return ids;
  }, [collapsedGroups, groups]);

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds: keyboardItemIds,
    selectedId,
    onNavigate: selectAccount,
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: keyboardItemIds.length > 0,
  });

  const {
    containerRef,
    detailPaneRef,
    detailWidth,
    isResized: detailResized,
    beginResize,
    resetWidth,
  } = useFinancePanelResize(FINANCE_ACCOUNT_DETAIL_WIDTH_KEY);

  const selectedAccount =
    localAccounts.find((entry) => entry.id === selectedId) ?? null;

  // Drop a stale selection if the account disappears.
  useEffect(() => {
    if (
      selectedId &&
      !localAccounts.some((entry) => entry.id === selectedId)
    ) {
      setSelectedId(null);
    }
  }, [localAccounts, selectedId]);

  useEffect(() => {
    if (!selectedId) setDetailCollapsed(false);
  }, [selectedId]);

  useEffect(() => {
    onSelectedAccountChange?.(selectedAccount?.id ?? null);
  }, [onSelectedAccountChange, selectedAccount?.id]);

  useEffect(() => {
    if (!onChromeStateChange) return;
    if (!selectedAccount) {
      onChromeStateChange(null);
      return;
    }
    const target = selectedAccount;
    onChromeStateChange({
      hasSelection: true,
      account: target,
      detailCollapsed,
      detailResized,
      onToggleDetail: () => setDetailCollapsed((current) => !current),
      onDelete: async () => {
        if (!onDeleteAccount) return;
        await Promise.resolve(onDeleteAccount(target.id));
        setSelectedId(null);
      },
    });
  }, [
    detailResized,
    detailCollapsed,
    onChromeStateChange,
    onDeleteAccount,
    selectedAccount,
  ]);

  useEffect(() => {
    return () => onChromeStateChange?.(null);
  }, [onChromeStateChange]);

  const overview = useMemo(() => {
    const slices: FinanceOverviewPieSlice[] = localAccounts
      .map((account, index) => {
        const balanceCents = balanceCentsByAccountId[account.id] ?? 0;
        return {
          id: account.id,
          label: account.name,
          value: Math.abs(balanceCents),
          color: resolveAccountPieColor(account, index),
        };
      })
      .filter((slice) => slice.value > 0);
    const totalCents = localAccounts.reduce(
      (sum, account) => sum + (balanceCentsByAccountId[account.id] ?? 0),
      0,
    );
    const currency = localAccounts[0]?.currency ?? "EUR";
    return {
      totalCents,
      accountCount: localAccounts.length,
      currency,
      slices,
      colorKey: slices.map((slice) => `${slice.id}:${slice.color}`).join("|"),
    };
  }, [localAccounts, balanceCentsByAccountId]);

  const balanceCents =
    selectedAccount && accountMetrics?.accountId === selectedAccount.id
      ? accountMetrics.balanceCents
      : selectedAccount
        ? (balanceCentsByAccountId[selectedAccount.id] ?? 0)
        : 0;
  const panelTransactions =
    selectedAccount && accountMetrics?.accountId === selectedAccount.id
      ? accountMetrics.transactions
      : [];

  return (
    <EntityDetailLayout sectionLabel="Finance" title="Accounts">
      <div
        ref={containerRef}
        className={[
          "finance-accounts-view",
          selectedAccount ? "has-selection" : null,
          selectedAccount && detailCollapsed ? "is-detail-collapsed" : null,
          detailWidth != null ? "is-detail-resized" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          detailWidth != null
            ? ({ "--finance-cat-detail-w": `${detailWidth}px` } as CSSProperties)
            : undefined
        }
      >
        <div className="finance-categories-view__list-pane">
          <AccountsOverviewCard
            totalCents={overview.totalCents}
            accountCount={overview.accountCount}
            currency={overview.currency}
            slices={overview.slices}
            colorKey={overview.colorKey}
          />

          <ul
            className="overview-grouped-list"
            role="list"
            ref={listRef}
            {...listContainerProps}
          >
            {groups.map((group) => {
              const collapsed = Boolean(collapsedGroups[group.id]);
              const appendKey = financeAccountGroupAppendOrderKey(group.id);
              return (
                <ProjectTypeGroupSection
                  key={group.id}
                  title={`${group.label} (${group.accounts.length})`}
                  collapsed={collapsed}
                  onToggle={() =>
                    setCollapsedGroups((current) => ({
                      ...current,
                      [group.id]: !current[group.id],
                    }))
                  }
                  onAdd={
                    onCreateAccount
                      ? () => {
                          setCollapsedGroups((current) => ({
                            ...current,
                            [group.id]: false,
                          }));
                          onCreateAccount(
                            bankAccountTypeForFinanceAccountGroupId(group.id),
                          );
                        }
                      : undefined
                  }
                  addActionLabel="account"
                  pointerReorderAppend={
                    canReorder ? bindAppendZone(group.id) : null
                  }
                  showPointerAppendIndicator={insertBeforeKey === appendKey}
                >
                  {group.accounts.length === 0 ? (
                    <li className="finance-accounts-view__group-empty">
                      Nothing here yet
                    </li>
                  ) : (
                    group.accounts.map((account) => {
                      const avatarSrc =
                        accountAvatarSrcById[account.id] ?? null;
                      const initial =
                        account.name.trim().charAt(0).toUpperCase() || "?";
                      const rowBalance =
                        balanceCentsByAccountId[account.id] ?? 0;
                      const pointerReorderBind = canReorder
                        ? bindItem(account.id, financeAccountGroupKey(account))
                        : null;
                      const canPointerReorder = Boolean(pointerReorderBind);
                      const dragging = draggingItemId === account.id;
                      const showDragInsertBefore =
                        insertBeforeKey === financeAccountOrderKey(account.id);
                      return (
                        <li
                          key={account.id}
                          className={[
                            "finance-accounts-view__row",
                            selectedId === account.id ? "is-selected" : null,
                            showDragInsertBefore
                              ? "finance-categories-view__row--insert-before"
                              : null,
                            dragging
                              ? "finance-categories-view__row--dragging"
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          {...keyboardNavItemProps(account.id)}
                        >
                          <div
                            className={[
                              "finance-accounts-view__row-main",
                              canPointerReorder
                                ? "finance-categories-view__row-main--draggable"
                                : null,
                              keyboardNavListItemClass(
                                highlightedId === account.id,
                              ),
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            role="button"
                            tabIndex={0}
                            aria-pressed={selectedId === account.id}
                            data-tauri-drag-region="false"
                            onClick={() => selectAccount(account.id)}
                            onKeyDown={(event) => {
                              if (
                                event.key !== "Enter" &&
                                event.key !== " "
                              ) {
                                return;
                              }
                              event.preventDefault();
                              selectAccount(account.id);
                            }}
                            {...(pointerReorderBind ?? {})}
                          >
                            <span
                              className="finance-accounts-view__avatar"
                              aria-hidden="true"
                            >
                              {avatarSrc ? (
                                <EntityListAvatar
                                  src={avatarSrc}
                                  size={28}
                                  shape="rounded-square"
                                />
                              ) : (
                                <span className="finance-account-dropdown-avatar-fallback">
                                  {initial}
                                </span>
                              )}
                            </span>
                            <span className="finance-accounts-view__meta">
                              <span className="finance-accounts-view__name">
                                {account.name}
                              </span>
                              {account.ibanOrMask?.trim() ? (
                                <span className="finance-accounts-view__sub">
                                  {account.ibanOrMask.trim()}
                                </span>
                              ) : null}
                            </span>
                            <span
                              className={[
                                "finance-accounts-view__balance",
                                rowBalance < 0 ? "is-debit" : null,
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              {formatMoney(rowBalance, account.currency)}
                            </span>
                          </div>
                        </li>
                      );
                    })
                  )}
                </ProjectTypeGroupSection>
              );
            })}
          </ul>
        </div>

        {selectedAccount && !detailCollapsed ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize account panel"
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
          <AccountDetailPanel
            account={selectedAccount}
            avatarSrc={
              selectedAccount
                ? (accountAvatarSrcById[selectedAccount.id] ?? null)
                : null
            }
            balanceCents={balanceCents}
            transactions={panelTransactions}
            cashflowYear={
              selectedAccount && accountMetrics?.accountId === selectedAccount.id
                ? (accountMetrics.cashflowYear ?? cashflowYear)
                : cashflowYear
            }
            latestCashflowYear={latestCashflowYear}
            onCashflowYearChange={setCashflowYear}
            cashflowMonths={
              selectedAccount && accountMetrics?.accountId === selectedAccount.id
                ? (accountMetrics.cashflowMonths ?? null)
                : null
            }
            cashflowLoading={
              selectedAccount && accountMetrics?.accountId === selectedAccount.id
                ? Boolean(accountMetrics.cashflowLoading)
                : accountMetricsLoading
            }
            metricsLoading={accountMetricsLoading}
            categories={categories}
            accounts={accounts}
            accountAvatarSrcById={accountAvatarSrcById}
            organizations={organizations}
            goals={goals}
            recurrings={recurrings}
            pending={pending}
            onUpdate={
              selectedAccount && onUpdateAccount
                ? async (patch) => {
                    const accountId = selectedAccount.id;
                    const previous = localAccounts.find(
                      (entry) => entry.id === accountId,
                    );
                    if (previous && Object.keys(patch).length > 0) {
                      setLocalAccounts((rows) =>
                        rows.map((row) =>
                          row.id === accountId ? { ...row, ...patch } : row,
                        ),
                      );
                    }
                    try {
                      await Promise.resolve(onUpdateAccount(accountId, patch));
                    } catch (error) {
                      if (previous) {
                        setLocalAccounts((rows) =>
                          rows.map((row) =>
                            row.id === accountId ? previous : row,
                          ),
                        );
                      }
                      throw error;
                    }
                  }
                : undefined
            }
            onUploadAvatar={
              selectedAccount && onUploadAvatar
                ? (file) => onUploadAvatar(selectedAccount.id, file)
                : undefined
            }
            onRemoveAvatar={
              selectedAccount && onRemoveAvatar
                ? () => onRemoveAvatar(selectedAccount.id)
                : undefined
            }
            onPatchTransaction={onPatchTransaction}
            onBulkPatchTransactions={onBulkPatchTransactions}
            onBulkDeleteTransactions={onBulkDeleteTransactions}
            onCreateOrganizationFromQuery={onCreateOrganizationFromQuery}
          />
        </div>
      </div>
    </EntityDetailLayout>
  );
}

function AccountDetailPanel({
  account,
  avatarSrc,
  balanceCents,
  transactions,
  cashflowYear = null,
  latestCashflowYear,
  onCashflowYearChange,
  cashflowMonths = null,
  cashflowLoading = false,
  metricsLoading,
  categories,
  accounts,
  accountAvatarSrcById,
  organizations,
  goals,
  recurrings,
  pending = false,
  onUpdate,
  onUploadAvatar,
  onRemoveAvatar,
  onPatchTransaction,
  onBulkPatchTransactions,
  onBulkDeleteTransactions,
  onCreateOrganizationFromQuery,
}: {
  account: BankAccount | null;
  avatarSrc: string | null;
  balanceCents: number;
  transactions: FinancialTransaction[];
  cashflowYear?: number | null;
  latestCashflowYear?: number;
  onCashflowYearChange?: (year: number) => void;
  cashflowMonths?: BankAccountCashflowMonth[] | null;
  cashflowLoading?: boolean;
  metricsLoading: boolean;
  categories: FinancialCategory[];
  accounts: BankAccount[];
  accountAvatarSrcById: Record<string, string>;
  organizations: FinanceCategoryOrganization[];
  goals: FinancialGoal[];
  recurrings: FinancialRecurring[];
  pending?: boolean;
  onUpdate?: (patch: FinanceAccountUpdateInput) => void | Promise<void>;
  onUploadAvatar?: (file: File) => Promise<AvatarActionResult>;
  onRemoveAvatar?: () => Promise<AvatarActionResult>;
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
  const [name, setName] = useState(account?.name ?? "");
  const [ibanOrMask, setIbanOrMask] = useState(account?.ibanOrMask ?? "");
  const [localError, setLocalError] = useState<string | null>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const syncedForId = useRef<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useTitleRenameShortcut(
    useCallback(() => {
      focusAndSelectTitleInput(titleInputRef.current);
    }, []),
    { enabled: Boolean(account && onUpdate) },
  );

  const nonCashflowCategoryIds = useMemo(
    () => buildNonCashflowCategoryIdSet(categories),
    [categories],
  );

  const yearTransactions = useMemo(() => {
    const year = cashflowYear ?? localCalendarYear();
    const prefix = `${year}-`;
    return transactions.filter((tx) => tx.bookedOn.startsWith(prefix));
  }, [cashflowYear, transactions]);

  useEffect(() => {
    if (!account) {
      setName("");
      setIbanOrMask("");
      syncedForId.current = null;
      return;
    }
    const activeLabel =
      document.activeElement?.getAttribute("aria-label") ?? "";
    if (syncedForId.current !== account.id) {
      setName(account.name);
      setIbanOrMask(account.ibanOrMask ?? "");
      syncedForId.current = account.id;
      setLocalError(null);
      return;
    }
    if (activeLabel !== "Account name") {
      setName(account.name);
    }
    if (activeLabel !== "Account number") {
      setIbanOrMask(account.ibanOrMask ?? "");
    }
  }, [account]);

  if (!account) {
    return (
      <div className="finance-categories-view__detail-empty">
        Select an account to see its transactions.
      </div>
    );
  }

  async function commitName() {
    if (!account || !onUpdate) return;
    const next = name.trim();
    if (!next || next === account.name) {
      setName(account.name);
      return;
    }
    setLocalError(null);
    try {
      await Promise.resolve(onUpdate({ name: next }));
    } catch (reason) {
      setName(account.name);
      setLocalError(
        reason instanceof Error ? reason.message : "Could not update name.",
      );
    }
  }

  async function commitIbanOrMask() {
    if (!account || !onUpdate) return;
    const next = ibanOrMask.trim();
    const current = account.ibanOrMask?.trim() ?? "";
    if (next === current) {
      setIbanOrMask(account.ibanOrMask ?? "");
      return;
    }
    setLocalError(null);
    try {
      await Promise.resolve(onUpdate({ ibanOrMask: next.length ? next : null }));
      setIbanOrMask(next);
    } catch (reason) {
      setIbanOrMask(account.ibanOrMask ?? "");
      setLocalError(
        reason instanceof Error
          ? reason.message
          : "Could not update account number.",
      );
    }
  }

  return (
    <aside
      className="finance-categories-view__detail"
      aria-label="Account details"
    >
      <div className="finance-categories-view__detail-hero">
        <div className="finance-categories-view__detail-hero-main">
          <div className="finance-accounts-view__detail-identity">
            {onUpdate ? (
              <button
                type="button"
                className="finance-accounts-view__detail-color"
                aria-label={`Change color for ${account.name}`}
                disabled={pending}
                onClick={() => setColorPickerOpen(true)}
              >
                <span
                  className="finance-categories-view__detail-color-dot"
                  style={{
                    background:
                      account.color?.trim() || ACCOUNT_FALLBACK_COLOR,
                  }}
                  aria-hidden="true"
                />
              </button>
            ) : (
              <span
                className="finance-categories-view__detail-color-dot"
                style={{
                  background: account.color?.trim() || ACCOUNT_FALLBACK_COLOR,
                }}
                aria-hidden="true"
              />
            )}
            {onUploadAvatar ? (
              <div className="finance-accounts-view__detail-avatar-edit">
                <AvatarUpload
                  displayName={account.name}
                  avatarSrc={avatarSrc}
                  shape="rounded-square"
                  allowSvg
                  showHint={false}
                  showRemove={false}
                  onUpload={onUploadAvatar}
                  onRemove={onRemoveAvatar}
                />
              </div>
            ) : (
              <span
                className="finance-accounts-view__detail-avatar"
                aria-hidden="true"
              >
                {avatarSrc ? (
                  <EntityListAvatar
                    src={avatarSrc}
                    size={40}
                    shape="rounded-square"
                  />
                ) : (
                  <span className="finance-account-dropdown-avatar-fallback">
                    {account.name.trim().charAt(0).toUpperCase() || "?"}
                  </span>
                )}
              </span>
            )}
          </div>
          <div className="finance-categories-view__detail-heading">
            {onUpdate ? (
              <input
                ref={titleInputRef}
                className="finance-categories-view__detail-title-input"
                value={name}
                disabled={pending}
                aria-label="Account name"
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
                    setName(account.name);
                    event.currentTarget.blur();
                    return;
                  }
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
              />
            ) : (
              <h2 className="finance-accounts-view__detail-title">
                {account.name}
              </h2>
            )}
            {onUpdate ? (
              <input
                className="finance-accounts-view__detail-sub-input"
                value={ibanOrMask}
                disabled={pending}
                aria-label="Account number"
                placeholder="Add account number"
                onChange={(event) => setIbanOrMask(event.target.value)}
                onBlur={() => {
                  void commitIbanOrMask();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
              />
            ) : account.ibanOrMask?.trim() ? (
              <span className="finance-accounts-view__detail-sub">
                {account.ibanOrMask.trim()}
              </span>
            ) : null}
          </div>
        </div>

        <div className="finance-accounts-view__detail-balance">
          <span className="finance-accounts-view__detail-balance-label">
            Current balance
          </span>
          <span className="finance-accounts-view__detail-balance-amount">
            {formatMoney(balanceCents, account.currency)}
          </span>
        </div>
      </div>

      {localError ? (
        <p className="entity-delete-modal-error" role="alert">
          {localError}
        </p>
      ) : null}

      <EntityIconPicker
        open={colorPickerOpen}
        value={
          account.color?.trim()
            ? serializeEntityIcon({
                kind: "default",
                color: account.color.trim(),
              })
            : null
        }
        dialogTitle="Choose account color"
        colorOnly
        onClose={() => setColorPickerOpen(false)}
        onSelect={(icon) => {
          setColorPickerOpen(false);
          setLocalError(null);
          const nextColor = getEntityIconColor(icon) ?? null;
          void Promise.resolve(onUpdate?.({ color: nextColor })).catch(
            (reason) => {
              setLocalError(
                reason instanceof Error
                  ? reason.message
                  : "Could not update color.",
              );
            },
          );
        }}
      />

      <FinanceYearNavigator
        year={cashflowYear ?? localCalendarYear()}
        latestYear={latestCashflowYear ?? localCalendarYear()}
        onChange={onCashflowYearChange}
        aria-label="Account cash flow year"
      />

      <AccountIncomeExpenseChart
        key={`${account.id}:${cashflowYear ?? "current"}`}
        cashflowYear={cashflowYear}
        cashflowMonths={cashflowMonths}
        transactions={cashflowMonths ? [] : transactions}
        nonCashflowCategoryIds={nonCashflowCategoryIds}
        loading={cashflowLoading}
        fullYear
      />

      <FinanceTransactionsPanelList
        transactions={yearTransactions}
        loading={metricsLoading}
        categories={categories}
        accounts={accounts}
        accountAvatarSrcById={accountAvatarSrcById}
        organizations={organizations}
        goals={goals}
        recurrings={recurrings}
        emptyLabel={`No transactions in ${cashflowYear ?? localCalendarYear()}.`}
        listKeyboardNavZone={LIST_KEYBOARD_NAV_ZONE_CONTENT}
        onPatchTransaction={onPatchTransaction}
        onBulkPatchTransactions={onBulkPatchTransactions}
        onBulkDeleteTransactions={onBulkDeleteTransactions}
        onCreateOrganizationFromQuery={onCreateOrganizationFromQuery}
      />
    </aside>
  );
}
