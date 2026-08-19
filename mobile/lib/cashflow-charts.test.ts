import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCashflowIncomeYearPoints,
  buildCashflowSpendYearSeries,
  buildNetIncomeYearChartSeries,
  cashflowChangePercent,
  resolveCashflowVisibleThroughMonth,
} from "./cashflow-charts.ts";
import type { FinanceCategoryRow } from "./finance-categories.ts";

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

describe("resolveCashflowVisibleThroughMonth", () => {
  it("extends through today when browsing an earlier month", () => {
    const now = new Date(2026, 7, 15); // Aug 15
    assert.equal(
      resolveCashflowVisibleThroughMonth(2026, "2026-03-31", now),
      8,
    );
  });
});

describe("cashflowChangePercent", () => {
  it("computes relative change and handles zero prior", () => {
    assert.equal(cashflowChangePercent(150, 100), 50);
    assert.equal(cashflowChangePercent(0, 0), 0);
    assert.equal(cashflowChangePercent(10, 0), null);
  });
});

describe("buildNetIncomeYearChartSeries", () => {
  it("builds signed bars and cumulative through visible months", () => {
    const series = buildNetIncomeYearChartSeries({
      year: 2026,
      asOf: "2026-03-15",
      now: new Date(2026, 2, 15),
      ytdNetCents: 50_000,
      priorYtdNetCents: 25_000,
      months: [
        { month: "2026-01", incomeCents: 100_000, expenseCents: 40_000 },
        { month: "2026-02", incomeCents: 20_000, expenseCents: 80_000 },
        { month: "2026-03", incomeCents: 50_000, expenseCents: 0 },
      ],
    });
    assert.equal(series.points[0]!.net, 600);
    assert.equal(series.points[1]!.net, -600);
    assert.equal(series.points[2]!.net, 500);
    assert.equal(series.points[2]!.cumulative, 500);
    assert.equal(series.points[3]!.isFutureMonth, true);
    assert.equal(series.changePercent, 100);
  });
});

describe("buildCashflowSpendYearSeries", () => {
  it("stacks top roots and buckets overflow into Other", () => {
    const series = buildCashflowSpendYearSeries({
      year: 2026,
      asOf: "2026-08-15",
      now: new Date(2026, 7, 15),
      topN: 1,
      ytdExpenseCents: 600_000,
      priorYtdExpenseCents: 500_000,
      categories: [
        category("food", "Food"),
        category("home", "Home"),
        category("rent", "Rent", { parentId: "home" }),
      ],
      categoryMonths: [
        { month: "2026-01", categoryId: "food", expenseCents: 100_000 },
        { month: "2026-01", categoryId: "rent", expenseCents: 200_000 },
        { month: "2026-01", categoryId: null, expenseCents: 50_000 },
      ],
    });
    assert.ok(series.keys.includes("home"));
    assert.ok(series.keys.includes("__other__"));
    assert.ok(series.keys.includes("__uncategorized__"));
    assert.equal(series.rows[0]!.totalEuros, 3500);
  });
});

describe("buildCashflowIncomeYearPoints", () => {
  it("zeros future months", () => {
    const points = buildCashflowIncomeYearPoints({
      year: 2026,
      asOf: "2026-02-10",
      now: new Date(2026, 1, 10),
      months: [
        { month: "2026-01", incomeCents: 10_000, expenseCents: 0 },
        { month: "2026-03", incomeCents: 99_000, expenseCents: 0 },
      ],
    });
    assert.equal(points[0]!.income, 100);
    assert.equal(points[1]!.income, 0);
    assert.equal(points[2]!.isFutureMonth, true);
    assert.equal(points[2]!.income, 0);
  });
});
