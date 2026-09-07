import type { FinancialCategory } from "@backsteros/contracts";
import { isBalanceAffectingFinancialSettlement } from "@backsteros/contracts";

export type CashflowCategoryMeta = Pick<
  FinancialCategory,
  "id" | "kind" | "listing"
> & {
  deletedAt?: string | null;
};

/**
 * Whether a category should count toward income/expense cashflow metrics.
 * Uncategorized / missing / soft-deleted categories count. Live `transfer`
 * kind or `excluded` listing do not.
 */
export function isCashflowCategory(
  category: CashflowCategoryMeta | null | undefined,
): boolean {
  if (!category) return true;
  if (category.deletedAt != null) return true;
  if (category.kind === "transfer") return false;
  if (category.listing === "excluded") return false;
  return true;
}

/** Category ids that must be omitted from income/expense sums. */
export function buildNonCashflowCategoryIdSet(
  categories: ReadonlyArray<CashflowCategoryMeta>,
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
