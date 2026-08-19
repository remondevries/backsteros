import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SPEND_OTHER_KEY,
  SPEND_UNCATEGORIZED_KEY,
  assetsChangePercent,
  buildAccountIncomeExpenseYearPoints,
  buildAssetsDebtChartPoints,
  buildDashboardTopCategories,
  buildInvoiceRevenueChartPoints,
  buildMonthIncomeExpenseDailyPoints,
  buildMonthlySpendSeries,
  mergeInvoiceRevenueWithAccountExpenses,
} from "./finance-chart-series";
import type { FinanceCategoryRow } from "./finance-categories";

const category = (
  id: string,
  name: string,
  overrides: Partial<FinanceCategoryRow> = {},
): FinanceCategoryRow => ({
  id,
  name,
  parentId: null,
  kind: "regular",
  listing: "listed",
  icon: null,
  sortOrder: 0,
  ...overrides,
});

describe("buildMonthlySpendSeries", () => {
  it("rolls child spend into the root category", () => {
    const categories = [
      category("food", "Food"),
      category("groceries", "Groceries", { parentId: "food" }),
    ];
    const series = buildMonthlySpendSeries({
      categories,
      months: ["2026-08"],
      categoryMonths: [
        { month: "2026-08", categoryId: "food", expenseCents: 1000 },
        { month: "2026-08", categoryId: "groceries", expenseCents: 2500 },
      ],
    });

    assert.deepEqual(series.keys, ["food"]);
    assert.equal(series.rows[0]!.values[0], 3500);
    assert.equal(series.rows[0]!.totalCents, 3500);
    assert.equal(series.labels.food, "Food");
  });

  it("skips transfer and excluded roots and negative months", () => {
    const categories = [
      category("food", "Food"),
      category("transfer", "Transfers", { kind: "transfer" }),
      category("hidden", "Hidden", { listing: "excluded" }),
    ];
    const series = buildMonthlySpendSeries({
      categories,
      months: ["2026-08"],
      categoryMonths: [
        { month: "2026-08", categoryId: "food", expenseCents: 1000 },
        { month: "2026-08", categoryId: "transfer", expenseCents: 9999 },
        { month: "2026-08", categoryId: "hidden", expenseCents: 9999 },
        { month: "2026-08", categoryId: "food", expenseCents: -500 },
      ],
    });

    assert.deepEqual(series.keys, ["food"]);
    assert.equal(series.rows[0]!.totalCents, 1000);
  });

  it("caps to topN roots and buckets the rest into Other + Uncategorized", () => {
    const categories = ["a", "b", "c"].map((id) =>
      category(id, id.toUpperCase()),
    );
    const series = buildMonthlySpendSeries({
      categories,
      months: ["2026-08"],
      topN: 2,
      categoryMonths: [
        { month: "2026-08", categoryId: "a", expenseCents: 3000 },
        { month: "2026-08", categoryId: "b", expenseCents: 2000 },
        { month: "2026-08", categoryId: "c", expenseCents: 1000 },
        { month: "2026-08", categoryId: null, expenseCents: 400 },
      ],
    });

    assert.deepEqual(series.keys, [
      "a",
      "b",
      SPEND_OTHER_KEY,
      SPEND_UNCATEGORIZED_KEY,
    ]);
    assert.deepEqual(series.rows[0]!.values, [3000, 2000, 1000, 400]);
    assert.equal(series.labels[SPEND_OTHER_KEY], "Other");
    assert.equal(series.labels[SPEND_UNCATEGORIZED_KEY], "Uncategorized");
  });

  it("prefers the category icon color, falling back to distinct palette colors", () => {
    const series = buildMonthlySpendSeries({
      categories: [
        category("a", "A", { icon: '{"t":"d","c":"#22c55e"}' }),
        category("b", "B", { icon: '{"t":"d","c":"#22c55e"}' }),
        category("c", "C"),
      ],
      months: ["2026-08"],
      categoryMonths: [
        { month: "2026-08", categoryId: "a", expenseCents: 3000 },
        { month: "2026-08", categoryId: "b", expenseCents: 2000 },
        { month: "2026-08", categoryId: "c", expenseCents: 1000 },
      ],
    });

    assert.equal(series.colors.a, "#22c55e");
    assert.notEqual(series.colors.b, "#22c55e");
    const used = new Set(Object.values(series.colors));
    assert.equal(used.size, Object.keys(series.colors).length);
  });

  it("keeps empty months as zero rows", () => {
    const series = buildMonthlySpendSeries({
      categories: [category("food", "Food")],
      months: ["2026-07", "2026-08"],
      categoryMonths: [
        { month: "2026-08", categoryId: "food", expenseCents: 100 },
      ],
    });
    assert.equal(series.rows[0]!.totalCents, 0);
    assert.equal(series.rows[1]!.totalCents, 100);
  });
});

describe("buildDashboardTopCategories", () => {
  it("rolls child spend into parents and keeps subcategory rows", () => {
    const rows = buildDashboardTopCategories({
      monthKey: "2026-08",
      categories: [
        category("home", "Home", { sortOrder: 0 }),
        category("food", "Food", { sortOrder: 1 }),
        category("rent", "Rent", { parentId: "home", sortOrder: 0 }),
      ],
      categoryMonths: [
        { month: "2026-08", categoryId: "rent", expenseCents: 120_000 },
        { month: "2026-08", categoryId: "food", expenseCents: 40_000 },
        { month: "2026-07", categoryId: "food", expenseCents: 99_000 },
      ],
    });

    assert.deepEqual(
      rows.map((row) => ({
        id: row.id,
        depth: row.depth,
        spentCents: row.spentCents,
      })),
      [
        { id: "home", depth: 0, spentCents: 120_000 },
        { id: "rent", depth: 1, spentCents: 120_000 },
        { id: "food", depth: 0, spentCents: 40_000 },
      ],
    );
  });
});

describe("buildMonthIncomeExpenseDailyPoints", () => {
  const tx = (
    partial: Partial<{
      id: string;
      bookedOn: string;
      amountCents: number;
      categoryId: string | null;
    }> & { id: string; bookedOn: string; amountCents: number },
  ) =>
    ({
      id: partial.id,
      bookedOn: partial.bookedOn,
      amountCents: partial.amountCents,
      categoryId: partial.categoryId ?? null,
      currency: "EUR",
      bankAccountId: "acc",
      description: null,
      merchantName: null,
      payeeName: null,
      status: "booked",
      goalId: null,
      recurringId: null,
      organizationId: null,
      projectId: null,
      notes: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
    }) as const;

  it("buckets daily income and expense through asOf", () => {
    const points = buildMonthIncomeExpenseDailyPoints({
      asOf: new Date(2026, 7, 12),
      transactions: [
        tx({ id: "1", bookedOn: "2026-08-01", amountCents: 10_000 }),
        tx({ id: "2", bookedOn: "2026-08-01", amountCents: -2_000 }),
        tx({ id: "3", bookedOn: "2026-08-12", amountCents: -4_500 }),
        tx({ id: "4", bookedOn: "2026-08-20", amountCents: -1_000 }),
      ],
    });
    assert.equal(points.length, 12);
    assert.equal(points[0]!.income, 100);
    assert.equal(points[0]!.expense, 20);
    assert.equal(points[11]!.expense, 45);
    assert.equal(
      points.find((point) => point.day === 20),
      undefined,
    );
  });

  it("omits transfer category cashflow", () => {
    const points = buildMonthIncomeExpenseDailyPoints({
      asOf: new Date(2026, 7, 12),
      nonCashflowCategoryIds: new Set(["cat-cc-pay"]),
      transactions: [
        tx({
          id: "1",
          bookedOn: "2026-08-05",
          amountCents: -5_000,
          categoryId: "cat-food",
        }),
        tx({
          id: "2",
          bookedOn: "2026-08-10",
          amountCents: -5_000,
          categoryId: "cat-cc-pay",
        }),
        tx({
          id: "3",
          bookedOn: "2026-08-10",
          amountCents: 5_000,
          categoryId: "cat-cc-pay",
        }),
      ],
    });
    assert.equal(points[4]!.expense, 50);
    assert.equal(points[9]!.expense, 0);
    assert.equal(points[9]!.income, 0);
  });
});

describe("buildAccountIncomeExpenseYearPoints", () => {
  it("includes months through asOf and omits future months", () => {
    const points = buildAccountIncomeExpenseYearPoints({
      year: 2026,
      asOf: new Date(2026, 2, 15),
      months: [
        { month: "2026-01", incomeCents: 10_000, expenseCents: 2_000 },
        { month: "2026-03", incomeCents: 5_000, expenseCents: 1_000 },
        { month: "2026-06", incomeCents: 9_000, expenseCents: 0 },
      ],
    });
    assert.equal(points.length, 3);
    assert.equal(points[0]!.income, 100);
    assert.equal(points[0]!.expense, 20);
    assert.equal(points[2]!.income, 50);
    assert.equal(points[2]!.expense, 10);
  });
});

describe("buildAssetsDebtChartPoints", () => {
  it("converts cents to euros and keeps the last point when sampling", () => {
    const points = Array.from({ length: 300 }, (_, index) => ({
      date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
      assetsCents: (index + 1) * 100,
      debtCents: 50,
    }));
    const sampled = buildAssetsDebtChartPoints({ points }, 120);

    assert.ok(sampled.length <= 120 + 1);
    assert.equal(sampled.at(-1)!.assets, 300);
    assert.equal(sampled[0]!.debt, 0.5);
  });

  it("returns empty for no history", () => {
    assert.deepEqual(buildAssetsDebtChartPoints({ points: [] }), []);
  });
});

describe("assetsChangePercent", () => {
  it("computes range change", () => {
    assert.equal(
      assetsChangePercent({ assetsCents: 11000, startAssetsCents: 10000 }),
      10,
    );
  });

  it("returns null when the range started at zero", () => {
    assert.equal(
      assetsChangePercent({ assetsCents: 11000, startAssetsCents: 0 }),
      null,
    );
  });
});

describe("mergeInvoiceRevenueWithAccountExpenses", () => {
  it("keeps Moneybird income and overlays account expenses", () => {
    const merged = mergeInvoiceRevenueWithAccountExpenses(
      [
        { month: "2026-01", incomeCents: 50000, expenseCents: 0 },
        { month: "2026-02", incomeCents: 10000, expenseCents: 0 },
      ],
      [
        { month: "2026-01", incomeCents: 0, expenseCents: 12000 },
        { month: "2026-03", incomeCents: 0, expenseCents: 9000 },
      ],
    );
    assert.deepEqual(merged, [
      { month: "2026-01", incomeCents: 50000, expenseCents: 12000 },
      { month: "2026-02", incomeCents: 10000, expenseCents: 0 },
    ]);
  });
});

describe("buildInvoiceRevenueChartPoints", () => {
  it("pads twelve months and converts cents to euros", () => {
    const points = buildInvoiceRevenueChartPoints({
      year: 2025,
      months: [{ month: "2025-01", incomeCents: 50000, expenseCents: 10000 }],
      asOf: new Date("2025-12-15T12:00:00Z"),
    });
    assert.equal(points.length, 12);
    assert.equal(points[0]!.invoiced, 500);
    assert.equal(points[0]!.expenses, 100);
    assert.equal(points[11]!.invoiced, 0);
  });

  it("nulls future months in the current year so the axis stays full-year", () => {
    const points = buildInvoiceRevenueChartPoints({
      year: 2026,
      months: [{ month: "2026-08", incomeCents: 20000, expenseCents: 0 }],
      asOf: new Date("2026-03-15T12:00:00Z"),
    });
    assert.equal(points[2]!.invoiced, 0);
    assert.equal(points[7]!.invoiced, null);
    assert.equal(points[7]!.expenses, null);
  });
});
