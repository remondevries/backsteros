import assert from "node:assert/strict";
import test from "node:test";

import {
  accountChartHasYearActivity,
  aggregateBankAccountCashflowMonths,
  buildAccountIncomeExpenseChartSeries,
  buildAccountIncomeExpenseChartSeriesFromCashflow,
  buildMonthIncomeExpenseDailyChartSeries,
} from "./account-income-expense-chart-series.js";
import type { FinancialTransaction } from "@backsteros/contracts";

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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

test("buildAccountIncomeExpenseChartSeries buckets income and expense by month", () => {
  const series = buildAccountIncomeExpenseChartSeries({
    transactions: [
      tx({ id: "1", bookedOn: "2026-01-10", amountCents: 200_00 }),
      tx({ id: "2", bookedOn: "2026-01-20", amountCents: -50_00 }),
      tx({ id: "3", bookedOn: "2026-02-05", amountCents: -75_00 }),
      tx({ id: "4", bookedOn: "2026-02-12", amountCents: 100_00 }),
      // Prior year ignored
      tx({ id: "5", bookedOn: "2025-12-31", amountCents: 999_00 }),
    ],
    asOf: new Date(2026, 1, 20),
  });

  const income = series.find((line) => line.id === "income");
  const expense = series.find((line) => line.id === "expense");
  assert.ok(income);
  assert.ok(expense);
  assert.equal(income.data.length, 2);
  assert.equal(expense.data.length, 2);
  assert.equal(income.data[0]?.y, 200);
  assert.equal(expense.data[0]?.y, 50);
  assert.equal(income.data[1]?.y, 100);
  assert.equal(expense.data[1]?.y, 75);
  assert.equal(income.data[0]?.label.length > 0, true);
});

test("buildAccountIncomeExpenseChartSeries stops at current month", () => {
  const series = buildAccountIncomeExpenseChartSeries({
    transactions: [
      tx({ id: "1", bookedOn: "2026-03-01", amountCents: 10_00 }),
      tx({ id: "2", bookedOn: "2026-04-01", amountCents: 20_00 }),
    ],
    asOf: new Date(2026, 2, 15),
  });
  const income = series.find((line) => line.id === "income");
  assert.ok(income);
  assert.equal(income.data.length, 3);
  assert.equal(income.data.at(-1)?.x, "2026-03");
  assert.equal(income.data[2]?.y, 10);
  assert.equal(
    income.data.find((point) => point.x === "2026-04"),
    undefined,
  );
});

test("accountChartHasYearActivity detects empty year", () => {
  const empty = buildAccountIncomeExpenseChartSeries({
    transactions: [],
    asOf: new Date(2026, 5, 1),
  });
  assert.equal(accountChartHasYearActivity(empty), false);

  const withSpend = buildAccountIncomeExpenseChartSeries({
    transactions: [tx({ id: "1", bookedOn: "2026-02-01", amountCents: -1 })],
    asOf: new Date(2026, 5, 1),
  });
  assert.equal(accountChartHasYearActivity(withSpend), true);
});

test("aggregateBankAccountCashflowMonths sums income and expense by month", () => {
  const months = aggregateBankAccountCashflowMonths([
    [
      { month: "2026-01", incomeCents: 100, expenseCents: 40 },
      { month: "2026-02", incomeCents: 50, expenseCents: 10 },
    ],
    [
      { month: "2026-01", incomeCents: 25, expenseCents: 5 },
      { month: "2026-03", incomeCents: 0, expenseCents: 20 },
    ],
  ]);
  assert.deepEqual(months, [
    { month: "2026-01", incomeCents: 125, expenseCents: 45 },
    { month: "2026-02", incomeCents: 50, expenseCents: 10 },
    { month: "2026-03", incomeCents: 0, expenseCents: 20 },
  ]);
});

test("buildAccountIncomeExpenseChartSeriesFromCashflow fullYear keeps axis months but ends the line", () => {
  const series = buildAccountIncomeExpenseChartSeriesFromCashflow({
    year: 2026,
    months: [
      { month: "2026-01", incomeCents: 100_00, expenseCents: 0 },
      { month: "2026-08", incomeCents: 50_00, expenseCents: 0 },
    ],
    asOf: new Date(2026, 7, 13),
    fullYear: true,
  });
  const income = series.find((line) => line.id === "income");
  assert.ok(income);
  assert.equal(income.data.length, 12);
  assert.equal(income.data[0]?.x, "2026-01");
  assert.equal(income.data[11]?.x, "2026-12");
  assert.equal(income.data[7]?.y, 50);
  assert.equal(income.data[8]?.y, null);
  assert.equal(income.data[11]?.y, null);
});

test("buildMonthIncomeExpenseDailyChartSeries buckets by day in current month", () => {
  const series = buildMonthIncomeExpenseDailyChartSeries({
    transactions: [
      tx({ id: "1", bookedOn: "2026-08-01", amountCents: 100_00 }),
      tx({ id: "2", bookedOn: "2026-08-01", amountCents: -20_00 }),
      tx({ id: "3", bookedOn: "2026-08-12", amountCents: -45_00 }),
      tx({ id: "4", bookedOn: "2026-07-31", amountCents: 999_00 }),
      tx({ id: "5", bookedOn: "2026-08-20", amountCents: -10_00 }),
    ],
    asOf: new Date(2026, 7, 12),
  });
  const income = series.find((line) => line.id === "income");
  const expense = series.find((line) => line.id === "expense");
  assert.ok(income);
  assert.ok(expense);
  assert.equal(income.data.length, 12);
  assert.equal(expense.data.length, 12);
  assert.equal(income.data[0]?.x, "2026-08-01");
  assert.equal(income.data[0]?.y, 100);
  assert.equal(expense.data[0]?.y, 20);
  assert.equal(expense.data[11]?.y, 45);
  assert.equal(
    income.data.find((point) => point.x === "2026-08-20"),
    undefined,
  );
});

test("buildMonthIncomeExpenseDailyChartSeries omits transfer category payoffs", () => {
  const transferId = "cat-cc-pay";
  const series = buildMonthIncomeExpenseDailyChartSeries({
    transactions: [
      tx({
        id: "1",
        bookedOn: "2026-08-05",
        amountCents: -50_00,
        categoryId: "cat-food",
      }),
      tx({
        id: "2",
        bookedOn: "2026-08-10",
        amountCents: -50_00,
        categoryId: transferId,
      }),
      tx({
        id: "3",
        bookedOn: "2026-08-10",
        amountCents: 50_00,
        categoryId: transferId,
      }),
    ],
    asOf: new Date(2026, 7, 12),
    nonCashflowCategoryIds: new Set([transferId]),
  });
  const income = series.find((line) => line.id === "income");
  const expense = series.find((line) => line.id === "expense");
  assert.ok(income);
  assert.ok(expense);
  assert.equal(income.data[9]?.y, 0);
  assert.equal(expense.data[4]?.y, 50);
  assert.equal(expense.data[9]?.y, 0);
});
