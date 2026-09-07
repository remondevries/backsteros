import { isBalanceAffectingFinancialSettlement } from "@backsteros/contracts";

import type { FinanceCategoryRow } from "./finance-categories";

/**
 * Cashflow inclusion rules (desktop `cashflow-exclusion` parity).
 * Uncategorized counts; live `transfer` / `excluded` categories do not.
 * Void Moneybird settlements (refused / cancelled / …) never count.
 */

export function isCashflowCategory(
  category: Pick<FinanceCategoryRow, "kind" | "listing"> | null | undefined,
): boolean {
  if (!category) return true;
  if (category.kind === "transfer") return false;
  if (category.listing === "excluded") return false;
  return true;
}

/** Category ids that must be omitted from income/expense sums. */
export function buildNonCashflowCategoryIdSet(
  categories: ReadonlyArray<Pick<FinanceCategoryRow, "id" | "kind" | "listing">>,
): Set<string> {
  const ids = new Set<string>();
  for (const category of categories) {
    if (!isCashflowCategory(category)) ids.add(category.id);
  }
  return ids;
}

export function isCashflowTransaction(
  tx: {
    categoryId?: string | null;
    settlementState?: string | null;
  },
  nonCashflowCategoryIds: ReadonlySet<string>,
): boolean {
  if (!isBalanceAffectingFinancialSettlement(tx.settlementState)) return false;
  if (!tx.categoryId) return true;
  return !nonCashflowCategoryIds.has(tx.categoryId);
}
