/**
 * Category totals use **net-spend polarity**:
 * - positive = net outflow (debit / money spent)
 * - negative = net inflow (credit / money received)
 *
 * Ledger `amountCents` is cashflow polarity (negative = spend). Convert with
 * {@link toCategoryNetSpendCents} so reimbursements in the same category
 * reduce the shown spend (e.g. dinner −€100 + repayment +€40 → €60 spend).
 */

export function toCategoryNetSpendCents(amountCents: number): number {
  if (amountCents === 0) return 0;
  return -amountCents;
}

/** Absolute magnitude for display; 0 when net is zero. */
export function categoryNetSpendAbsCents(netSpendCents: number): number {
  return Math.abs(netSpendCents);
}

/**
 * Cents for currency formatting in cashflow polarity (same as ledger rows):
 * spend is negative (shows "−"), income is positive.
 */
export function categoryNetSpendDisplayCents(netSpendCents: number): number {
  if (netSpendCents === 0) return 0;
  return -netSpendCents;
}

export type CategoryNetSpendSign = "debit" | "credit" | "zero";

export function categoryNetSpendSign(
  netSpendCents: number,
): CategoryNetSpendSign {
  if (netSpendCents > 0) return "debit";
  if (netSpendCents < 0) return "credit";
  return "zero";
}
