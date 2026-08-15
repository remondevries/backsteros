"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon,
  XCircleFillIcon,
} from "@primer/octicons-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
} from "react";

import {
  FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME,
  FINANCE_FILTER_ALL_VALUE,
} from "./finance-transactions-filter-bar.js";
import {
  SearchableDropdown,
  type SearchableDropdownOption,
} from "./searchable-dropdown.js";

export const FINANCE_INVOICE_STATUS_OPTIONS: SearchableDropdownOption[] = [
  { value: "open", label: "Open", searchTerms: "open" },
  { value: "paid", label: "Paid", searchTerms: "paid" },
  { value: "late", label: "Expired", searchTerms: "late expired" },
  { value: "reminded", label: "Reminded", searchTerms: "reminded" },
  { value: "draft", label: "Draft", searchTerms: "draft" },
  { value: "scheduled", label: "Scheduled", searchTerms: "scheduled" },
  {
    value: "pending_payment",
    label: "Pending payment",
    searchTerms: "pending payment",
  },
  {
    value: "uncollectible",
    label: "Uncollectible",
    searchTerms: "uncollectible",
  },
];

export type FinanceInvoicesFilterBarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filterStatusIds: string[];
  onFilterStatusIdsChange: (values: string[]) => void;
  statusOptions?: SearchableDropdownOption[];
  /** `null` = all orgs; {@link FINANCE_FILTER_ALL_VALUE} is not used here. */
  filterOrganizationId: string | null;
  onFilterOrganizationChange: (value: string | null) => void;
  organizationOptions: SearchableDropdownOption[];
  /** Hide the organization dropdown (e.g. org-scoped invoices tab). */
  hideOrganizationFilter?: boolean;
  /** 1-based Moneybird list page. */
  page?: number;
  /** Last Moneybird list page for the active filter. */
  totalPages?: number;
  hasMore?: boolean;
  pageLoading?: boolean;
  onPageChange?: (page: number) => void;
  className?: string;
};

/**
 * Floating search + status/org filter toolbar for Moneybird invoices.
 * Matches the transactions filter chrome (collapsible search, pill shell).
 * Page controls sit in the same shell row as `{page} of {totalPages}`.
 */
export function FinanceInvoicesFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search invoice, reference, or contact…",
  filterStatusIds,
  onFilterStatusIdsChange,
  statusOptions = FINANCE_INVOICE_STATUS_OPTIONS,
  filterOrganizationId,
  onFilterOrganizationChange,
  organizationOptions,
  hideOrganizationFilter = false,
  page = 1,
  totalPages = 1,
  hasMore = false,
  pageLoading = false,
  onPageChange,
  className,
}: FinanceInvoicesFilterBarProps) {
  const searchInputId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchSlotRef = useRef<HTMLDivElement>(null);
  const [searchExpanded, setSearchExpanded] = useState(
    () => search.trim().length > 0,
  );
  const hasSearchQuery = search.trim().length > 0;
  const showPager = Boolean(onPageChange);
  const resolvedTotalPages = Math.max(1, totalPages, page);

  useEffect(() => {
    if (search.trim().length > 0) setSearchExpanded(true);
  }, [search]);

  useEffect(() => {
    if (!searchExpanded) return;
    const input = searchInputRef.current;
    if (!input) return;
    const frame = window.requestAnimationFrame(() => {
      input.focus();
      const length = input.value.length;
      input.setSelectionRange(length, length);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [searchExpanded]);

  const collapseSearchIfEmpty = (event: FocusEvent<HTMLInputElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && searchSlotRef.current?.contains(next)) {
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
              aria-label={hasSearchQuery ? "Clear search" : "Search invoices"}
              aria-expanded={searchExpanded}
              aria-controls={searchInputId}
              onMouseDown={(event) => {
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
                aria-label="Search invoices"
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
          <div className="finance-filter-bar__dropdowns">
            <SearchableDropdown
              ariaLabel="Filter by status"
              className="property-dropdown"
              triggerClassName={FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME}
              multiple
              values={filterStatusIds}
              options={statusOptions}
              emptySelectionLabel="Statuses"
              searchPlaceholder="Filter statuses…"
              panelWidth={220}
              panelAlign="end"
              onValuesChange={onFilterStatusIdsChange}
              onClear={() => onFilterStatusIdsChange([])}
            />
            {hideOrganizationFilter ? null : (
              <SearchableDropdown
                ariaLabel="Filter by organization"
                className="property-dropdown"
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
            )}
          </div>
          {showPager ? (
            <div
              className="finance-invoices-view__pager finance-invoices-view__pager--in-filter"
              role="navigation"
              aria-label="Invoice pages"
            >
              <button
                type="button"
                className="finance-invoices-view__pager-button"
                aria-label="Newer invoices"
                disabled={pageLoading || page <= 1}
                onClick={() => onPageChange?.(page - 1)}
              >
                <ChevronLeftIcon size={16} />
              </button>
              <span
                className="finance-invoices-view__pager-status"
                aria-live="polite"
              >
                {page} of {resolvedTotalPages}
              </span>
              <button
                type="button"
                className="finance-invoices-view__pager-button"
                aria-label="Older invoices"
                disabled={pageLoading || !hasMore}
                onClick={() => onPageChange?.(page + 1)}
              >
                <ChevronRightIcon size={16} />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
