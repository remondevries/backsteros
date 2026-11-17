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
 * Purchase invoice states that still owe money to a supplier. `new` (booked,
 * not yet paid) and `pending_payment` (payment initiated, not yet matched) are
 * included alongside `open|late`.
 */
export const PAYABLE_INVOICE_STATES = new Set([
  "new",
  "open",
  "pending_payment",
  "late",
]);

/** States whose outstanding amount counts as overdue. */
export const OVERDUE_INVOICE_STATES = new Set(["late", "reminded"]);

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
  payments?: ReadonlyArray<{
    price: string | null;
    priceBase: string | null;
  }> | null;
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
 * Sum of payments in EUR cents: `price_base`, or the face `price` only when
 * the document is in EUR. `null` when any payment has no trustworthy EUR
 * figure (never face-as-EUR).
 */
export function invoicePaymentsBaseCents(invoice: InvoiceAmounts): number | null {
  const euro = isEuroOrUnspecifiedCurrency(invoice.currency);
  let total = 0;
  for (const payment of invoice.payments ?? []) {
    const cents =
      amountToCents(payment.priceBase) ??
      (euro ? amountToCents(payment.price) : null);
    if (cents == null) return null;
    total += cents;
  }
  return total;
}

/**
 * Outstanding EUR cents for a sales invoice. Prefers `total_unpaid_base`
 * when Moneybird provides it; otherwise falls through to totals − payments.
 */
export function invoiceOutstandingBaseCents(
  invoice: InvoiceAmounts,
): number | null {
  const unpaid = invoiceUnpaidBaseCents(invoice);
  if (unpaid != null) return unpaid;
  return purchaseInvoiceOutstandingBaseCents(invoice);
}

/**
 * Outstanding EUR cents for a Moneybird purchase invoice / receipt.
 *
 * Purchase invoices do not expose `total_unpaid` / `total_unpaid_base` (OS-184).
 * Always derive: incl-VAT base total (excl as a last resort) minus
 * `payments[].price_base`. Never trust unpaid fields — a spurious `0` would
 * make payables display EUR 0.
 */
export function purchaseInvoiceOutstandingBaseCents(
  invoice: InvoiceAmounts,
): number | null {
  const total =
    invoiceBaseTotalCents(invoice, "incl") ??
    invoiceBaseTotalCents(invoice, "excl");
  if (total == null) return null;
  const paid = invoicePaymentsBaseCents(invoice);
  if (paid == null) return null;
  return total - paid;
}

type OutstandingInvoice = Pick<
  MoneybirdSalesInvoice | MoneybirdPurchaseInvoice,
  "state"
> &
  InvoiceAmounts;

function sumOutstandingWith(
  invoices: ReadonlyArray<OutstandingInvoice>,
  states: ReadonlySet<string>,
  outstandingCents: (invoice: InvoiceAmounts) => number | null,
): MoneybirdOutstandingTotals {
  let totalCents = 0;
  let overdueCents = 0;
  let count = 0;
  for (const invoice of invoices) {
    if (!states.has(invoice.state)) continue;
    const cents = outstandingCents(invoice);
    if (cents == null || cents <= 0) continue;
    totalCents += cents;
    count += 1;
    if (OVERDUE_INVOICE_STATES.has(invoice.state)) overdueCents += cents;
  }
  return { totalCents, overdueCents, count };
}

/**
 * Sum outstanding EUR amounts for documents in `states` using sales-invoice
 * unpaid fields when present. Documents with no determinable EUR figure are
 * skipped (never face-as-EUR). `late` and `reminded` count as overdue.
 */
export function sumOutstandingBase(
  invoices: ReadonlyArray<OutstandingInvoice>,
  states: ReadonlySet<string>,
): MoneybirdOutstandingTotals {
  return sumOutstandingWith(invoices, states, invoiceOutstandingBaseCents);
}

/**
 * Open payables from purchase invoices: totals − payments for payable states.
 * Shared by the finance outstanding display and the read-only payables check.
 */
export function sumPurchasePayablesBase(
  invoices: ReadonlyArray<OutstandingInvoice>,
  states: ReadonlySet<string> = PAYABLE_INVOICE_STATES,
): MoneybirdOutstandingTotals {
  return sumOutstandingWith(
    invoices,
    states,
    purchaseInvoiceOutstandingBaseCents,
  );
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
