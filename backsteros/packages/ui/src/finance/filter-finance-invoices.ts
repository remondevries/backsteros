import type { MoneybirdSalesInvoiceSummary } from "@backsteros/contracts";

import { DROPDOWN_NONE_VALUE } from "../components/dropdowns/dropdown-options.js";
import {
  parseMoneyAmountToCents,
  type DocumentSummaryLine,
} from "./document-summary-stats.js";

/** Billed sales-invoice states (matches Moneybird revenue series). */
export const BILLED_INVOICE_STATES = new Set([
  "open",
  "scheduled",
  "pending_payment",
  "reminded",
  "late",
  "paid",
]);

export function isBilledInvoiceState(state: string | null | undefined): boolean {
  if (!state) return false;
  return BILLED_INVOICE_STATES.has(state);
}

/**
 * Row display: excl. VAT in the invoice's own `currency` (may be USD etc.).
 * Do not use for aggregates — use {@link invoiceAmountExclVatBase}.
 */
export function invoiceAmountExclVat(
  invoice: Pick<
    MoneybirdSalesInvoiceSummary,
    "totalPriceExclTax" | "totalPriceInclTax"
  >,
): string | null {
  return invoice.totalPriceExclTax ?? invoice.totalPriceInclTax ?? null;
}

type InvoiceBaseAmountFields = Pick<
  MoneybirdSalesInvoiceSummary,
  "totalPriceExclTax" | "totalPriceInclTax" | "currency"
> &
  Partial<
    Pick<
      MoneybirdSalesInvoiceSummary,
      "totalPriceExclTaxBase" | "totalPriceInclTaxBase"
    >
  >;

function isEuroOrUnspecified(currency: string | null | undefined): boolean {
  const code = currency?.trim().toUpperCase();
  return !code || code === "EUR";
}

/**
 * Aggregate amount in EUR (administration currency), excl. VAT preferred.
 * Prefers Moneybird `*_base` totals; face totals are only used when the
 * invoice itself is in EUR so a USD amount is never summed as EUR.
 */
export function invoiceAmountExclVatBase(
  invoice: InvoiceBaseAmountFields,
): string | null {
  const euro = isEuroOrUnspecified(invoice.currency);
  return (
    invoice.totalPriceExclTaxBase ??
    (euro ? invoice.totalPriceExclTax : null) ??
    invoice.totalPriceInclTaxBase ??
    (euro ? invoice.totalPriceInclTax : null) ??
    null
  );
}

/** Customer-share / month-total lines: billed states only, EUR excl. VAT. */
export function buildInvoiceSummaryLines(
  rows: ReadonlyArray<FinanceInvoiceFilterRow>,
): DocumentSummaryLine[] {
  return rows
    .filter((invoice) => isBilledInvoiceState(invoice.state))
    .map((invoice) => {
      const linkedName = invoice.linkedOrganizationName?.trim() || null;
      const contactName = invoice.contactName?.trim() || null;
      const label = linkedName || contactName || "Unknown";
      const key =
        invoice.linkedOrganizationId?.trim() ||
        invoice.contactId?.trim() ||
        label.toLowerCase();
      return {
        id: invoice.id,
        date: invoice.invoiceDate,
        amountCents: parseMoneyAmountToCents(invoiceAmountExclVatBase(invoice)),
        customerKey: key,
        customerLabel: label,
      };
    });
}

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
