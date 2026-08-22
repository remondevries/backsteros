"use client";

import { ChevronDownIcon, PencilIcon } from "@primer/octicons-react";
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

import {
  bulkDropdownShowIcon,
  FinanceBulkBar,
  relabelDropdownNoneOption,
  sharedNullableIdSelectionValue,
  sharedSelectionValue,
  withBulkDropdownFillState,
} from "./finance-bulk-bar.js";

import {
  DROPDOWN_NONE_VALUE,
  DROPDOWN_NO_GOAL_VALUE,
  DROPDOWN_NO_PROJECT_VALUE,
  DROPDOWN_NO_RECURRING_VALUE,
  buildOrganizationDropdownOptions,
  resolveDropdownNone,
} from "./dropdown-options.js";
import {
  EntityActionsMenu,
  type EntityActionsMenuItem,
} from "./entity-actions/entity-actions-menu.js";
import { useEntityHeaderActionsContext } from "./entity-actions/entity-header-actions-context.js";
import { DefaultProjectIcon } from "./default-project-icon.js";
import { buildCategoryDropdownOptions } from "./finance-categories-view.js";
import { groupTransactionsByMonthWeek } from "../finance/group-transactions-by-month-week.js";
import {
  computeAmountRangeDomain,
  isFullAmountRange,
} from "../finance/filter-finance-transactions.js";
import {
  isBlockingModalOpen,
  isDirectRoleButtonActivationKey,
  isEditableShortcutTarget,
} from "../shortcuts/shortcut-guards.js";
import {
  keyboardNavItemProps,
  keyboardNavListItemClass,
} from "../list-nav/keyboard-nav-item.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../list-nav/list-keyboard-nav-zone.js";
import {
  useListClearSelectionShortcut,
  useListDismissDetailShortcut,
} from "../list-nav/use-list-clear-selection-shortcut.js";
import { useListSelectAllShortcut } from "../list-nav/use-list-select-all-shortcut.js";
import { useListToggleHighlightedSelectionShortcut } from "../list-nav/use-list-toggle-highlighted-selection-shortcut.js";
import { useTitleRenameShortcut } from "../shortcuts/title-rename-shortcut.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "./list-keyboard-navigation-provider.js";
import {
  txCategoryColumnCssVars,
  useTxCategoryColumnWidthPx,
} from "../finance/finance-tx-category-column-width.js";
import { getCreateEntityFromQueryLabel } from "../dropdowns/searchable-dropdown-create-from-query.js";
import { useKeyHeld } from "../list-nav/shift-range-selection.js";
import { useFinancePanelResize } from "../finance/use-finance-panel-resize.js";
import { useProgressiveReveal } from "../shared/use-progressive-reveal.js";
import { suggestOrganizationForPayee } from "../finance/suggest-organization-for-payee.js";
import { EntityDetailLayout } from "./entity-detail-layout.js";
import type { AvatarActionResult } from "./avatar-upload.js";
import {
  ContentMarkdownPreviewColumn,
  ContentMarkdownViewLayout,
  useMarkdownDetailEditor,
} from "./content-markdown-view-layout.js";
import { DocumentMarkdownEditor } from "./document-markdown-editor.js";
import { DocumentMarkdownPreview } from "./document-markdown-preview.js";
import { EntityListAvatar } from "./entity-list-avatar.js";
import {
  FinanceBankAccountModal,
  type FinanceBankAccountModalValues,
} from "./finance-bank-account-modal.js";
import { FinanceCsvDropzone } from "./finance-csv-dropzone.js";
import { FinanceGoalBadgeIcon } from "./finance-goal-badge-icon.js";
import { FinanceRecurringBadgeIcon } from "./finance-recurring-badge-icon.js";
import { FloatingPillToggleDock } from "./floating-pill-toggle-dock.js";
import {
  FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME,
  FINANCE_FILTER_ALL_VALUE,
  FinanceTransactionsFilterBar,
} from "./finance-transactions-filter-bar.js";
import { SegmentedPillToggle } from "./list-board-view-shell.js";
import { OverviewNameEditor } from "./overview-name-editor.js";
import { PolishedCheckbox } from "./polished-checkbox.js";
import { PropertyFieldGroup } from "./property-field-group.js";
import { getEntityIconColor, ProjectOcticon } from "./project-octicon.js";
import { ProjectTypeGroupSection } from "./project-type-group-section.js";
import { ResizableBottomPanel } from "./resizable-bottom-panel.js";
import {
  SearchableDropdown,
  type SearchableDropdownOption,
} from "./searchable-dropdown.js";
import { StatusGroupSection } from "./status-group-section.js";

const CREATE_BANK_ACCOUNT_VALUE = "__create_bank_account__";
const ALL_BANK_ACCOUNTS_VALUE = "__all_bank_accounts__";
const FINANCE_TX_DETAIL_WIDTH_KEY =
  "backsteros-desktop.finance-transactions-detail-width";
const FINANCE_TX_LEDGER_HEIGHT_KEY =
  "backsteros-desktop.finance-transactions-ledger-height";
const FINANCE_TX_LEDGER_OPEN_KEY =
  "backsteros-desktop.finance-transactions-ledger-open";

export type FinanceBankAccountCreateInput = {
  name: string;
  ibanOrMask: string | null;
  type: BankAccountType;
  avatarFile?: File | null;
};

/** Drives the transactions breadcrumb path + detail collapse control. */
export type FinanceTransactionsChromeState = {
  hasSelection: boolean;
  transaction: FinancialTransaction;
  /** When true, the right detail panel is collapsed (list stays visible). */
  detailCollapsed: boolean;
  detailResized: boolean;
  onToggleDetail: () => void;
  onDelete: () => void | Promise<void>;
};

/**
 * Three-dot overflow for the selected transaction — delete with the shared
 * confirmation modal (same pattern as account / category chrome).
 */
export function TransactionActionsMenu({
  transaction,
  onDelete,
  disabled = false,
}: {
  transaction: FinancialTransaction;
  onDelete: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const { openDeleteModal, isDeletePending } = useEntityHeaderActionsContext();
  const label =
    transaction.displayName?.trim() ||
    transaction.payee.trim() ||
    transaction.memo?.trim() ||
    transaction.counterparty?.trim() ||
    "Untitled transaction";

  const items: EntityActionsMenuItem[] = [
    {
      id: "delete",
      label: "Delete transaction",
      danger: true,
      disabled: isDeletePending,
      onSelect: () => {
        openDeleteModal({
          entityLabel: label,
          confirmLabel: "Delete transaction",
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
                    : "Could not delete transaction.",
              };
            }
          },
        });
      },
    },
  ];

  return (
    <EntityActionsMenu
      ariaLabel={`Actions for ${label}`}
      triggerAriaLabel="Transaction actions"
      disabled={disabled || isDeletePending}
      items={items}
    />
  );
}

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

function formatAmount(cents: number, currency: string): string {
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

function groupSelectionState(
  ids: string[],
  selectedIds: Set<string>,
): { checked: boolean; indeterminate: boolean } {
  if (ids.length === 0) return { checked: false, indeterminate: false };
  let selectedCount = 0;
  for (const id of ids) {
    if (selectedIds.has(id)) selectedCount += 1;
  }
  if (selectedCount === 0) return { checked: false, indeterminate: false };
  if (selectedCount === ids.length) {
    return { checked: true, indeterminate: false };
  }
  return { checked: false, indeterminate: true };
}

function summarizeMonthAmounts(items: FinancialTransaction[]): {
  incomeCents: number;
  spendCents: number;
  balanceCents: number;
  currency: string;
} {
  const currencyCounts = new Map<string, number>();
  for (const tx of items) {
    currencyCounts.set(tx.currency, (currencyCounts.get(tx.currency) ?? 0) + 1);
  }
  let currency = "EUR";
  let bestCount = 0;
  for (const [code, count] of currencyCounts) {
    if (count > bestCount) {
      currency = code;
      bestCount = count;
    }
  }

  let incomeCents = 0;
  let spendCents = 0;
  for (const tx of items) {
    if (tx.currency !== currency) continue;
    if (tx.amountCents > 0) incomeCents += tx.amountCents;
    else if (tx.amountCents < 0) spendCents += tx.amountCents;
  }
  return {
    incomeCents,
    spendCents,
    balanceCents: incomeCents + spendCents,
    currency,
  };
}

function parseBookedDate(isoDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
}

function formatTxDate(isoDate: string): string {
  const date = parseBookedDate(isoDate);
  if (!date) return isoDate;
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
    }).format(date);
  } catch {
    return isoDate;
  }
}

function formatFullTxDate(isoDate: string): string {
  const date = parseBookedDate(isoDate);
  if (!date) return isoDate;
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  } catch {
    return isoDate;
  }
}

function txDescription(tx: FinancialTransaction): string {
  return (
    tx.displayName?.trim() ||
    tx.payee.trim() ||
    tx.memo?.trim() ||
    tx.counterparty?.trim() ||
    "Untitled transaction"
  );
}

function txOriginalDescription(tx: FinancialTransaction): string {
  return (
    tx.payee.trim() ||
    tx.memo?.trim() ||
    tx.counterparty?.trim() ||
    "Untitled transaction"
  );
}

function formatAmountCents(cents: number | null, currency: string): string {
  if (cents == null) return "—";
  return formatAmount(cents, currency);
}

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
  const [accountModal, setAccountModal] = useState<
    | { mode: "create" }
    | { mode: "edit"; account: BankAccount }
    | null
  >(null);
  const [accountModalPending, setAccountModalPending] = useState(false);
  const [accountModalError, setAccountModalError] = useState<string | null>(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingAvatarUrl, setPendingAvatarUrl] = useState<string | null>(null);
  const [avatarOverrideById, setAvatarOverrideById] = useState<
    Record<string, string | null>
  >({});

  const {
    containerRef,
    detailPaneRef,
    detailWidth,
    isResized: detailResized,
    beginResize,
    resetWidth,
  } = useFinancePanelResize(FINANCE_TX_DETAIL_WIDTH_KEY);

  const resolveAccountAvatarSrc = (accountId: string): string | null => {
    if (Object.prototype.hasOwnProperty.call(avatarOverrideById, accountId)) {
      return avatarOverrideById[accountId] ?? null;
    }
    return accountAvatarSrcById[accountId] ?? null;
  };

  const openCreateModal = () => {
    setAccountModalError(null);
    setPendingAvatarFile(null);
    setPendingAvatarUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setAccountModal({ mode: "create" });
  };

  const openEditModal = (entry: BankAccount) => {
    if (!onUpdateAccount) return;
    setAccountModalError(null);
    setPendingAvatarFile(null);
    setPendingAvatarUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setAccountModal({ mode: "edit", account: entry });
  };

  const accountOptions = useMemo(
    () => [
      ...(accounts.length > 0
        ? [
            {
              value: ALL_BANK_ACCOUNTS_VALUE,
              label: "Accounts",
              searchTerms: "all accounts every combined",
            },
          ]
        : []),
      ...[...accounts]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => {
          const avatarSrc = resolveAccountAvatarSrc(entry.id);
          const initial =
            entry.name.trim().charAt(0).toUpperCase() || "?";
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
            action: onUpdateAccount
              ? {
                  ariaLabel: `Edit ${entry.name}`,
                  icon: <PencilIcon size={10} />,
                  onSelect: () => openEditModal(entry),
                  placement: "icon" as const,
                }
              : undefined,
          };
        }),
      {
        value: CREATE_BANK_ACCOUNT_VALUE,
        label: "Create account…",
        searchTerms: "create new bank account add",
      },
    ],
    // resolveAccountAvatarSrc closes over avatar maps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountAvatarSrcById, accounts, avatarOverrideById, onUpdateAccount],
  );

  const moveAccountOptions = useMemo(
    () =>
      [...accounts]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => {
          const avatarSrc = resolveAccountAvatarSrc(entry.id);
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
    // resolveAccountAvatarSrc closes over avatar maps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountAvatarSrcById, accounts, avatarOverrideById],
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
  const categoryOptions = useMemo(
    () => buildCategoryDropdownOptions(categories),
    [categories],
  );
  const categoryNames = useMemo(
    () => categories.map((entry) => entry.name),
    [categories],
  );
  const categoryColumnWidthPx = useTxCategoryColumnWidthPx(categoryNames);
  const categoryColumnStyle = useMemo(
    () => txCategoryColumnCssVars(categoryColumnWidthPx),
    [categoryColumnWidthPx],
  );
  const filterCategoryOptions = useMemo(
    () =>
      buildCategoryDropdownOptions(categories, { noneLabel: "Uncategorized" }),
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
      ...orgOptions.filter((option) => option.value !== DROPDOWN_NONE_VALUE),
    ],
    [orgOptions],
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
      ...goalOptions.filter((option) => option.value !== DROPDOWN_NO_GOAL_VALUE),
    ],
    [goalOptions],
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
      ...recurringOptions.filter(
        (option) => option.value !== DROPDOWN_NO_RECURRING_VALUE,
      ),
    ],
    [recurringOptions],
  );

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
  const shiftHeld = useKeyHeld("Shift");

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

  const resolveOrg = (value: string): string | null =>
    resolveDropdownNone(value);
  const resolveProject = (value: string): string | null =>
    value === DROPDOWN_NO_PROJECT_VALUE ? null : value;
  const resolveGoal = (value: string): string | null =>
    value === DROPDOWN_NO_GOAL_VALUE ? null : value;
  const resolveRecurring = (value: string): string | null =>
    value === DROPDOWN_NO_RECURRING_VALUE ? null : value;
  const resolveCategory = (value: string): string | null =>
    resolveDropdownNone(value);

  const selectedTransactions = useMemo(
    () => transactions.filter((tx) => selectedIds.has(tx.id)),
    [selectedIds, transactions],
  );
  const [bulkDraft, setBulkDraft] = useState<{
    bankAccountId?: string;
    organizationId?: string | null;
    projectId?: string | null;
    categoryId?: string | null;
    goalId?: string | null;
    recurringId?: string | null;
  }>({});
  const [bulkApplyPending, setBulkApplyPending] = useState(false);

  const clearBulkSelection = useCallback(() => {
    setBulkDraft({});
    onClearSelection();
  }, [onClearSelection]);

  useListClearSelectionShortcut({
    enabled: selectionCount > 0,
    onClear: clearBulkSelection,
  });

  const selectionDraftKey = useMemo(
    () => [...selectedIds].sort().join(","),
    [selectedIds],
  );

  useEffect(() => {
    setBulkDraft({});
  }, [selectionDraftKey]);

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
  const bulkProjectValue = useMemo(() => {
    if ("projectId" in bulkDraft) {
      return bulkDraft.projectId ?? DROPDOWN_NO_PROJECT_VALUE;
    }
    return sharedNullableIdSelectionValue(
      selectedTransactions.map((tx) => tx.projectId),
      DROPDOWN_NO_PROJECT_VALUE,
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
  const bulkCategoryValue = useMemo(() => {
    if ("categoryId" in bulkDraft) {
      return bulkDraft.categoryId ?? DROPDOWN_NONE_VALUE;
    }
    return sharedNullableIdSelectionValue(
      selectedTransactions.map((tx) => tx.categoryId),
      DROPDOWN_NONE_VALUE,
    );
  }, [bulkDraft, selectedTransactions]);
  const bulkDraftReady = Object.keys(bulkDraft).length > 0;

  const bulkOrgOptions = useMemo(
    () =>
      relabelDropdownNoneOption(orgOptions, DROPDOWN_NONE_VALUE, "Organization"),
    [orgOptions],
  );
  const bulkProjectOptions = useMemo(
    () =>
      relabelDropdownNoneOption(
        projectOptions,
        DROPDOWN_NO_PROJECT_VALUE,
        "Project",
      ),
    [projectOptions],
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
  const bulkCategoryOptions = useMemo(
    () =>
      relabelDropdownNoneOption(
        categoryOptions,
        DROPDOWN_NONE_VALUE,
        "Category",
      ),
    [categoryOptions],
  );

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

  const handleAccountModalSubmit = async (
    values: FinanceBankAccountModalValues,
  ) => {
    if (!accountModal) return;
    setAccountModalPending(true);
    setAccountModalError(null);
    try {
      if (accountModal.mode === "edit") {
        await onUpdateAccount?.(accountModal.account.id, values);
      } else {
        await onCreateAccount({
          ...values,
          avatarFile: pendingAvatarFile,
        });
      }
      setPendingAvatarFile(null);
      setPendingAvatarUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      setAccountModal(null);
    } catch (error) {
      setAccountModalError(
        error instanceof Error ? error.message : "Could not save bank account.",
      );
    } finally {
      setAccountModalPending(false);
    }
  };

  const modalAccountId =
    accountModal?.mode === "edit" ? accountModal.account.id : null;
  const modalAvatarSrc =
    accountModal?.mode === "create"
      ? pendingAvatarUrl
      : modalAccountId
        ? resolveAccountAvatarSrc(modalAccountId)
        : null;

  const accountSwitcher = (
    <div className="finance-account-switcher">
      <SearchableDropdown
        ariaLabel="Bank account"
        className="property-dropdown"
        taskPropertyDropdownId="account"
        triggerClassName="property-dropdown-trigger--compose finance-account-switcher__trigger"
        value={
          allAccountsSelected
            ? ALL_BANK_ACCOUNTS_VALUE
            : (account?.id ?? null)
        }
        options={accountOptions}
        searchPlaceholder="Switch bank account…"
        panelWidth={280}
        panelAlign="start"
        renderTrigger={({ selected, open, disabled, triggerId, onToggle }) => (
          <button
            type="button"
            id={triggerId}
            className={[
              "property-dropdown-trigger",
              "property-dropdown-trigger--compose",
              "finance-account-switcher__trigger",
              open ? "is-open" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label="Bank account"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            {selected?.icon ? (
              <span className="property-dropdown-trigger__icon" aria-hidden="true">
                {selected.icon}
              </span>
            ) : null}
            <span className="property-dropdown-trigger__label">
              {selected?.label ??
                (accounts.length ? "Select account" : "Bank accounts")}
            </span>
          </button>
        )}
        onChange={(value) => {
          if (value === CREATE_BANK_ACCOUNT_VALUE) {
            openCreateModal();
            return;
          }
          if (value === ALL_BANK_ACCOUNTS_VALUE) {
            onSelectAllAccounts?.();
            return;
          }
          onSelectAccount(value);
        }}
      />
    </div>
  );

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
          <ul
            className="overview-grouped-list"
            role="list"
            ref={listRef}
            {...listContainerProps}
          >
            {groups.map((month) => {
              const monthItems = month.weeks.flatMap((week) => week.items);
              const monthIds = monthItems.map((tx) => tx.id);
              const monthSelection = groupSelectionState(monthIds, selectedIds);
              const totals = summarizeMonthAmounts(monthItems);
              const monthHasVisible = monthItems.some((tx) =>
                visibleIdSet.has(tx.id),
              );
              if (!monthHasVisible) return null;
              return (
              <StatusGroupSection
                key={month.monthKey}
                groupKey={month.monthKey}
                title={month.label}
                collapsed={Boolean(collapsedMonths[month.monthKey])}
                onToggle={() =>
                  setCollapsedMonths((prev) => ({
                    ...prev,
                    [month.monthKey]: !prev[month.monthKey],
                  }))
                }
                selection={{
                  checked: monthSelection.checked,
                  indeterminate: monthSelection.indeterminate,
                  ariaLabel: `Select ${month.label}`,
                  onChange: (checked) => onSetGroupSelected(monthIds, checked),
                }}
                trailing={
                  <div
                    className="finance-month-totals"
                    aria-label={`${month.label} totals`}
                  >
                    <span className="finance-month-totals__flow" aria-hidden="true">
                      <span className="finance-month-totals__income">
                        {formatAmount(totals.incomeCents, totals.currency)}
                      </span>
                      <span className="finance-month-totals__spend">
                        {formatAmount(totals.spendCents, totals.currency)}
                      </span>
                    </span>
                    <span className="finance-month-totals__balance">
                      {formatAmount(totals.balanceCents, totals.currency)}
                    </span>
                  </div>
                }
              >
                {month.weeks.map((week) => {
                  const weekIds = week.items.map((tx) => tx.id);
                  const weekSelection = groupSelectionState(
                    weekIds,
                    selectedIds,
                  );
                  const weekVisibleItems = week.items.filter((tx) =>
                    visibleIdSet.has(tx.id),
                  );
                  if (!weekVisibleItems.length) return null;
                  return (
                  <ProjectTypeGroupSection
                    key={week.weekKey}
                    title={week.label}
                    collapsed={Boolean(collapsedWeeks[week.weekKey])}
                    onToggle={() =>
                      setCollapsedWeeks((prev) => ({
                        ...prev,
                        [week.weekKey]: !prev[week.weekKey],
                      }))
                    }
                    selection={{
                      checked: weekSelection.checked,
                      indeterminate: weekSelection.indeterminate,
                      ariaLabel: `Select ${week.label}`,
                      onChange: (checked) =>
                        onSetGroupSelected(weekIds, checked),
                    }}
                  >
                    <ul className="finance-tx-list">
                      {weekVisibleItems.map((tx) => {
                        const description = txDescription(tx);
                        const orgLabel =
                          organizations.find(
                            (entry) => entry.id === tx.organizationId,
                          )?.name ?? null;
                        const txCategory =
                          categories.find(
                            (entry) => entry.id === tx.categoryId,
                          ) ?? null;
                        const categoryLabel = txCategory?.name ?? null;
                        const categoryDotColor = txCategory
                          ? (getEntityIconColor(txCategory.icon) ?? "#9CA3AF")
                          : null;
                        const txAccount =
                          accounts.find(
                            (entry) => entry.id === tx.bankAccountId,
                          ) ?? null;
                        const txAccountAvatarSrc = resolveAccountAvatarSrc(
                          tx.bankAccountId,
                        );
                        const txAccountInitial =
                          txAccount?.name.trim().charAt(0).toUpperCase() ||
                          account?.name.trim().charAt(0).toUpperCase() ||
                          "?";

                        return (
                          <li
                            key={tx.id}
                            className={[
                              "finance-tx-row",
                              selectedTxId === tx.id
                                ? "is-panel-selected"
                                : null,
                              selectedIds.has(tx.id) ? "is-selected" : null,
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            {...keyboardNavItemProps(tx.id)}
                          >
                            <div
                              className={[
                                "finance-tx-row__line",
                                keyboardNavListItemClass(
                                  highlightedId === tx.id,
                                ),
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              role="button"
                              tabIndex={0}
                              aria-pressed={selectedTxId === tx.id}
                              onClick={() =>
                                setSelectedTxId((current) =>
                                  current === tx.id ? null : tx.id,
                                )
                              }
                              onKeyDown={(event) => {
                                if (!isDirectRoleButtonActivationKey(event)) {
                                  return;
                                }
                                event.preventDefault();
                                openTransaction(tx.id);
                              }}
                            >
                              <div className="finance-tx-row__data">
                                <span
                                  className="finance-tx-row__check"
                                  onClick={(event) => event.stopPropagation()}
                                  onKeyDown={(event) =>
                                    event.stopPropagation()
                                  }
                                >
                                  <PolishedCheckbox
                                    checked={selectedIds.has(tx.id)}
                                    ariaLabel={`Select ${description}`}
                                    onCheckedChange={(_checked, event) => {
                                      onToggleSelected(
                                        tx.id,
                                        Boolean(event.shiftKey) ||
                                          shiftHeld.currentlyHeld(),
                                        visualOrderedIds,
                                      );
                                    }}
                                  />
                                </span>
                                <div className="finance-tx-row__date-cell">
                                  <span className="finance-tx-row__date">
                                    {formatTxDate(tx.bookedOn)}
                                  </span>
                                </div>
                                <div className="finance-tx-row__cell finance-tx-row__cell--category">
                                  <div className="finance-tx-row__cell-inner">
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
                                          onMouseDown={(event) =>
                                            event.stopPropagation()
                                          }
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
                                              categoryLabel ??
                                              "Uncategorized"}
                                          </span>
                                        </button>
                                      )}
                                      onChange={(value) =>
                                        onPatchTransaction(tx.id, {
                                          categoryId: resolveCategory(value),
                                        })
                                      }
                                    />
                                  </div>
                                </div>
                                <div className="finance-tx-row__source">
                                  <div className="finance-tx-row__bank">
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
                                          title={
                                            txAccount?.name ??
                                            account?.name ??
                                            "Bank account"
                                          }
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            onToggle();
                                          }}
                                          onMouseDown={(event) =>
                                            event.stopPropagation()
                                          }
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
                                        onPatchTransaction(tx.id, {
                                          bankAccountId: value,
                                        });
                                      }}
                                    />
                                  </div>
                                  <div className="finance-tx-row__cell finance-tx-row__cell--org">
                                    <div className="finance-tx-row__cell-inner finance-tx-row__cell-inner--org">
                                      <SearchableDropdown
                                        ariaLabel="Organization"
                                        className="property-dropdown"
                                        taskPropertyDropdownId="merchant"
                                        triggerClassName="property-dropdown-trigger--inline-chip finance-tx-row__dropdown-trigger finance-tx-row__org-trigger"
                                        value={tx.organizationId}
                                        options={orgOptions}
                                        searchPlaceholder="Organization"
                                        panelWidth={260}
                                        createFromQueryLabel={
                                          createOrganizationFromQueryLabel
                                        }
                                        onCreateFromQuery={
                                          onCreateOrganizationFromQuery
                                            ? (query) =>
                                                createOrganizationForTransaction(
                                                  query,
                                                  tx.id,
                                                )
                                            : undefined
                                        }
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
                                              selected
                                                ? "is-filled"
                                                : "is-empty",
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
                                            onMouseDown={(event) =>
                                              event.stopPropagation()
                                            }
                                          >
                                            <span className="property-dropdown-trigger__label">
                                              {selected?.label ??
                                                orgLabel ??
                                                "No Merchant"}
                                            </span>
                                          </button>
                                        )}
                                        onChange={(value) =>
                                          onPatchTransaction(tx.id, {
                                            organizationId: resolveOrg(value),
                                          })
                                        }
                                      />
                                      {tx.goalId ? <FinanceGoalBadgeIcon /> : null}
                                      {/* Mount only when linked (visible badge) or this
                                          row is keyboard-highlighted (R hotkey target).
                                          Avoids a SearchableDropdown per row on long lists. */}
                                      {tx.recurringId ||
                                      highlightedId === tx.id ? (
                                        <SearchableDropdown
                                          ariaLabel="Recurring"
                                          className={[
                                            "property-dropdown",
                                            "finance-tx-row__recurring-dropdown",
                                            tx.recurringId
                                              ? null
                                              : "finance-tx-row__recurring-dropdown--hotkey-only",
                                          ]
                                            .filter(Boolean)
                                            .join(" ")}
                                          taskPropertyDropdownId="recurring"
                                          value={tx.recurringId}
                                          options={recurringOptions}
                                          searchPlaceholder="Recurring"
                                          panelWidth={240}
                                          renderTrigger={({
                                            open,
                                            disabled,
                                            triggerId,
                                            onToggle,
                                          }) =>
                                            tx.recurringId ? (
                                              <button
                                                type="button"
                                                id={triggerId}
                                                className={[
                                                  "finance-tx-row__recurring-trigger",
                                                  "is-filled",
                                                  open ? "is-open" : null,
                                                ]
                                                  .filter(Boolean)
                                                  .join(" ")}
                                                disabled={disabled}
                                                aria-haspopup="listbox"
                                                aria-expanded={open}
                                                aria-label="Recurring"
                                                title={
                                                  recurringOptions.find(
                                                    (option) =>
                                                      option.value ===
                                                      tx.recurringId,
                                                  )?.label ?? "Recurring"
                                                }
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  onToggle();
                                                }}
                                                onMouseDown={(event) =>
                                                  event.stopPropagation()
                                                }
                                              >
                                                <FinanceRecurringBadgeIcon />
                                              </button>
                                            ) : (
                                              <button
                                                type="button"
                                                id={triggerId}
                                                className="finance-tx-row__recurring-trigger is-hotkey-only"
                                                disabled={disabled}
                                                aria-haspopup="listbox"
                                                aria-expanded={open}
                                                aria-label="Recurring"
                                                tabIndex={-1}
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  onToggle();
                                                }}
                                                onMouseDown={(event) =>
                                                  event.stopPropagation()
                                                }
                                              />
                                            )
                                          }
                                          onChange={(value) =>
                                            onPatchTransaction(tx.id, {
                                              recurringId:
                                                resolveRecurring(value),
                                            })
                                          }
                                        />
                                      ) : null}
                                      <span
                                        className="finance-tx-row__payee-hint"
                                        title={description}
                                      >
                                        {description}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <span className="finance-tx-row__spacer" />
                                <span
                                  className={
                                    tx.amountCents < 0
                                      ? "finance-tx-row__amount is-debit"
                                      : "finance-tx-row__amount is-credit"
                                  }
                                >
                                  {formatAmount(tx.amountCents, tx.currency)}
                                </span>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </ProjectTypeGroupSection>
                  );
                })}
              </StatusGroupSection>
              );
            })}
          </ul>
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

        {selectionCount > 0 ? (
          <FinanceBulkBar
            selectionCount={selectionCount}
            showSelectAll={showSelectAll}
            selectAllPending={selectAllPending}
            onSelectAll={onSelectAllTransactions}
            onClear={clearBulkSelection}
            applyEnabled={bulkDraftReady}
            applyPending={bulkApplyPending}
            onApply={async () => {
              if (!bulkDraftReady) return;
              setBulkApplyPending(true);
              try {
                await Promise.resolve(onBulkPatch(bulkDraft));
                setBulkDraft({});
              } finally {
                setBulkApplyPending(false);
              }
            }}
            onDelete={onBulkDelete}
          >
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
                    organizationId: resolveOrg(value),
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
                ariaLabel="Bulk set project"
                className="property-dropdown"
                taskPropertyDropdownId="project"
                triggerClassName={withBulkDropdownFillState(
                  FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME,
                  bulkProjectValue,
                  DROPDOWN_NO_PROJECT_VALUE,
                )}
                value={bulkProjectValue}
                options={bulkProjectOptions}
                emptySelectionLabel="Project"
                showIcon={bulkDropdownShowIcon(
                  bulkProjectValue,
                  DROPDOWN_NO_PROJECT_VALUE,
                )}
                searchPlaceholder="Set project"
                panelWidth={240}
                onChange={(value) =>
                  setBulkDraft((current) => ({
                    ...current,
                    projectId: resolveProject(value),
                  }))
                }
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
                    categoryId: resolveCategory(value),
                  }))
                }
              />
          </FinanceBulkBar>
        ) : null}
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

      <FinanceBankAccountModal
        open={accountModal != null}
        mode={accountModal?.mode ?? "create"}
        initialValues={
          accountModal?.mode === "edit"
            ? {
                name: accountModal.account.name,
                ibanOrMask: accountModal.account.ibanOrMask,
                type: accountModal.account.type,
              }
            : { name: "", ibanOrMask: null, type: "bank_account" }
        }
        pending={accountModalPending}
        error={accountModalError}
        avatarSrc={modalAvatarSrc}
        onUploadAvatar={async (file) => {
          if (accountModal?.mode === "edit") {
            if (!onUploadAccountAvatar) {
              return { ok: false, error: "Avatar upload is unavailable." };
            }
            const result = await onUploadAccountAvatar(
              accountModal.account.id,
              file,
            );
            if (result.ok) {
              const url = URL.createObjectURL(file);
              setAvatarOverrideById((current) => {
                const previous = current[accountModal.account.id];
                if (previous) URL.revokeObjectURL(previous);
                return { ...current, [accountModal.account.id]: url };
              });
            }
            return result;
          }
          setPendingAvatarFile(file);
          setPendingAvatarUrl((current) => {
            if (current) URL.revokeObjectURL(current);
            return URL.createObjectURL(file);
          });
          return { ok: true };
        }}
        onRemoveAvatar={async () => {
          if (accountModal?.mode === "edit") {
            if (!onRemoveAccountAvatar) {
              return { ok: false, error: "Avatar removal is unavailable." };
            }
            const result = await onRemoveAccountAvatar(accountModal.account.id);
            if (result.ok) {
              setAvatarOverrideById((current) => {
                const previous = current[accountModal.account.id];
                if (previous) URL.revokeObjectURL(previous);
                return { ...current, [accountModal.account.id]: null };
              });
            }
            return result;
          }
          setPendingAvatarFile(null);
          setPendingAvatarUrl((current) => {
            if (current) URL.revokeObjectURL(current);
            return null;
          });
          return { ok: true };
        }}
        onDelete={
          accountModal?.mode === "edit" && onDeleteAccount
            ? async () => {
                await onDeleteAccount(accountModal.account.id);
                setAccountModal(null);
              }
            : undefined
        }
        onClose={() => {
          if (accountModalPending) return;
          setAccountModal(null);
          setAccountModalError(null);
          setPendingAvatarFile(null);
          setPendingAvatarUrl((current) => {
            if (current) URL.revokeObjectURL(current);
            return null;
          });
        }}
        onSubmit={handleAccountModalSubmit}
      />
    </EntityDetailLayout>
  );
}

export type FinanceTransactionPatch = {
  bankAccountId?: string;
  organizationId?: string | null;
  projectId?: string | null;
  categoryId?: string | null;
  goalId?: string | null;
  recurringId?: string | null;
  displayName?: string | null;
  notes?: string | null;
};

export type FinanceTransactionDetailPanelProps = {
  transaction: FinancialTransaction | null;
  organizations: Array<{
    id: string;
    name: string;
    key?: string | null;
    avatarSrc?: string | null;
  }>;
  categoryOptions: SearchableDropdownOption[];
  orgOptions: SearchableDropdownOption[];
  projectOptions: SearchableDropdownOption[];
  goalOptions: SearchableDropdownOption[];
  recurringOptions: SearchableDropdownOption[];
  moveAccountOptions: SearchableDropdownOption[];
  onPatchTransaction: (id: string, patch: FinanceTransactionPatch) => void;
  onCreateOrganizationFromQuery?: (
    query: string,
  ) => Promise<{ id: string }> | { id: string };
  resolveCategory: (value: string) => string | null;
  resolveOrg: (value: string) => string | null;
  resolveProject: (value: string) => string | null;
  resolveGoal: (value: string) => string | null;
  resolveRecurring: (value: string) => string | null;
};

export function FinanceTransactionDetailPanel({
  transaction,
  organizations,
  categoryOptions,
  orgOptions,
  projectOptions,
  goalOptions,
  recurringOptions,
  moveAccountOptions,
  onPatchTransaction,
  onCreateOrganizationFromQuery,
  resolveCategory,
  resolveOrg,
  resolveProject,
  resolveGoal,
  resolveRecurring,
}: FinanceTransactionDetailPanelProps) {
  const [ledgerOpen, setLedgerOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(FINANCE_TX_LEDGER_OPEN_KEY) === "1";
  });
  const [renameFocusRequest, setRenameFocusRequest] = useState(0);

  useTitleRenameShortcut(
    useCallback(() => {
      setRenameFocusRequest((count) => count + 1);
    }, []),
    { enabled: Boolean(transaction) },
  );

  const notesInitial = transaction?.notes ?? "";
  const {
    value: notesValue,
    mode: notesMode,
    editorActivated: notesEditorActivated,
    editorFocusRequest: notesEditorFocusRequest,
    handleChange: handleNotesChange,
    handleBlurSave: handleNotesBlurSave,
    setViewMode: setNotesViewMode,
    toggleViewMode: toggleNotesViewMode,
  } = useMarkdownDetailEditor({
    initialValue: notesInitial,
    shortcutsEnabled: Boolean(transaction),
    save: (next) => {
      if (!transaction) return { ok: true };
      const trimmed = next.trim();
      onPatchTransaction(transaction.id, {
        notes: trimmed.length > 0 ? next : null,
      });
      return { ok: true };
    },
  });

  useEffect(() => {
    if (!transaction) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (event.repeat) return;
      const isL =
        (event.key.length === 1 && event.key.toLowerCase() === "l") ||
        event.code === "KeyL";
      if (!isL) return;
      if (isBlockingModalOpen()) return;
      if (isEditableShortcutTarget(event.target)) return;
      if (isEditableShortcutTarget(document.activeElement)) return;
      if (document.querySelector("[data-searchable-dropdown-panel]")) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setLedgerOpen((open) => {
        const next = !open;
        window.localStorage.setItem(
          FINANCE_TX_LEDGER_OPEN_KEY,
          next ? "1" : "0",
        );
        return next;
      });
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [transaction]);

  if (!transaction) {
    return (
      <div className="finance-categories-view__detail-empty">
        Select a transaction to see its details.
      </div>
    );
  }

  const description = txDescription(transaction);
  const originalDescription = txOriginalDescription(transaction);
  const suggestion =
    transaction.organizationId == null
      ? suggestOrganizationForPayee(
          transaction.payee,
          transaction.counterparty,
          organizations,
        )
      : null;
  const rawEntries = Object.entries(transaction.raw ?? {}).filter(
    ([, value]) => value.trim().length > 0,
  );

  function toggleLedger() {
    setLedgerOpen((open) => {
      const next = !open;
      window.localStorage.setItem(
        FINANCE_TX_LEDGER_OPEN_KEY,
        next ? "1" : "0",
      );
      return next;
    });
  }

  return (
    <aside
      className="finance-categories-view__detail finance-transactions-view__detail"
      aria-label="Transaction details"
      data-content-view-mode={notesMode}
    >
      <div className="finance-transactions-view__detail-scroll">
        <div className="finance-transactions-view__detail-hero">
          <p className="finance-transactions-view__detail-date">
            {formatFullTxDate(transaction.bookedOn)}
          </p>
          <div className="finance-transactions-view__detail-hero-primary">
            <OverviewNameEditor
              value={description}
              entityLabel="Transaction"
              resetKey={transaction.id}
              titleClassName="finance-transactions-view__detail-title"
              renameFocusRequest={renameFocusRequest}
              onSave={(name) => {
                const trimmed = name.trim();
                const nextDisplayName =
                  !trimmed || trimmed === originalDescription
                    ? null
                    : trimmed;
                onPatchTransaction(transaction.id, {
                  displayName: nextDisplayName,
                });
                return { ok: true };
              }}
            />
            <span
              className={[
                "finance-transactions-view__detail-amount",
                transaction.amountCents < 0 ? "is-debit" : "is-credit",
              ].join(" ")}
            >
              {formatAmount(transaction.amountCents, transaction.currency)}
            </span>
          </div>
          <div className="finance-transactions-view__detail-account">
            <SearchableDropdown
              ariaLabel="Account"
              className="property-dropdown finance-transactions-view__detail-account-dropdown"
              taskPropertyDropdownId="account"
              triggerClassName="property-dropdown-trigger--inline-chip"
              value={transaction.bankAccountId}
              options={moveAccountOptions}
              searchPlaceholder="Move to account…"
              panelWidth={260}
              panelAlign="start"
              disabled={moveAccountOptions.length < 2}
              onChange={(value) => {
                if (value === transaction.bankAccountId) return;
                onPatchTransaction(transaction.id, {
                  bankAccountId: value,
                });
              }}
            />
          </div>
        </div>

        <div className="finance-tx-row__details-classify">
          <div className="finance-tx-row__details-props finance-tx-row__details-props--list">
            <PropertyFieldGroup label="Category">
              <SearchableDropdown
                ariaLabel="Category"
                className="property-dropdown"
                taskPropertyDropdownId="category"
                triggerClassName="property-dropdown-trigger--inline-chip"
                value={transaction.categoryId}
                options={categoryOptions}
                searchPlaceholder="Category"
                panelWidth={220}
                onChange={(value) =>
                  onPatchTransaction(transaction.id, {
                    categoryId: resolveCategory(value),
                  })
                }
              />
            </PropertyFieldGroup>
            <PropertyFieldGroup label="Organization">
              <SearchableDropdown
                ariaLabel="Organization"
                className="property-dropdown"
                taskPropertyDropdownId="merchant"
                triggerClassName="property-dropdown-trigger--inline-chip"
                value={transaction.organizationId}
                options={orgOptions}
                searchPlaceholder="Organization"
                panelWidth={260}
                createFromQueryLabel={
                  onCreateOrganizationFromQuery
                    ? (query) =>
                        getCreateEntityFromQueryLabel("organization", query)
                    : undefined
                }
                onCreateFromQuery={
                  onCreateOrganizationFromQuery
                    ? (query) => {
                        void Promise.resolve(
                          onCreateOrganizationFromQuery(query),
                        ).then((created) => {
                          if (!created?.id) return;
                          onPatchTransaction(transaction.id, {
                            organizationId: created.id,
                          });
                        });
                      }
                    : undefined
                }
                onChange={(value) =>
                  onPatchTransaction(transaction.id, {
                    organizationId: resolveOrg(value),
                  })
                }
              />
            </PropertyFieldGroup>
            <PropertyFieldGroup label="Project">
              <SearchableDropdown
                ariaLabel="Project"
                className="property-dropdown"
                taskPropertyDropdownId="project"
                triggerClassName="property-dropdown-trigger--inline-chip"
                value={transaction.projectId}
                options={projectOptions}
                searchPlaceholder="Project"
                panelWidth={260}
                onChange={(value) =>
                  onPatchTransaction(transaction.id, {
                    projectId: resolveProject(value),
                  })
                }
              />
            </PropertyFieldGroup>
            <PropertyFieldGroup label="Goal">
              <SearchableDropdown
                ariaLabel="Goal"
                className="property-dropdown"
                taskPropertyDropdownId="goal"
                triggerClassName="property-dropdown-trigger--inline-chip"
                value={transaction.goalId}
                options={goalOptions}
                searchPlaceholder="Goal"
                panelWidth={260}
                onChange={(value) =>
                  onPatchTransaction(transaction.id, {
                    goalId: resolveGoal(value),
                  })
                }
              />
            </PropertyFieldGroup>
            <PropertyFieldGroup label="Recurring">
              <SearchableDropdown
                ariaLabel="Recurring"
                className="property-dropdown"
                taskPropertyDropdownId="recurring"
                triggerClassName="property-dropdown-trigger--inline-chip"
                value={transaction.recurringId}
                options={recurringOptions}
                searchPlaceholder="Recurring"
                panelWidth={260}
                onChange={(value) =>
                  onPatchTransaction(transaction.id, {
                    recurringId: resolveRecurring(value),
                  })
                }
              />
            </PropertyFieldGroup>
          </div>
          {suggestion ? (
            <button
              type="button"
              className="finance-tx-row__suggest"
              onClick={() =>
                onPatchTransaction(transaction.id, {
                  organizationId: suggestion.id,
                })
              }
            >
              Suggest org: {suggestion.name}
            </button>
          ) : null}
        </div>

        <div className="finance-transactions-view__notes markdown-document-scrollport">
          <h3 className="finance-transactions-view__notes-heading">Notes</h3>
          <ContentMarkdownViewLayout
            mode={notesMode}
            editorActivated={notesEditorActivated}
            onToggleMode={toggleNotesViewMode}
            editor={
              <DocumentMarkdownEditor
                value={notesValue}
                onChange={handleNotesChange}
                onBlur={handleNotesBlurSave}
                focusRequest={notesEditorFocusRequest}
                ariaLabel="Transaction notes"
                scrollWithContent
              />
            }
            preview={
              <ContentMarkdownPreviewColumn includeTopInset={false}>
                {notesValue.trim() ? (
                  <DocumentMarkdownPreview
                    body={notesValue}
                    onChange={handleNotesChange}
                  />
                ) : (
                  <p className="content-markdown-empty-hint">
                    Add a note for this transaction…
                  </p>
                )}
              </ContentMarkdownPreviewColumn>
            }
          />
        </div>
      </div>

      <div className="finance-transactions-view__notes-dock">
        <FloatingPillToggleDock className="finance-transactions-view__notes-mode-toggle">
          <SegmentedPillToggle
            value={notesMode}
            options={[
              { value: "preview", label: "Preview" },
              { value: "edit", label: "Edit" },
            ]}
            onChange={(nextMode) => {
              if (nextMode === "edit") {
                setNotesViewMode("edit");
                return;
              }
              setNotesViewMode(nextMode);
            }}
            ariaLabel="Notes view mode"
          />
        </FloatingPillToggleDock>
      </div>

      <ResizableBottomPanel
        storageKey={FINANCE_TX_LEDGER_HEIGHT_KEY}
        defaultHeight={280}
        minHeight={140}
        collapsed={!ledgerOpen}
        collapsedHeight={44}
        className={[
          "finance-tx-ledger-tray",
          ledgerOpen ? null : "finance-tx-ledger-tray--collapsed",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="finance-tx-ledger-tray__chrome">
          <button
            type="button"
            className="finance-tx-ledger-tray__toggle"
            aria-expanded={ledgerOpen}
            aria-controls="finance-tx-ledger-panel"
            title={ledgerOpen ? "Hide ledger" : "Show ledger"}
            aria-label={ledgerOpen ? "Hide ledger" : "Show ledger"}
            onClick={toggleLedger}
          >
            <span className="finance-tx-ledger-tray__title">Ledger</span>
            <ChevronDownIcon
              size={14}
              className={[
                "finance-tx-ledger-tray__chevron",
                ledgerOpen ? "is-open" : null,
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </button>
        </div>
        {ledgerOpen ? (
          <div
            id="finance-tx-ledger-panel"
            className="finance-tx-ledger-tray__body"
          >
            <dl className="finance-tx-row__details-grid">
              <div>
                <dt>Date</dt>
                <dd>{transaction.bookedOn}</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>
                  {formatAmount(transaction.amountCents, transaction.currency)}
                </dd>
              </div>
              <div>
                <dt>Payee</dt>
                <dd>{transaction.payee || "—"}</dd>
              </div>
              <div>
                <dt>Counterparty</dt>
                <dd>{transaction.counterparty || "—"}</dd>
              </div>
              <div>
                <dt>Memo</dt>
                <dd>{transaction.memo || "—"}</dd>
              </div>
              <div>
                <dt>Balance after</dt>
                <dd>
                  {formatAmountCents(
                    transaction.balanceAfterCents,
                    transaction.currency,
                  )}
                </dd>
              </div>
              <div>
                <dt>Code</dt>
                <dd>{transaction.sourceCode || "—"}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{transaction.sourceType || "—"}</dd>
              </div>
              <div>
                <dt>External id</dt>
                <dd>{transaction.externalId || "—"}</dd>
              </div>
            </dl>

            <div className="finance-tx-row__details-raw">
              <h4 className="finance-tx-row__details-heading">Original CSV</h4>
              {rawEntries.length ? (
                <dl className="finance-tx-row__details-grid">
                  {rawEntries.map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="finance-tx-row__details-empty">
                  No original CSV columns stored for this row.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </ResizableBottomPanel>
    </aside>
  );
}
