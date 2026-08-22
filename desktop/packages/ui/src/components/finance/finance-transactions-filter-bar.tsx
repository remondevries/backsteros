"use client";

import { SearchIcon, XCircleFillIcon } from "@primer/octicons-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from "react";

import { FinanceAmountRangeFilter } from "./finance-amount-range-filter.js";
import {
  SearchableDropdown,
  type SearchableDropdownOption,
} from "../dropdowns/searchable-dropdown.js";
import { FINANCE_FILTER_SCOPE_ATTRIBUTE } from "../../tasks/task-property-dropdown-keys.js";

export const FINANCE_FILTER_ALL_VALUE = "__all__";

/**
 * Shared trigger chrome for floating filter + bulk editor pills so both docks
 * use the same SearchableDropdown look.
 */
export const FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME =
  "property-dropdown-trigger--compose finance-filter-bar__dropdown-trigger";

export type FinanceTransactionsFilterBarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** Inclusive lower bound in cents; `null` = full domain. */
  amountMinCents: number | null;
  /** Inclusive upper bound in cents; `null` = full domain. */
  amountMaxCents: number | null;
  onAmountRangeChange: (
    minCents: number | null,
    maxCents: number | null,
  ) => void;
  /** Amounts before the amount filter — drives histogram + domain. */
  amountCentsSamples: readonly number[];
  filterCategoryIds: string[];
  onFilterCategoryIdsChange: (values: string[]) => void;
  categoryOptions: SearchableDropdownOption[];
  /** `null` = all orgs; {@link FINANCE_FILTER_ALL_VALUE} is not used here. */
  filterOrganizationId: string | null;
  onFilterOrganizationChange: (value: string | null) => void;
  organizationOptions: SearchableDropdownOption[];
  /** `null` = all goals. */
  filterGoalId: string | null;
  onFilterGoalChange: (value: string | null) => void;
  goalOptions: SearchableDropdownOption[];
  /** `null` = all recurrings. */
  filterRecurringId: string | null;
  onFilterRecurringChange: (value: string | null) => void;
  recurringOptions: SearchableDropdownOption[];
  /** Optional leading control (e.g. account switcher on the main Transactions page). */
  leading?: ReactNode;
  className?: string;
};

/**
 * Unified search + filter toolbar for finance transaction lists.
 * Renders as one input-styled shell so the search field can stay transparent.
 */
export function FinanceTransactionsFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search description or counterparty…",
  amountMinCents,
  amountMaxCents,
  onAmountRangeChange,
  amountCentsSamples,
  filterCategoryIds,
  onFilterCategoryIdsChange,
  categoryOptions,
  filterOrganizationId,
  onFilterOrganizationChange,
  organizationOptions,
  filterGoalId,
  onFilterGoalChange,
  goalOptions,
  filterRecurringId,
  onFilterRecurringChange,
  recurringOptions,
  leading = null,
  className,
}: FinanceTransactionsFilterBarProps) {
  const searchInputId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchSlotRef = useRef<HTMLDivElement>(null);
  const [searchExpanded, setSearchExpanded] = useState(
    () => search.trim().length > 0,
  );
  const hasSearchQuery = search.trim().length > 0;

  useEffect(() => {
    if (search.trim().length > 0) setSearchExpanded(true);
  }, [search]);

  useEffect(() => {
    if (!searchExpanded) return;
    const input = searchInputRef.current;
    if (!input) return;
    // Focus after the expand transition starts so the field is interactive.
    const frame = window.requestAnimationFrame(() => {
      input.focus();
      const length = input.value.length;
      input.setSelectionRange(length, length);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [searchExpanded]);

  const collapseSearchIfEmpty = (event: FocusEvent<HTMLInputElement>) => {
    const next = event.relatedTarget;
    if (
      next instanceof Node &&
      searchSlotRef.current?.contains(next)
    ) {
      return;
    }
    if (search.trim().length === 0) setSearchExpanded(false);
  };

  const clearAndCollapseSearch = () => {
    onSearchChange("");
    setSearchExpanded(false);
  };

  return (
    <div
      className={["finance-filter-bar", className].filter(Boolean).join(" ")}
      {...{ [FINANCE_FILTER_SCOPE_ATTRIBUTE]: "" }}
    >
      <div className="finance-filter-bar__row">
        <div className="finance-filter-bar__shell">
          <div
            ref={searchSlotRef}
            className={[
              "finance-filter-bar__search-slot",
              searchExpanded ? "is-expanded" : null,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <button
              type="button"
              className={[
                "finance-filter-bar__search-toggle",
                hasSearchQuery ? "is-clear" : null,
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label={
                hasSearchQuery ? "Clear search" : "Search transactions"
              }
              aria-expanded={searchExpanded}
              aria-controls={searchInputId}
              onMouseDown={(event) => {
                // Keep the input from blurring before clear/collapse runs.
                if (hasSearchQuery) event.preventDefault();
              }}
              onClick={() => {
                if (hasSearchQuery) {
                  clearAndCollapseSearch();
                  return;
                }
                if (searchExpanded) {
                  searchInputRef.current?.focus();
                  return;
                }
                setSearchExpanded(true);
              }}
            >
              {hasSearchQuery ? (
                <XCircleFillIcon size={16} />
              ) : (
                <SearchIcon size={16} />
              )}
            </button>
            {searchExpanded ? (
              <input
                ref={searchInputRef}
                id={searchInputId}
                type="search"
                className="finance-filter-bar__search"
                placeholder={searchPlaceholder}
                value={search}
                aria-label="Search transactions"
                onChange={(event) => onSearchChange(event.target.value)}
                onBlur={collapseSearchIfEmpty}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  event.preventDefault();
                  if (search.trim().length > 0) {
                    clearAndCollapseSearch();
                    return;
                  }
                  setSearchExpanded(false);
                }}
              />
            ) : null}
          </div>
          {leading ? (
            <div className="finance-filter-bar__leading">{leading}</div>
          ) : null}
          <div className="finance-filter-bar__dropdowns">
            <SearchableDropdown
              ariaLabel="Filter by category"
              className="property-dropdown"
              taskPropertyDropdownId="category"
              triggerClassName={FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME}
              multiple
              values={filterCategoryIds}
              options={categoryOptions}
              emptySelectionLabel="Categories"
              searchPlaceholder="Filter categories…"
              panelWidth={240}
              panelAlign="end"
              onValuesChange={onFilterCategoryIdsChange}
              onClear={() => onFilterCategoryIdsChange([])}
            />
            <SearchableDropdown
              ariaLabel="Filter by organization"
              className="property-dropdown"
              taskPropertyDropdownId="organization"
              triggerClassName={FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME}
              value={filterOrganizationId ?? FINANCE_FILTER_ALL_VALUE}
              options={organizationOptions}
              searchPlaceholder="Filter organization…"
              panelWidth={260}
              panelAlign="end"
              clearExemptValues={[FINANCE_FILTER_ALL_VALUE]}
              onChange={(value) =>
                onFilterOrganizationChange(
                  value === FINANCE_FILTER_ALL_VALUE ? null : value,
                )
              }
              onClear={() => onFilterOrganizationChange(null)}
            />
            <SearchableDropdown
              ariaLabel="Filter by goal"
              className="property-dropdown"
              taskPropertyDropdownId="goal"
              triggerClassName={FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME}
              value={filterGoalId ?? FINANCE_FILTER_ALL_VALUE}
              options={goalOptions}
              searchPlaceholder="Filter goals…"
              panelWidth={260}
              panelAlign="end"
              clearExemptValues={[FINANCE_FILTER_ALL_VALUE]}
              onChange={(value) =>
                onFilterGoalChange(
                  value === FINANCE_FILTER_ALL_VALUE ? null : value,
                )
              }
              onClear={() => onFilterGoalChange(null)}
            />
            <SearchableDropdown
              ariaLabel="Filter by recurring"
              className="property-dropdown"
              taskPropertyDropdownId="recurring"
              triggerClassName={FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME}
              value={filterRecurringId ?? FINANCE_FILTER_ALL_VALUE}
              options={recurringOptions}
              searchPlaceholder="Filter recurrings…"
              panelWidth={260}
              panelAlign="end"
              clearExemptValues={[FINANCE_FILTER_ALL_VALUE]}
              onChange={(value) =>
                onFilterRecurringChange(
                  value === FINANCE_FILTER_ALL_VALUE ? null : value,
                )
              }
              onClear={() => onFilterRecurringChange(null)}
            />
            <FinanceAmountRangeFilter
              amountMinCents={amountMinCents}
              amountMaxCents={amountMaxCents}
              onAmountRangeChange={onAmountRangeChange}
              amountCentsSamples={amountCentsSamples}
              panelAlign="end"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
