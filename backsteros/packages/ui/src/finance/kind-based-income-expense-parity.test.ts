import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { FinancialTransaction } from "@backsteros/contracts";

import {
  accumulateKindBasedIncomeExpense,
  buildIncomeCategoryIdSet,
  buildNonCashflowCategoryIdSet,
  type CashflowCategoryMeta,
} from "./cashflow-exclusion.js";
import {
  buildAccountIncomeExpenseChartSeries,
  buildMonthIncomeExpenseDailyChartSeries,
} from "./account-income-expense-chart-series.js";
import { computeNetThisMonthStats } from "./net-this-month.js";

/**
 * Shared fixture for A1/A13: expense-kind Gifts credit must not inflate income;
 * income-kind debit reduces income (net), not expense.
 */
const categories: CashflowCategoryMeta[] = [
  { id: "cat-salary", kind: "income", listing: "regular" },
  { id: "cat-gifts", kind: "expense", listing: "regular" },
  { id: "cat-food", kind: "expense", listing: "regular" },
  { id: "cat-transfer", kind: "transfer", listing: "regular" },
];

function tx(
  partial: Partial<FinancialTransaction> & {
    id: string;
    bookedOn: string;
    amountCents: number;
  },
): FinancialTransaction {
  return {
    workspaceId: "ws",
    bankAccountId: "ba",
    importBatchId: null,
    currency: "EUR",
    payee: "Shop",
    counterparty: null,
    memo: null,
    displayName: null,
    balanceAfterCents: null,
    externalId: null,
    fingerprint: partial.id,
    sourceCode: null,
    sourceType: null,
    settlementState: null,
    raw: {},
    organizationId: null,
    projectId: null,
    categoryId: null,
    goalId: null,
    notes: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...partial,
  };
}

const fixtureTransactions = [
  // Salary credit (income-kind)
  tx({
    id: "salary",
    bookedOn: "2026-08-01",
    amountCents: 5_000_00,
    categoryId: "cat-salary",
    payee: "Employer",
  }),
  // Income-kind debit (refund / clawback) — A13 nets against income
  tx({
    id: "salary-clawback",
    bookedOn: "2026-08-05",
    amountCents: -200_00,
    categoryId: "cat-salary",
    payee: "Employer",
  }),
  // Gifts credit categorized as expense-kind — A1 must NOT count as income
  tx({
    id: "gifts",
    bookedOn: "2026-08-08",
    amountCents: 2_500_00,
    categoryId: "cat-gifts",
    payee: "Family",
  }),
  // Ordinary expense
  tx({
    id: "food",
    bookedOn: "2026-08-10",
    amountCents: -80_00,
    categoryId: "cat-food",
    payee: "Grocer",
  }),
  // Uncategorized credit + debit
  tx({ id: "uncat-in", bookedOn: "2026-08-12", amountCents: 50_00 }),
  tx({ id: "uncat-out", bookedOn: "2026-08-12", amountCents: -30_00 }),
  // Transfer legs — excluded
  tx({
    id: "xfer-out",
    bookedOn: "2026-08-15",
    amountCents: -100_00,
    categoryId: "cat-transfer",
  }),
  tx({
    id: "xfer-in",
    bookedOn: "2026-08-15",
    amountCents: 100_00,
    categoryId: "cat-transfer",
  }),
];

/** Expected cashflow month totals for the fixture (matches getWorkspaceCashflow). */
const EXPECTED = {
  // salary 5000 − clawback 200 + uncategorized credit 50 = 4850
  // gifts 2500 omitted from income
  incomeCents: 4_850_00,
  // food 80 + uncategorized debit 30 = 110
  expenseCents: 110_00,
};

describe("kind-based income/expense parity (A1 + A13)", () => {
  const nonCashflowCategoryIds = buildNonCashflowCategoryIdSet(categories);
  const incomeCategoryIds = buildIncomeCategoryIdSet(categories);
  const asOf = new Date(2026, 7, 31); // Aug 31 — full month

  it("accumulateKindBasedIncomeExpense matches the shared cashflow definition", () => {
    const totals = { incomeCents: 0, expenseCents: 0 };
    for (const row of fixtureTransactions) {
      if (row.categoryId && nonCashflowCategoryIds.has(row.categoryId)) continue;
      accumulateKindBasedIncomeExpense(
        row.amountCents,
        row.categoryId,
        incomeCategoryIds,
        totals,
      );
    }
    assert.deepEqual(totals, EXPECTED);
  });

  it("dashboard Net this month equals cashflow month figures", () => {
    const stats = computeNetThisMonthStats({
      month: "2026-08",
      now: asOf,
      transactions: fixtureTransactions,
      priorTransactions: [],
      nonCashflowCategoryIds,
      incomeCategoryIds,
    });
    assert.ok(stats);
    assert.equal(stats.incomeCents, EXPECTED.incomeCents);
    assert.equal(stats.spendCents, EXPECTED.expenseCents);
  });

  it("dashboard daily chart month sum equals cashflow month figures", () => {
    const series = buildMonthIncomeExpenseDailyChartSeries({
      transactions: fixtureTransactions,
      asOf,
      nonCashflowCategoryIds,
      incomeCategoryIds,
    });
    const income = series.find((line) => line.id === "income");
    const expense = series.find((line) => line.id === "expense");
    assert.ok(income);
    assert.ok(expense);
    const incomeCents = Math.round(
      income.data.reduce((sum, point) => sum + (point.y ?? 0), 0) * 100,
    );
    const expenseCents = Math.round(
      expense.data.reduce((sum, point) => sum + (point.y ?? 0), 0) * 100,
    );
    assert.equal(incomeCents, EXPECTED.incomeCents);
    assert.equal(expenseCents, EXPECTED.expenseCents);
  });

  it("per-account chart fallback month equals cashflow month figures", () => {
    const series = buildAccountIncomeExpenseChartSeries({
      transactions: fixtureTransactions,
      asOf,
      nonCashflowCategoryIds,
      incomeCategoryIds,
    });
    const income = series.find((line) => line.id === "income");
    const expense = series.find((line) => line.id === "expense");
    assert.ok(income);
    assert.ok(expense);
    const augustIncome = income.data.find((point) => point.x === "2026-08");
    const augustExpense = expense.data.find((point) => point.x === "2026-08");
    assert.equal(Math.round((augustIncome?.y ?? 0) * 100), EXPECTED.incomeCents);
    assert.equal(
      Math.round((augustExpense?.y ?? 0) * 100),
      EXPECTED.expenseCents,
    );
  });
});
