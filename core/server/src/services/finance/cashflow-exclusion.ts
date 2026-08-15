import { and, eq, isNotNull, isNull, not, or, type SQL } from "drizzle-orm";

import {
  financialCategories,
  financialTransactions,
} from "../../db/schema.js";

export type CashflowCategoryMeta = {
  kind: string;
  listing: string;
  deletedAt?: Date | string | null;
};

/**
 * Whether a category should count toward income/expense cashflow metrics.
 * Uncategorized / missing / soft-deleted categories count. Live `transfer`
 * kind or `excluded` listing do not (balances still include those txs).
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

/**
 * Drizzle WHERE fragment: keep rows that are not live transfer/excluded.
 * Requires a LEFT JOIN of `financial_categories` on `category_id`.
 */
export function cashflowTransactionSql(): SQL {
  const excludeLiveTransferOrExcluded = and(
    isNotNull(financialCategories.id),
    isNull(financialCategories.deletedAt),
    or(
      eq(financialCategories.kind, "transfer"),
      eq(financialCategories.listing, "excluded"),
    ),
  );
  if (!excludeLiveTransferOrExcluded) {
    throw new Error("cashflowTransactionSql: unexpected empty predicate");
  }
  return not(excludeLiveTransferOrExcluded);
}

export function cashflowCategoryLeftJoinOn() {
  return eq(financialTransactions.categoryId, financialCategories.id);
}
