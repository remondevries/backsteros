import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  accumulateKindBasedIncomeExpense,
  buildIncomeCategoryIdSet,
  buildNonCashflowCategoryIdSet,
  isCashflowTransaction,
} from "./cashflow-exclusion.js";
import { computeNetThisMonthStats } from "./net-this-month.js";

/**
 * A1: dashboard net-this-month and cashflow-page month totals must agree for
 * the same fixtures under the shared kind-based definition.
 */
describe("dashboard ↔ cashflow kind-based agreement (A1)", () => {
  const categories = [
    {
      id: "income",
      kind: "income",
      listing: "active",
    },
    {
      id: "gifts-expense",
      kind: "expense",
      listing: "active",
    },
    {
      id: "gifts-received",
      kind: "income",
      listing: "active",
    },
    {
      id: "food",
      kind: "expense",
      listing: "active",
    },
    {
      id: "transfer",
      kind: "transfer",
      listing: "active",
    },
  ] as const;

  const nonCashflowCategoryIds = buildNonCashflowCategoryIdSet([...categories]);
  const incomeCategoryIds = buildIncomeCategoryIdSet([...categories]);

  const october = [
    // Real income
    {
      bookedOn: "2026-10-01",
      amountCents: 8_000_00,
      categoryId: "income",
    },
    // Inheritance credit wrongly in expense "Gifts" — must NOT count as income
    {
      bookedOn: "2026-10-03",
      amountCents: 2_500_00,
      categoryId: "gifts-expense",
    },
    // Same credit in income "Gifts received" — DOES count
    {
      bookedOn: "2026-10-04",
      amountCents: 100_00,
      categoryId: "gifts-received",
    },
    // Spend
    {
      bookedOn: "2026-10-05",
      amountCents: -50_00,
      categoryId: "food",
    },
    // Transfer — omitted
    {
      bookedOn: "2026-10-06",
      amountCents: -200_00,
      categoryId: "transfer",
    },
    // Income-kind debit (charge-back) reduces income (A13)
    {
      bookedOn: "2026-10-07",
      amountCents: -25_00,
      categoryId: "income",
    },
  ];

  function cashflowMonthTotals(
    rows: typeof october,
  ): { incomeCents: number; expenseCents: number } {
    const totals = { incomeCents: 0, expenseCents: 0 };
    for (const tx of rows) {
      if (!isCashflowTransaction(tx, nonCashflowCategoryIds)) continue;
      accumulateKindBasedIncomeExpense(
        tx.amountCents,
        tx.categoryId,
        incomeCategoryIds,
        totals,
      );
    }
    return totals;
  }

  it("matches computeNetThisMonthStats to cashflow month for October fixtures", () => {
    const cashflow = cashflowMonthTotals(october);
    const stats = computeNetThisMonthStats({
      month: "2026-10",
      now: new Date(2026, 9, 31),
      transactions: october,
      priorTransactions: [],
      nonCashflowCategoryIds,
      incomeCategoryIds,
    });
    assert.ok(stats);
    assert.equal(stats.incomeCents, cashflow.incomeCents);
    assert.equal(stats.spendCents, cashflow.expenseCents);
    // 8000 + 100 − 25 income; 50 spend; gifts-expense credit omitted
    assert.equal(stats.incomeCents, 8_075_00);
    assert.equal(stats.spendCents, 50_00);
  });
});
