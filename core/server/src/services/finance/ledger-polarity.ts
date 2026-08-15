/**
 * Credit-card CSV exports (e.g. AMEX NL) use issuer/liability polarity:
 * charges are positive, payments/refunds are negative.
 *
 * BacksterOS ledgers use cashflow polarity (same as bank accounts):
 * spend/debt increase is negative, payments that reduce debt are positive.
 */

export function toCashflowAmountCents(
  amountCents: number,
  accountType: string | null | undefined,
): number {
  if (accountType === "credit_card") return -amountCents;
  return amountCents;
}
