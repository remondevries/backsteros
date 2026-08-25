"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";

import type {
  BankAccount,
  FinancialCategory,
  FinancialTransaction,
} from "@backsteros/contracts";

import type { TransactionMonthGroup } from "../../finance/group-transactions-by-month-week.js";
import { isDirectRoleButtonActivationKey } from "../../shortcuts/shortcut-guards.js";
import {
  keyboardNavItemProps,
  keyboardNavListItemClass,
} from "../../list-nav/keyboard-nav-item.js";
import type { useListKeyboardNavigationContainerProps } from "../list-nav/list-keyboard-navigation-provider.js";
import { useKeyHeld } from "../../list-nav/shift-range-selection.js";
import { EntityListAvatar } from "../entity/entity-list-avatar.js";
import { FinanceGoalBadgeIcon } from "./finance-goal-badge-icon.js";
import { FinanceRecurringBadgeIcon } from "./finance-recurring-badge-icon.js";
import { PolishedCheckbox } from "../shared/polished-checkbox.js";
import { getEntityIconColor } from "../projects/project-octicon.js";
import { ProjectTypeGroupSection } from "../projects/project-type-group-section.js";
import {
  SearchableDropdown,
  type SearchableDropdownOption,
} from "../dropdowns/searchable-dropdown.js";
import { StatusGroupSection } from "../list-nav/status-group-section.js";
import type { FinanceTransactionPatch } from "./finance-transactions-detail-pane.js";
import {
  formatAmount,
  formatTxDate,
  resolveCategory,
  resolveOrg,
  resolveRecurring,
  txDescription,
} from "./finance-transactions-helpers.js";

/**
 * Finance transaction rows use CSS `content-visibility: auto` (see
 * tasks-projects-overview.css) so large month/week trees skip off-screen
 * paint while keeping DOM markers for keyboard navigation.
 */

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

export function FinanceTransactionsGroupedList({
  groups,
  listRef,
  listContainerProps,
  collapsedMonths,
  setCollapsedMonths,
  collapsedWeeks,
  setCollapsedWeeks,
  selectedIds,
  onSetGroupSelected,
  visibleIdSet,
  organizations,
  categories,
  accounts,
  account,
  resolveAccountAvatarSrc,
  selectedTxId,
  setSelectedTxId,
  openTransaction,
  highlightedId,
  onToggleSelected,
  visualOrderedIds,
  categoryOptions,
  moveAccountOptions,
  orgOptions,
  recurringOptions,
  onPatchTransaction,
  createOrganizationFromQueryLabel,
  createOrganizationForTransaction,
  onCreateOrganizationFromQuery,
}: {
  groups: TransactionMonthGroup<FinancialTransaction>[];
  listRef: RefObject<HTMLUListElement | null>;
  listContainerProps: ReturnType<typeof useListKeyboardNavigationContainerProps>;
  collapsedMonths: Record<string, boolean>;
  setCollapsedMonths: Dispatch<SetStateAction<Record<string, boolean>>>;
  collapsedWeeks: Record<string, boolean>;
  setCollapsedWeeks: Dispatch<SetStateAction<Record<string, boolean>>>;
  selectedIds: Set<string>;
  onSetGroupSelected: (ids: string[], selected: boolean) => void;
  visibleIdSet: Set<string>;
  organizations: Array<{
    id: string;
    name: string;
    key?: string | null;
    avatarSrc?: string | null;
  }>;
  categories: FinancialCategory[];
  accounts: BankAccount[];
  account: BankAccount | null;
  resolveAccountAvatarSrc: (accountId: string) => string | null;
  selectedTxId: string | null;
  setSelectedTxId: Dispatch<SetStateAction<string | null>>;
  openTransaction: (txId: string) => void;
  highlightedId: string | null;
  onToggleSelected: (
    id: string,
    shiftKey: boolean,
    orderedIds: readonly string[],
  ) => void;
  visualOrderedIds: string[];
  categoryOptions: SearchableDropdownOption[];
  moveAccountOptions: SearchableDropdownOption[];
  orgOptions: SearchableDropdownOption[];
  recurringOptions: SearchableDropdownOption[];
  onPatchTransaction: (id: string, patch: FinanceTransactionPatch) => void;
  createOrganizationFromQueryLabel?: (query: string) => string | null;
  createOrganizationForTransaction: (
    query: string,
    transactionId: string,
  ) => void;
  onCreateOrganizationFromQuery?: (
    query: string,
  ) => Promise<{ id: string }> | { id: string };
}) {
  const shiftHeld = useKeyHeld("Shift");

  return (
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
  );
}
