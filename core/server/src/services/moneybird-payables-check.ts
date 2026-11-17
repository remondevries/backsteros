/**
 * OS-175 / OS-184: read-only Moneybird payables consistency check.
 *
 * Fetches open purchase invoices/receipts (same filter as
 * `getMoneybirdOutstanding`) and applies `sumPurchasePayablesBase`
 * (incl-base − payments). Optionally compares to a caller-supplied expected
 * total — there is no hard-coded product expected figure. Never mutates
 * Moneybird; never prints invoice payloads.
 */

import {
  PAYABLES_FILTER,
  sumPurchasePayablesBase,
  type MoneybirdOutstandingTotals,
} from "../lib/moneybird-invoice-amounts.js";
import type { MoneybirdPurchaseInvoice } from "../lib/moneybird-client.js";

export const MONEYBIRD_PAYABLES_CHECK_DEFAULT_TOLERANCE_CENTS = 1;

export type MoneybirdPayablesCheckResult = MoneybirdOutstandingTotals & {
  currency: "EUR";
  /** Present only when the caller passed `expectedCents`. */
  expectedCents: number | null;
  deltaCents: number | null;
  toleranceCents: number | null;
  withinTolerance: boolean | null;
  filter: string;
};

export type MoneybirdPayablesCheckDeps = {
  /** Injectable page loader — tests pass fixtures; production pages the API. */
  listPurchaseInvoices: () => Promise<MoneybirdPurchaseInvoice[]>;
};

/**
 * Pure open-payables totals from already-fetched purchase invoices.
 * Same computation as the finance outstanding display (OS-184).
 */
export function computeMoneybirdPayablesTotals(
  purchases: readonly MoneybirdPurchaseInvoice[],
): MoneybirdOutstandingTotals {
  return sumPurchasePayablesBase(purchases);
}

/**
 * Pure evaluation of already-fetched purchase invoices. When `expectedCents`
 * is omitted, returns live totals only (no pass/fail against a baseline).
 */
export function evaluateMoneybirdPayablesCheck(
  purchases: readonly MoneybirdPurchaseInvoice[],
  options: {
    expectedCents?: number;
    toleranceCents?: number;
  } = {},
): MoneybirdPayablesCheckResult {
  const totals = computeMoneybirdPayablesTotals(purchases);
  const expectedCents =
    options.expectedCents === undefined ? null : options.expectedCents;
  const toleranceCents =
    expectedCents == null
      ? null
      : (options.toleranceCents ??
        MONEYBIRD_PAYABLES_CHECK_DEFAULT_TOLERANCE_CENTS);
  const deltaCents =
    expectedCents == null ? null : totals.totalCents - expectedCents;
  return {
    currency: "EUR",
    ...totals,
    expectedCents,
    deltaCents,
    toleranceCents,
    withinTolerance:
      deltaCents == null || toleranceCents == null
        ? null
        : Math.abs(deltaCents) <= toleranceCents,
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
  const parts = [
    `payablesEUR=${eur(result.totalCents)}`,
    `overdueEUR=${eur(result.overdueCents)}`,
    `count=${result.count}`,
    `filter=${result.filter}`,
  ];
  if (
    result.expectedCents != null &&
    result.deltaCents != null &&
    result.withinTolerance != null
  ) {
    parts.splice(
      1,
      0,
      `expectedEUR=${eur(result.expectedCents)}`,
      `deltaEUR=${eur(result.deltaCents)}`,
      `withinTolerance=${result.withinTolerance}`,
    );
  }
  return parts.join(" ");
}
