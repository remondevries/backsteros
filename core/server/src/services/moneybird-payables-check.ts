/**
 * OS-175: read-only Moneybird payables consistency check.
 *
 * Fetches open purchase invoices/receipts (same filter as
 * `getMoneybirdOutstanding`) and applies the round-5 payables formula
 * (`sumOutstandingBase` / incl-base − payments). Compares the result to the
 * known creditors figure (~EUR 306.74). Never mutates Moneybird; never prints
 * invoice payloads.
 */

import {
  PAYABLES_FILTER,
  PAYABLE_INVOICE_STATES,
  sumOutstandingBase,
  type MoneybirdOutstandingTotals,
} from "../lib/moneybird-invoice-amounts.js";
import type { MoneybirdPurchaseInvoice } from "../lib/moneybird-client.js";

/** Known BacksterOS creditors fixture from round 5 (EUR 306.74). */
export const MONEYBIRD_PAYABLES_EXPECTED_CENTS = 30_674;

export const MONEYBIRD_PAYABLES_CHECK_DEFAULT_TOLERANCE_CENTS = 1;

export type MoneybirdPayablesCheckResult = MoneybirdOutstandingTotals & {
  currency: "EUR";
  expectedCents: number;
  deltaCents: number;
  toleranceCents: number;
  withinTolerance: boolean;
  filter: string;
};

export type MoneybirdPayablesCheckDeps = {
  /** Injectable page loader — tests pass fixtures; production pages the API. */
  listPurchaseInvoices: () => Promise<MoneybirdPurchaseInvoice[]>;
};

/**
 * Pure comparison of already-fetched purchase invoices against the expected
 * payables total.
 */
export function evaluateMoneybirdPayablesCheck(
  purchases: readonly MoneybirdPurchaseInvoice[],
  options: {
    expectedCents?: number;
    toleranceCents?: number;
  } = {},
): MoneybirdPayablesCheckResult {
  const expectedCents =
    options.expectedCents ?? MONEYBIRD_PAYABLES_EXPECTED_CENTS;
  const toleranceCents =
    options.toleranceCents ?? MONEYBIRD_PAYABLES_CHECK_DEFAULT_TOLERANCE_CENTS;
  const totals = sumOutstandingBase(purchases, PAYABLE_INVOICE_STATES);
  const deltaCents = totals.totalCents - expectedCents;
  return {
    currency: "EUR",
    ...totals,
    expectedCents,
    deltaCents,
    toleranceCents,
    withinTolerance: Math.abs(deltaCents) <= toleranceCents,
    filter: PAYABLES_FILTER,
  };
}

/**
 * Load purchase invoices via deps and evaluate. Read-only — deps must not write.
 */
export async function checkMoneybirdPayables(
  deps: MoneybirdPayablesCheckDeps,
  options: {
    expectedCents?: number;
    toleranceCents?: number;
  } = {},
): Promise<MoneybirdPayablesCheckResult> {
  const purchases = await deps.listPurchaseInvoices();
  return evaluateMoneybirdPayablesCheck(purchases, options);
}

/** Format cents as EUR for ops logs (never include invoice ids/secrets). */
export function formatPayablesCheckSummary(
  result: MoneybirdPayablesCheckResult,
): string {
  const eur = (cents: number) => (cents / 100).toFixed(2);
  return [
    `payablesEUR=${eur(result.totalCents)}`,
    `expectedEUR=${eur(result.expectedCents)}`,
    `deltaEUR=${eur(result.deltaCents)}`,
    `overdueEUR=${eur(result.overdueCents)}`,
    `count=${result.count}`,
    `withinTolerance=${result.withinTolerance}`,
    `filter=${result.filter}`,
  ].join(" ");
}
