"use client";

import type {
  BankAccountCashflowMonth,
  MoneybirdSalesInvoiceDetail,
  MoneybirdSalesInvoiceSummary,
} from "@backsteros/contracts";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";

import type { OrganizationListItem } from "../entity-routes.js";
import {
  filterFinanceInvoices,
  type FinanceInvoiceFilterRow,
} from "../filter-finance-invoices.js";
import { isDirectRoleButtonActivationKey } from "../shortcut-guards.js";
import { getTaskStatusHeaderGradientStyle } from "../task-status-header-gradient.js";
import { useFinancePanelResize } from "../use-finance-panel-resize.js";
import { AccountIncomeExpenseChart } from "./account-income-expense-chart.js";
import {
  DROPDOWN_NONE_VALUE,
  buildOrganizationDropdownOptions,
} from "./dropdown-options.js";
import { EntityDetailLayout } from "./entity-detail-layout.js";
import { FinanceInvoiceDetailDocument } from "./finance-invoice-detail-document.js";
import { FinanceInvoicesFilterBar } from "./finance-invoices-filter-bar.js";
import { FINANCE_FILTER_ALL_VALUE } from "./finance-transactions-filter-bar.js";
import {
  FinanceYearNavigator,
  localCalendarYear,
} from "./finance-month-navigator.js";
import { SearchableDropdown } from "./searchable-dropdown.js";

const INVOICE_COLUMN_HEADERS = [
  { id: "id", label: "Invoice ID" },
  { id: "reference", label: "Reference" },
  { id: "date", label: "Invoice Date" },
  { id: "organization", label: "Organization" },
  { id: "amount", label: "Amount", align: "end" as const },
  { id: "status", label: "Status", align: "end" as const, showGap: false },
] as const;

const MONEYBIRD_INVOICE_INCOME_COLOR = "#3171de";
const FINANCE_INVOICE_DETAIL_WIDTH_KEY = "finance-invoice-detail-width";

export type FinanceInvoicesViewProps = {
  invoices: MoneybirdSalesInvoiceSummary[];
  loading?: boolean;
  error?: string | null;
  connected?: boolean;
  onOpenSettings?: () => void;
  /** 1-based Moneybird list page. */
  page?: number;
  /** Last Moneybird list page for the active filter. */
  totalPages?: number;
  /** Whether another page of invoices is available. */
  hasMore?: boolean;
  onPageChange?: (page: number) => void;
  /** Calendar year for the billed-revenue chart and Moneybird list filter. */
  year?: number;
  /** Furthest year the year navigator may reach (defaults to the current year). */
  latestYear?: number;
  onYearChange?: (year: number) => void;
  /** @deprecated Prefer {@link year}; kept for chart fallback while loading. */
  revenueYear?: number | null;
  /**
   * Monthly series for the chart: Moneybird invoiced income + compared
   * bank-account expenses (`expenseCents`).
   */
  revenueMonths?: BankAccountCashflowMonth[] | null;
  revenueLoading?: boolean;
  organizations?: OrganizationListItem[];
  /** Moneybird invoice `state` multi-filter (empty = all). */
  filterStatusIds?: string[];
  onFilterStatusIdsChange?: (values: string[]) => void;
  onLinkMoneybirdContact?: (
    moneybirdContactId: string,
    organizationId: string | null,
  ) => void | Promise<void>;
  onCreateOrganizationFromQuery?: (
    query: string,
  ) =>
    | Promise<{ id: string } | null | undefined>
    | { id: string }
    | null
    | undefined;
  /** Selected Moneybird invoice id (controlled or internal). */
  selectedInvoiceId?: string | null;
  onSelectedInvoiceChange?: (invoiceId: string | null) => void;
  /** Lazy-loaded detail for the selected invoice. */
  invoiceDetail?: MoneybirdSalesInvoiceDetail | null;
  invoiceDetailLoading?: boolean;
  invoiceDetailError?: string | null;
  /**
   * When true, skip EntityDetailLayout and the revenue chart — for embedding
   * under organization (or similar) section tabs.
   */
  embedded?: boolean;
  /** Hide the organization filter dropdown (list is already org-scoped). */
  hideOrganizationFilter?: boolean;
};

function formatInvoiceAmount(
  amount: string | null,
  currency: string | null,
): string {
  if (!amount) return "—";
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return amount;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency && currency.length === 3 ? currency : "EUR",
    }).format(numeric);
  } catch {
    return `${amount} ${currency ?? ""}`.trim();
  }
}

const INVOICE_STATE_LABELS: Record<string, string> = {
  open: "Open",
  paid: "Paid",
  late: "Expired",
  reminded: "Reminded",
  draft: "Draft",
  scheduled: "Scheduled",
  pending_payment: "Pending payment",
  uncollectible: "Uncollectible",
};

function formatInvoiceState(state: string): string {
  return (
    INVOICE_STATE_LABELS[state] ??
    state.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}

function invoiceStateClassName(state: string): string {
  const safe = state.replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "unknown";
  return `finance-invoice-state finance-invoice-state--${safe}`;
}

function InvoiceColumnHeader({
  label,
  align = "start",
  showGap = true,
}: {
  label: string;
  align?: "start" | "end";
  showGap?: boolean;
}) {
  return (
    <span
      className={[
        "finance-invoices-table__th",
        align === "end" ? "finance-invoices-table__th--end" : null,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {align === "end" ? (
        <span className="finance-invoices-table__th-spacer" aria-hidden="true" />
      ) : null}
      <span className="finance-invoices-table__th-label">{label}</span>
      {showGap ? (
        <span className="finance-invoices-table__th-gap" aria-hidden="true" />
      ) : null}
    </span>
  );
}

export function FinanceInvoicesView({
  invoices,
  loading = false,
  error = null,
  connected = false,
  onOpenSettings,
  page = 1,
  totalPages = 1,
  hasMore = false,
  onPageChange,
  year: yearProp,
  latestYear: latestYearProp,
  onYearChange,
  revenueYear = null,
  revenueMonths = null,
  revenueLoading = false,
  organizations = [],
  filterStatusIds: filterStatusIdsProp,
  onFilterStatusIdsChange,
  onLinkMoneybirdContact,
  onCreateOrganizationFromQuery,
  selectedInvoiceId: selectedInvoiceIdProp,
  onSelectedInvoiceChange,
  invoiceDetail = null,
  invoiceDetailLoading = false,
  invoiceDetailError = null,
  embedded = false,
  hideOrganizationFilter = false,
}: FinanceInvoicesViewProps) {
  /** Optimistic Moneybird contact → organization id (null = cleared). */
  const [linkOverrides, setLinkOverrides] = useState<
    Record<string, string | null>
  >({});
  const [filterSearch, setFilterSearch] = useState("");
  const [filterOrganizationId, setFilterOrganizationId] = useState<
    string | null
  >(null);
  const [localFilterStatusIds, setLocalFilterStatusIds] = useState<string[]>(
    [],
  );
  const [localYear, setLocalYear] = useState(() => localCalendarYear());
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);

  const latestYear = latestYearProp ?? localCalendarYear();
  const year = yearProp ?? revenueYear ?? localYear;
  const setYear = onYearChange ?? setLocalYear;

  const filterStatusIds = filterStatusIdsProp ?? localFilterStatusIds;
  const setFilterStatusIds =
    onFilterStatusIdsChange ?? setLocalFilterStatusIds;

  const selectedInvoiceId =
    selectedInvoiceIdProp !== undefined
      ? selectedInvoiceIdProp
      : localSelectedId;
  const setSelectedInvoiceId = (invoiceId: string | null) => {
    if (selectedInvoiceIdProp === undefined) {
      setLocalSelectedId(invoiceId);
    }
    onSelectedInvoiceChange?.(invoiceId);
  };

  const {
    containerRef,
    detailPaneRef,
    detailWidth,
    beginResize,
    resetWidth,
  } = useFinancePanelResize(FINANCE_INVOICE_DETAIL_WIDTH_KEY);

  const emptyMessage = useMemo(() => {
    if (!connected) {
      return "Connect Moneybird in Settings → Integrations to load sales invoices.";
    }
    if (loading) return "Loading invoices…";
    if (error) return error;
    return "No sales invoices returned from Moneybird.";
  }, [connected, error, loading]);

  const orgOptions = useMemo(
    () => buildOrganizationDropdownOptions(organizations),
    [organizations],
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
        label: "Unlinked",
        searchTerms: "unlinked none no organization",
      },
      ...orgOptions,
    ],
    [orgOptions],
  );

  const orgById = useMemo(() => {
    const map = new Map<string, OrganizationListItem>();
    for (const org of organizations) map.set(org.id, org);
    return map;
  }, [organizations]);

  const orgByMoneybirdContactId = useMemo(() => {
    const map = new Map<string, OrganizationListItem>();
    for (const org of organizations) {
      const contactId = org.moneybirdContactId?.trim();
      if (contactId) map.set(contactId, org);
    }
    return map;
  }, [organizations]);

  useEffect(() => {
    setLinkOverrides((current) => {
      let changed = false;
      const next = { ...current };
      for (const [contactId, orgId] of Object.entries(current)) {
        const linked = orgByMoneybirdContactId.get(contactId);
        if ((linked?.id ?? null) === orgId) {
          delete next[contactId];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [orgByMoneybirdContactId]);

  useEffect(() => {
    if (
      selectedInvoiceId &&
      !invoices.some((invoice) => invoice.id === selectedInvoiceId)
    ) {
      setSelectedInvoiceId(null);
    }
  }, [invoices, selectedInvoiceId]);

  useEffect(() => {
    if (!selectedInvoiceId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (
        event.target instanceof HTMLElement &&
        (event.target.closest("input, textarea, [contenteditable=true]") ||
          event.target.closest("[role='listbox']"))
      ) {
        return;
      }
      event.preventDefault();
      setSelectedInvoiceId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedInvoiceId]);

  const createOrganizationFromQueryLabel = onCreateOrganizationFromQuery
    ? (query: string) => `Create “${query.trim()}”`
    : undefined;

  function resolveLinkedOrg(
    moneybirdContactId: string | null,
  ): OrganizationListItem | null {
    if (!moneybirdContactId) return null;
    if (
      Object.prototype.hasOwnProperty.call(linkOverrides, moneybirdContactId)
    ) {
      const overrideId = linkOverrides[moneybirdContactId];
      return overrideId ? (orgById.get(overrideId) ?? null) : null;
    }
    return orgByMoneybirdContactId.get(moneybirdContactId) ?? null;
  }

  const invoiceRows = useMemo((): FinanceInvoiceFilterRow[] => {
    return invoices.map((invoice) => {
      const moneybirdContactId = invoice.contactId?.trim() || null;
      let linkedOrg: OrganizationListItem | null = null;
      if (moneybirdContactId) {
        if (
          Object.prototype.hasOwnProperty.call(linkOverrides, moneybirdContactId)
        ) {
          const overrideId = linkOverrides[moneybirdContactId];
          linkedOrg = overrideId ? (orgById.get(overrideId) ?? null) : null;
        } else {
          linkedOrg = orgByMoneybirdContactId.get(moneybirdContactId) ?? null;
        }
      }
      return {
        ...invoice,
        linkedOrganizationId: linkedOrg?.id ?? null,
        linkedOrganizationName: linkedOrg?.name ?? null,
      };
    });
  }, [invoices, linkOverrides, orgById, orgByMoneybirdContactId]);

  const filteredInvoices = useMemo(
    () =>
      filterFinanceInvoices(invoiceRows, {
        search: filterSearch,
        organizationId: filterOrganizationId,
      }),
    [filterOrganizationId, filterSearch, invoiceRows],
  );

  const hasClientFilters =
    filterSearch.trim().length > 0 || filterOrganizationId != null;

  const showFilterBar = connected;
  const selectedSummary =
    invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null;

  const body = (
      <div
        ref={containerRef}
        className={[
          "finance-invoices-view",
          embedded ? "finance-invoices-view--embedded" : null,
          selectedSummary ? "has-selection" : null,
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
        <div className="finance-categories-view__list-pane finance-invoices-view__list-pane">
          <FinanceYearNavigator
            year={year}
            latestYear={latestYear}
            onChange={setYear}
            aria-label="Invoice year"
          />

          {!embedded && connected ? (
            <AccountIncomeExpenseChart
              className="finance-invoices-view__chart"
              cashflowYear={year}
              cashflowMonths={revenueMonths}
              loading={revenueLoading}
              fullYear
              incomeColor={MONEYBIRD_INVOICE_INCOME_COLOR}
              incomeSeriesLabel="Invoiced"
              expenseSeriesLabel="Expenses"
              ariaLabel="Monthly invoiced revenue and account expenses"
              emptyMessage={`No invoiced revenue or account expenses in ${year} yet.`}
            />
          ) : null}

          {!connected && onOpenSettings ? (
            <div className="finance-invoices-view__toolbar">
              <div className="finance-invoices-view__actions">
                <button type="button" onClick={onOpenSettings}>
                  Open Moneybird settings
                </button>
              </div>
            </div>
          ) : null}

          {error && connected ? (
            <p className="finance-empty" role="alert">
              {error}
            </p>
          ) : null}

          {!loading && invoices.length === 0 ? (
            <p className="finance-empty">{emptyMessage}</p>
          ) : null}

          {!loading &&
          invoices.length > 0 &&
          filteredInvoices.length === 0 &&
          hasClientFilters ? (
            <p className="finance-empty">No matching invoices.</p>
          ) : null}

          {filteredInvoices.length > 0 ? (
            <div className="finance-invoices-table-shell">
              <div
                className="status-group-header-row finance-invoices-columns-header"
                style={getTaskStatusHeaderGradientStyle("ready_to_start")}
              >
                <div className="finance-invoices-columns-header__cols">
                  {INVOICE_COLUMN_HEADERS.map((column, index) => (
                    <InvoiceColumnHeader
                      key={column.id}
                      label={column.label}
                      align={"align" in column ? column.align : "start"}
                      showGap={
                        "showGap" in column
                          ? column.showGap
                          : index < INVOICE_COLUMN_HEADERS.length - 1
                      }
                    />
                  ))}
                </div>
              </div>
              <ul className="finance-tx-list finance-invoices-list" role="list">
                {filteredInvoices.map((invoice) => {
                  const moneybirdContactId =
                    invoice.contactId?.trim() || null;
                  const linkedOrg = resolveLinkedOrg(moneybirdContactId);
                  const fallbackLabel =
                    invoice.contactName?.trim() || "No organization";
                  const isSelected = selectedInvoiceId === invoice.id;

                  return (
                    <li
                      key={invoice.id}
                      className={[
                        "finance-tx-row",
                        "finance-invoices-row",
                        isSelected ? "is-panel-selected" : null,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <div
                        className="finance-tx-row__line"
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSelected}
                        onClick={() => setSelectedInvoiceId(invoice.id)}
                        onKeyDown={(event) => {
                          if (!isDirectRoleButtonActivationKey(event)) return;
                          event.preventDefault();
                          setSelectedInvoiceId(invoice.id);
                        }}
                      >
                        <div className="finance-tx-row__data finance-invoices-row__data">
                          <div className="finance-invoices-row__cell finance-invoices-row__cell--id">
                            <span className="finance-invoices-row__primary">
                              {invoice.invoiceId ?? "Draft"}
                            </span>
                          </div>
                          <div className="finance-invoices-row__cell finance-invoices-row__cell--reference">
                            {invoice.reference ?? "—"}
                          </div>
                          <div className="finance-invoices-row__cell finance-invoices-row__cell--date">
                            <span className="finance-tx-row__date">
                              {invoice.invoiceDate ?? "—"}
                            </span>
                          </div>
                          <div className="finance-invoices-row__cell finance-invoices-row__cell--org finance-tx-row__cell finance-tx-row__cell--org">
                            <div className="finance-tx-row__cell-inner finance-tx-row__cell-inner--org">
                              {onLinkMoneybirdContact &&
                              moneybirdContactId &&
                              !hideOrganizationFilter ? (
                                <SearchableDropdown
                                  ariaLabel="Organization"
                                  className="property-dropdown"
                                  triggerClassName="property-dropdown-trigger--inline-chip finance-tx-row__dropdown-trigger finance-tx-row__org-trigger"
                                  value={
                                    linkedOrg?.id ?? DROPDOWN_NONE_VALUE
                                  }
                                  options={orgOptions}
                                  searchPlaceholder="Organization"
                                  panelWidth={260}
                                  createFromQueryLabel={
                                    createOrganizationFromQueryLabel
                                  }
                                  onCreateFromQuery={
                                    onCreateOrganizationFromQuery
                                      ? (query) => {
                                          void Promise.resolve(
                                            onCreateOrganizationFromQuery(
                                              query,
                                            ),
                                          ).then((created) => {
                                            if (!created?.id) return;
                                            setLinkOverrides((current) => ({
                                              ...current,
                                              [moneybirdContactId]:
                                                created.id,
                                            }));
                                            void onLinkMoneybirdContact(
                                              moneybirdContactId,
                                              created.id,
                                            );
                                          });
                                        }
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
                                        linkedOrg ? "is-filled" : "is-empty",
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
                                        {linkedOrg
                                          ? (selected?.label ??
                                            linkedOrg.name)
                                          : fallbackLabel}
                                      </span>
                                    </button>
                                  )}
                                  onChange={(value) => {
                                    const nextOrgId =
                                      !value || value === DROPDOWN_NONE_VALUE
                                        ? null
                                        : value;
                                    setLinkOverrides((current) => ({
                                      ...current,
                                      [moneybirdContactId]: nextOrgId,
                                    }));
                                    void onLinkMoneybirdContact(
                                      moneybirdContactId,
                                      nextOrgId,
                                    );
                                  }}
                                />
                              ) : (
                                <span className="finance-invoices-row__org-fallback">
                                  {linkedOrg?.name ??
                                    invoice.contactName ??
                                    "—"}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="finance-invoices-row__cell finance-invoices-row__cell--amount">
                            <span className="finance-tx-row__amount is-credit">
                              {formatInvoiceAmount(
                                invoice.totalPriceInclTax,
                                invoice.currency,
                              )}
                            </span>
                          </div>
                          <div className="finance-invoices-row__cell finance-invoices-row__cell--status">
                            <span
                              className={invoiceStateClassName(invoice.state)}
                            >
                              {formatInvoiceState(invoice.state)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {showFilterBar ? (
            <div className="finance-bulk-bar-dock finance-tx-chrome-dock finance-invoices-view__filter-dock">
              <FinanceInvoicesFilterBar
                className="finance-filter-bar--floating"
                search={filterSearch}
                onSearchChange={setFilterSearch}
                filterStatusIds={filterStatusIds}
                onFilterStatusIdsChange={setFilterStatusIds}
                filterOrganizationId={filterOrganizationId}
                onFilterOrganizationChange={setFilterOrganizationId}
                organizationOptions={filterOrganizationOptions}
                hideOrganizationFilter={hideOrganizationFilter}
                page={page}
                totalPages={totalPages}
                hasMore={hasMore}
                pageLoading={loading}
                onPageChange={onPageChange}
              />
            </div>
          ) : null}
        </div>

        {selectedSummary ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize invoice panel"
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
          <FinanceInvoiceDetailDocument
            summary={selectedSummary}
            detail={
              invoiceDetail && invoiceDetail.id === selectedInvoiceId
                ? invoiceDetail
                : null
            }
            loading={invoiceDetailLoading}
            error={invoiceDetailError}
          />
        </div>
      </div>
  );

  if (embedded) return body;
  return (
    <EntityDetailLayout sectionLabel="Finance" title="Invoices">
      {body}
    </EntityDetailLayout>
  );
}
