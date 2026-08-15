import type { MoneybirdSalesInvoiceSummary } from "@backsteros/contracts";

import { DROPDOWN_NONE_VALUE } from "./components/dropdown-options.js";

export type FinanceInvoiceListFilters = {
  search: string;
  /**
   * `null` = all organizations.
   * {@link DROPDOWN_NONE_VALUE} = no linked organization.
   * Otherwise a BacksterOS organization id.
   */
  organizationId: string | null;
};

export type FinanceInvoiceFilterRow = MoneybirdSalesInvoiceSummary & {
  /** Resolved linked organization id when known (optimistic overrides included). */
  linkedOrganizationId?: string | null;
  linkedOrganizationName?: string | null;
};

function matchesSearch(row: FinanceInvoiceFilterRow, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    row.invoiceId,
    row.reference,
    row.contactName,
    row.linkedOrganizationName,
    row.state,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function matchesOrganization(
  row: FinanceInvoiceFilterRow,
  organizationId: string | null,
): boolean {
  if (organizationId == null) return true;
  const linkedId = row.linkedOrganizationId ?? null;
  if (organizationId === DROPDOWN_NONE_VALUE) return linkedId == null;
  return linkedId === organizationId;
}

/** Client-side filter for already-loaded Moneybird invoice rows. */
export function filterFinanceInvoices(
  rows: readonly FinanceInvoiceFilterRow[],
  filters: FinanceInvoiceListFilters,
): FinanceInvoiceFilterRow[] {
  return rows.filter(
    (row) =>
      matchesSearch(row, filters.search) &&
      matchesOrganization(row, filters.organizationId),
  );
}

/**
 * Build Moneybird sales-invoice `filter` for a calendar year, optionally
 * restricted to one or more `state:` values and/or a Moneybird contact.
 */
export function buildMoneybirdInvoicesFilter(
  year: number,
  statusIds: readonly string[] = [],
  options?: { contactId?: string | null },
): string {
  const parts = [`period:${year}0101..${year}1231`];
  const contactId = options?.contactId?.trim();
  if (contactId) parts.push(`contact_id:${contactId}`);
  const states = [
    ...new Set(
      statusIds
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  ];
  if (states.length > 0) parts.push(`state:${states.join("|")}`);
  return parts.join(",");
}

/** Moneybird filter that lists invoices for a contact across all periods. */
export function buildMoneybirdContactInvoicesFilter(
  contactId: string,
): string {
  return `contact_id:${contactId.trim()}`;
}
