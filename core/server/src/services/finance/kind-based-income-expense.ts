/**
 * Pure Kind-based cashflow income/expense contribution — must stay aligned with
 * `cashflowIncomeCentsSumSql` / `cashflowExpenseCentsSumSql` in
 * `finance/analytics.ts` and UI `accumulateKindBasedIncomeExpense`.
 *
 * Income = net of income-kind amounts + uncategorized credits.
 * Expense = net of expense-kind amounts (credits/refunds reduce spend) +
 *   uncategorized debits only.
 */

export function contributeKindBasedIncomeExpense(
  amountCents: number,
  categoryKind: string | null | undefined,
): { incomeDelta: number; expenseDelta: number } {
  if (amountCents === 0) {
    return { incomeDelta: 0, expenseDelta: 0 };
  }
  if (categoryKind === "income") {
    return { incomeDelta: amountCents, expenseDelta: 0 };
  }
  if (categoryKind == null) {
    if (amountCents > 0) return { incomeDelta: amountCents, expenseDelta: 0 };
    return { incomeDelta: 0, expenseDelta: -amountCents };
  }
  if (categoryKind === "expense") {
    // Credits/refunds reduce spending (mirrors income-kind debits).
    return { incomeDelta: 0, expenseDelta: -amountCents };
  }
  return { incomeDelta: 0, expenseDelta: 0 };
}

export function sumKindBasedIncomeExpense(
  rows: ReadonlyArray<{
    amountCents: number;
    categoryKind: string | null | undefined;
  }>,
): { incomeCents: number; expenseCents: number } {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const row of rows) {
    const delta = contributeKindBasedIncomeExpense(
      row.amountCents,
      row.categoryKind,
    );
    incomeCents += delta.incomeDelta;
    expenseCents += delta.expenseDelta;
  }
  return { incomeCents, expenseCents };
}
