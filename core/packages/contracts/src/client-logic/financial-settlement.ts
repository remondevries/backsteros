/**
 * Moneybird `settlement_state` values that never cleared (refused / cancelled /
 * stale / failed collections). These ledger rows stay visible for classification
 * but must not affect balances, cashflow, or category totals.
 *
 * @see https://developer.moneybird.com/api/financial-mutations
 */
export const VOID_FINANCIAL_SETTLEMENT_STATES = [
  "refused",
  "cancelled",
  "canceled",
  "expired",
  "failed",
  "error",
  "returned",
] as const;

export type VoidFinancialSettlementState =
  (typeof VOID_FINANCIAL_SETTLEMENT_STATES)[number];

const VOID_SETTLEMENT_SET = new Set<string>(VOID_FINANCIAL_SETTLEMENT_STATES);

/** Normalize Moneybird / ledger settlement labels for comparison. */
export function normalizeFinancialSettlementState(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

/**
 * Whether a settlement state means money never cleared (or the attempt failed).
 * Null / unknown / settled / pending / authorised / captured → not void.
 */
export function isVoidFinancialSettlement(
  settlementState: string | null | undefined,
): boolean {
  const normalized = normalizeFinancialSettlementState(settlementState);
  if (!normalized) return false;
  return VOID_SETTLEMENT_SET.has(normalized);
}

/** True when the amount should count toward balances / cashflow / categories. */
export function isBalanceAffectingFinancialSettlement(
  settlementState: string | null | undefined,
): boolean {
  return !isVoidFinancialSettlement(settlementState);
}
