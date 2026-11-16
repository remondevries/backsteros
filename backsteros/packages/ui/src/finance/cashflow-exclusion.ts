import type { FinancialCategory } from "@backsteros/contracts";
import { isBalanceAffectingFinancialSettlement } from "@backsteros/contracts";

export type CashflowCategoryMeta = Pick<
  FinancialCategory,
  "id" | "kind" | "listing"
> & {
  deletedAt?: string | null;
};

/**
 * Own-account card-payment / balance-move payees that are transfers in practice
 * even when categorized as expense/income (no data rewrite — cashflow only).
 * Server import prefers IBAN + mirror-pair detection; this remains the UI fallback.
 */
const OWN_ACCOUNT_TRANSFER_CREDIT_PAYEE =
  /hartelijk\s+bedankt\s+voor\s+uw\s+betaling|saldo\s+overgeboekt/i;
const OWN_ACCOUNT_TRANSFER_DEBIT_PAYEE = /^american\s+express\b/i;

export function normalizeAccountRef(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const compact = value.replace(/[\s-]/g, "").toUpperCase();
  return compact || null;
}

/** True when counterparty IBAN/mask matches one of our linked accounts. */
export function isCounterpartyOwnAccount(
  counterparty: string | null | undefined,
  ownAccountRefs: ReadonlySet<string>,
): boolean {
  const actual = normalizeAccountRef(counterparty);
  if (!actual || ownAccountRefs.size === 0) return false;
  for (const raw of ownAccountRefs) {
    if (!raw) continue;
    if (raw.length >= 10 && actual.length >= 10) {
      if (raw === actual) return true;
      continue;
    }
    if (raw.endsWith(actual) || actual.endsWith(raw)) return true;
  }
  return false;
}

/**
 * Whether a ledger row looks like an own-account transfer by payee alone.
 * Credits: Amex/bank "thank you for your payment" receipts.
 * Debits: paying the card from a checking account ("American Express …").
 */
export function isOwnAccountTransferPayee(options: {
  payee?: string | null;
  amountCents?: number | null;
}): boolean {
  const payee = options.payee?.trim() ?? "";
  if (!payee) return false;
  const amount = options.amountCents ?? 0;
  if (amount > 0) return OWN_ACCOUNT_TRANSFER_CREDIT_PAYEE.test(payee);
  if (amount < 0) return OWN_ACCOUNT_TRANSFER_DEBIT_PAYEE.test(payee);
  return false;
}

/**
 * Own-account transfer for client cashflow: IBAN match first, payee heuristic fallback.
 * Mirror-pair detection runs on the server at import time.
 */
export function isOwnAccountTransfer(options: {
  payee?: string | null;
  amountCents?: number | null;
  counterparty?: string | null;
  ownAccountRefs?: ReadonlySet<string>;
}): boolean {
  if (
    options.ownAccountRefs &&
    isCounterpartyOwnAccount(options.counterparty, options.ownAccountRefs)
  ) {
    return true;
  }
  return isOwnAccountTransferPayee(options);
}

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

/** Live cashflow categories with `kind === "income"`. */
export function buildIncomeCategoryIdSet(
  categories: ReadonlyArray<CashflowCategoryMeta>,
): Set<string> {
  const ids = new Set<string>();
  for (const category of categories) {
    if (!isCashflowCategory(category)) continue;
    if (category.kind === "income") ids.add(category.id);
  }
  return ids;
}

export type KindBasedIncomeExpense = {
  incomeCents: number;
  expenseCents: number;
};

/**
 * Kind-based cashflow income/expense — same definition as
 * `getWorkspaceCashflow` / `sumIncomeExpenseInRange` on the server:
 *
 * - Income = net of income-kind amounts (credits − debits) + uncategorized credits
 * - Expense = net of expense-kind amounts (credits/refunds reduce) +
 *   uncategorized debits only
 *
 * Callers must already exclude transfer/excluded/void/own-account rows
 * (see {@link isCashflowTransaction}).
 */
export function accumulateKindBasedIncomeExpense(
  amountCents: number,
  categoryId: string | null | undefined,
  incomeCategoryIds: ReadonlySet<string>,
  into: KindBasedIncomeExpense,
): void {
  if (amountCents === 0) return;
  const isIncomeKind =
    categoryId != null && incomeCategoryIds.has(categoryId);
  if (isIncomeKind) {
    into.incomeCents += amountCents;
    return;
  }
  if (!categoryId) {
    if (amountCents > 0) into.incomeCents += amountCents;
    else into.expenseCents += -amountCents;
    return;
  }
  // Expense-kind (and any other non-income cashflow kind): net, credits reduce.
  into.expenseCents += -amountCents;
}

export function isCashflowTransaction(
  tx: {
    categoryId?: string | null;
    settlementState?: string | null;
    payee?: string | null;
    amountCents?: number | null;
    counterparty?: string | null;
  },
  nonCashflowCategoryIds: ReadonlySet<string>,
  ownAccountRefs?: ReadonlySet<string>,
): boolean {
  if (!isBalanceAffectingFinancialSettlement(tx.settlementState)) return false;
  if (isOwnAccountTransfer({ ...tx, ownAccountRefs })) return false;
  if (!tx.categoryId) return true;
  return !nonCashflowCategoryIds.has(tx.categoryId);
}
