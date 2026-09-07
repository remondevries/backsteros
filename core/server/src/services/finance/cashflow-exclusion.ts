import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  not,
  or,
  type SQL,
} from "drizzle-orm";

import {
  VOID_FINANCIAL_SETTLEMENT_STATES,
  isBalanceAffectingFinancialSettlement,
} from "@backsteros/contracts";

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
 * Drizzle WHERE: omit refused / cancelled / failed Moneybird settlements.
 * Null settlement_state (CSV imports) counts as settled.
 */
export function balanceAffectingTransactionSql(): SQL {
  const voidStates = [...VOID_FINANCIAL_SETTLEMENT_STATES];
  const excludeVoid = and(
    isNotNull(financialTransactions.settlementState),
    inArray(financialTransactions.settlementState, voidStates),
  );
  if (!excludeVoid) {
    throw new Error("balanceAffectingTransactionSql: unexpected empty predicate");
  }
  return not(excludeVoid);
}

/**
 * Drizzle WHERE fragment: keep rows that are not live transfer/excluded.
 * Requires a LEFT JOIN of `financial_categories` on `category_id`.
 */
export function cashflowCategorySql(): SQL {
  const excludeLiveTransferOrExcluded = and(
    isNotNull(financialCategories.id),
    isNull(financialCategories.deletedAt),
    or(
      eq(financialCategories.kind, "transfer"),
      eq(financialCategories.listing, "excluded"),
    ),
  );
  if (!excludeLiveTransferOrExcluded) {
    throw new Error("cashflowCategorySql: unexpected empty predicate");
  }
  return not(excludeLiveTransferOrExcluded);
}

/**
 * Cashflow metrics: exclude transfer/excluded categories AND void settlements.
 * Requires a LEFT JOIN of `financial_categories` on `category_id`.
 */
export function cashflowTransactionSql(): SQL {
  const combined = and(
    cashflowCategorySql(),
    balanceAffectingTransactionSql(),
  );
  if (!combined) {
    throw new Error("cashflowTransactionSql: unexpected empty predicate");
  }
  return combined;
}

export function cashflowCategoryLeftJoinOn() {
  return eq(financialTransactions.categoryId, financialCategories.id);
}

export function isCashflowTransactionRow(tx: {
  categoryId?: string | null;
  settlementState?: string | null;
  category?: CashflowCategoryMeta | null;
}): boolean {
  if (!isBalanceAffectingFinancialSettlement(tx.settlementState)) return false;
  if (tx.category) return isCashflowCategory(tx.category);
  return true;
}
