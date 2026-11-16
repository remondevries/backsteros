import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { sumKindBasedIncomeExpense } from "./kind-based-income-expense.js";

describe("sumKindBasedIncomeExpense (shared spending definition)", () => {
  test("matches cashflow month totals for the shared dashboard fixture", () => {
    const totals = sumKindBasedIncomeExpense([
      { amountCents: 5_000_00, categoryKind: "income" },
      { amountCents: -200_00, categoryKind: "income" },
      { amountCents: -80_00, categoryKind: "expense" },
      { amountCents: 20_00, categoryKind: "expense" }, // refund reduces spend
      { amountCents: 50_00, categoryKind: null },
      { amountCents: -30_00, categoryKind: null },
    ]);
    assert.deepEqual(totals, {
      incomeCents: 4_850_00,
      expenseCents: 90_00,
    });
  });

  test("nets income-kind debits into income", () => {
    const totals = sumKindBasedIncomeExpense([
      { amountCents: 5_000_00, categoryKind: "income" },
      { amountCents: -250_00, categoryKind: "income" },
    ]);
    assert.deepEqual(totals, { incomeCents: 4_750_00, expenseCents: 0 });
  });

  test("nets expense-kind credits into expense (A4)", () => {
    const totals = sumKindBasedIncomeExpense([
      { amountCents: -100_00, categoryKind: "expense" },
      { amountCents: 40_00, categoryKind: "expense" },
    ]);
    assert.deepEqual(totals, { incomeCents: 0, expenseCents: 60_00 });
  });

  test("uncategorized credits count as income, not spend reduction (A2)", () => {
    const totals = sumKindBasedIncomeExpense([
      { amountCents: -50_00, categoryKind: null },
      { amountCents: 30_00, categoryKind: null },
    ]);
    assert.deepEqual(totals, { incomeCents: 30_00, expenseCents: 50_00 });
  });
});
