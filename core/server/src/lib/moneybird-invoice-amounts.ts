/**
 * Pure EUR (administration currency) aggregation helpers for Moneybird
 * invoices. Face totals (`total_price_*`) are in the invoice currency (e.g.
 * USD), so aggregates must use the `*_base` figures and never treat a foreign
 * face amount as EUR.
 */

import type {
  MoneybirdPurchaseInvoice,
  MoneybirdSalesInvoice,
} from "./moneybird-client.js";

export type MoneybirdOutstandingTotals = {
  totalCents: number;
  overdueCents: number;
  count: number;
};

/** Sales invoice states that are billed but not yet fully paid. */
export const RECEIVABLE_INVOICE_STATES = new Set([
  "open",
  "scheduled",
  "pending_payment",
  "reminded",
  "late",
]);

/**
 * Purchase invoice states that still owe money to a supplier. Kept to the
 * documented `open|late` pair so the Moneybird filter cannot be rejected.
 */
export const PAYABLE_INVOICE_STATES = new Set(["open", "late"]);

/** Moneybird `filter` values (all periods) for the outstanding queries. */
export const RECEIVABLES_FILTER = `state:${[...RECEIVABLE_INVOICE_STATES].join("|")}`;
export const PAYABLES_FILTER = `state:${[...PAYABLE_INVOICE_STATES].join("|")}`;

export function amountToCents(amount: string | null | undefined): number | null {
  if (amount == null) return null;
  const trimmed = amount.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * 100);
}

/** True when the document currency is the EUR administration currency. */
export function isEuroOrUnspecifiedCurrency(
  currency: string | null | undefined,
): boolean {
  const code = currency?.trim().toUpperCase();
  return !code || code === "EUR";
}

type InvoiceAmounts = {
  currency: string | null;
  totalPriceExclTax: string | null;
  totalPriceInclTax: string | null;
  totalPriceExclTaxBase?: string | null;
  totalPriceInclTaxBase?: string | null;
  totalUnpaid?: string | null;
  totalUnpaidBase?: string | null;
};

/**
 * Invoice total in EUR cents, excl. VAT preferred. Uses the `*_base` fields;
 * face totals are only used when the document itself is in EUR. Returns
 * `null` when no trustworthy EUR figure exists.
 */
export function invoiceBaseTotalCents(
  invoice: InvoiceAmounts,
  basis: "excl" | "incl" = "excl",
): number | null {
  const euro = isEuroOrUnspecifiedCurrency(invoice.currency);
  const candidates: Array<string | null | undefined> =
    basis === "excl"
      ? [
          invoice.totalPriceExclTaxBase,
          euro ? invoice.totalPriceExclTax : null,
          invoice.totalPriceInclTaxBase,
          euro ? invoice.totalPriceInclTax : null,
        ]
      : [
          invoice.totalPriceInclTaxBase,
          euro ? invoice.totalPriceInclTax : null,
        ];
  for (const candidate of candidates) {
    const cents = amountToCents(candidate);
    if (cents != null) return cents;
  }
  return null;
}

/** Unpaid amount in EUR cents (`total_unpaid_base`, EUR-only face fallback). */
export function invoiceUnpaidBaseCents(invoice: InvoiceAmounts): number | null {
  const fromBase = amountToCents(invoice.totalUnpaidBase);
  if (fromBase != null) return fromBase;
  if (isEuroOrUnspecifiedCurrency(invoice.currency)) {
    return amountToCents(invoice.totalUnpaid);
  }
  return null;
}

/**
 * Sum unpaid EUR amounts for documents in `states`. Documents with no
 * determinable EUR unpaid figure are skipped (never face-as-EUR).
 */
export function sumOutstandingBase(
  invoices: ReadonlyArray<
    Pick<MoneybirdSalesInvoice | MoneybirdPurchaseInvoice, "state"> &
      InvoiceAmounts
  >,
  states: ReadonlySet<string>,
): MoneybirdOutstandingTotals {
  let totalCents = 0;
  let overdueCents = 0;
  let count = 0;
  for (const invoice of invoices) {
    if (!states.has(invoice.state)) continue;
    const cents = invoiceUnpaidBaseCents(invoice);
    if (cents == null || cents <= 0) continue;
    totalCents += cents;
    count += 1;
    if (invoice.state === "late") overdueCents += cents;
  }
  return { totalCents, overdueCents, count };
}

function monthKeyFromInvoiceDate(invoiceDate: string | null): string | null {
  if (!invoiceDate || !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) return null;
  return invoiceDate.slice(0, 7);
}

/**
 * Billed invoice revenue (EUR cents, excl. VAT preferred) keyed by `YYYY-MM`
 * for `year`.
 */
export function sumBilledRevenueByMonth(
  invoices: ReadonlyArray<
    Pick<MoneybirdSalesInvoice, "state" | "invoiceDate"> & InvoiceAmounts
  >,
  year: number,
  billedStates: ReadonlySet<string>,
  into: Map<string, number> = new Map(),
): Map<string, number> {
  for (const invoice of invoices) {
    if (!billedStates.has(invoice.state)) continue;
    const month = monthKeyFromInvoiceDate(invoice.invoiceDate);
    if (!month || !month.startsWith(`${year}-`)) continue;
    const cents = invoiceBaseTotalCents(invoice) ?? 0;
    into.set(month, (into.get(month) ?? 0) + cents);
  }
  return into;
}
