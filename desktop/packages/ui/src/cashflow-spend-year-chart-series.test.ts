import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { FinancialCategory } from "@backsteros/contracts";

import {
  buildCashflowSpendYearSeries,
  CASHFLOW_SPEND_OTHER_KEY,
  cashflowSpendYearChartHasData,
} from "../dist/cashflow-spend-year-chart-series.js";

function category(
  partial: Partial<FinancialCategory> & Pick<FinancialCategory, "id" | "name">,
): FinancialCategory {
  return {
    workspaceId: "ws",
    parentId: null,
    kind: "expense",
    listing: "active",
    icon: null,
    budgetCents: null,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("buildCashflowSpendYearSeries", () => {
  test("rolls children into roots and collapses overflow into Other", () => {
    const categories = [
      category({ id: "food", name: "Food", icon: "dot:green" }),
      category({ id: "groceries", name: "Groceries", parentId: "food" }),
      category({ id: "rent", name: "Rent", icon: "dot:blue" }),
      category({ id: "a", name: "A" }),
      category({ id: "b", name: "B" }),
      category({ id: "c", name: "C" }),
      category({ id: "d", name: "D" }),
      category({ id: "e", name: "E" }),
    ];

    const series = buildCashflowSpendYearSeries({
      year: 2026,
      asOf: "2026-08-12",
      now: new Date(2026, 7, 12),
      topN: 3,
      ytdExpenseCents: 1_000_000,
      priorYtdExpenseCents: 500_000,
      categories,
      categoryMonths: [
        { month: "2026-01", categoryId: "groceries", expenseCents: 400_000 },
        { month: "2026-01", categoryId: "rent", expenseCents: 300_000 },
        { month: "2026-01", categoryId: "a", expenseCents: 50_000 },
        { month: "2026-01", categoryId: "b", expenseCents: 40_000 },
        { month: "2026-01", categoryId: "c", expenseCents: 30_000 },
        { month: "2026-01", categoryId: "d", expenseCents: 20_000 },
        { month: "2026-01", categoryId: null, expenseCents: 10_000 },
        { month: "2026-09", categoryId: "rent", expenseCents: 999_000 },
      ],
    });

    assert.ok(series.keys.includes("food"));
    assert.ok(series.keys.includes("rent"));
    assert.ok(series.keys.includes(CASHFLOW_SPEND_OTHER_KEY));
    assert.equal(series.data[0]?.food, 4000);
    assert.equal(series.data[8]?.rent, 0);
    assert.equal(cashflowSpendYearChartHasData(series), true);
  });

  test("keeps later months visible when browsing an earlier asOf", () => {
    const series = buildCashflowSpendYearSeries({
      year: 2026,
      asOf: "2026-03-31",
      now: new Date(2026, 7, 12),
      ytdExpenseCents: 100_000,
      priorYtdExpenseCents: 0,
      categories: [category({ id: "rent", name: "Rent" })],
      categoryMonths: [
        { month: "2026-03", categoryId: "rent", expenseCents: 100_000 },
        { month: "2026-08", categoryId: "rent", expenseCents: 200_000 },
      ],
    });

    assert.equal(series.data[2]?.isCurrentMonth, true);
    assert.equal(series.data[2]?.rent, 1000);
    assert.equal(series.data[7]?.isFutureMonth, false);
    assert.equal(series.data[7]?.rent, 2000);
  });
});
