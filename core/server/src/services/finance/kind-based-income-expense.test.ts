import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { sumKindBasedIncomeExpense } from "./kind-based-income-expense.js";

describe("sumKindBasedIncomeExpense (A1 + A13)", () => {
  test("matches cashflow month totals for the shared dashboard fixture", () => {
    // Same figures as UI kind-based-income-expense-parity.test.ts
    const totals = sumKindBasedIncomeExpense([
      { amountCents: 5_000_00, categoryKind: "income" },
      { amountCents: -200_00, categoryKind: "income" },
      { amountCents: 2_500_00, categoryKind: "expense" }, // Gifts — omitted
      { amountCents: -80_00, categoryKind: "expense" },
      { amountCents: 50_00, categoryKind: null },
      { amountCents: -30_00, categoryKind: null },
    ]);
    assert.deepEqual(totals, {
      incomeCents: 4_850_00,
      expenseCents: 110_00,
    });
  });

  test("nets income-kind debits into income (A13)", () => {
    const totals = sumKindBasedIncomeExpense([
      { amountCents: 5_000_00, categoryKind: "income" },
      { amountCents: -250_00, categoryKind: "income" },
    ]);
    assert.deepEqual(totals, { incomeCents: 4_750_00, expenseCents: 0 });
  });
});
