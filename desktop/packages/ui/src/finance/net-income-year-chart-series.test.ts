import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildNetIncomeYearChartSeries,
  formatNetIncomeRangeLabel,
  netIncomeChangePercent,
  netIncomeYearChartHasData,
} from "./net-income-year-chart-series.js";

describe("netIncomeChangePercent", () => {
  test("uses absolute prior as denominator", () => {
    assert.ok(
      Math.abs(netIncomeChangePercent(720_105, -89_134)! - 907.89) < 0.05,
    );
  });

  test("returns 0 when both are zero", () => {
    assert.equal(netIncomeChangePercent(0, 0), 0);
  });

  test("returns null when prior is zero and current is not", () => {
    assert.equal(netIncomeChangePercent(100, 0), null);
  });
});

describe("buildNetIncomeYearChartSeries", () => {
  test("fills twelve months and zeros future months", () => {
    const series = buildNetIncomeYearChartSeries({
      year: 2026,
      asOf: "2026-08-12",
      now: new Date(2026, 7, 12),
      months: [
        { month: "2026-01", incomeCents: 300_000, expenseCents: 50_000 },
        { month: "2026-08", incomeCents: 10_000, expenseCents: 410_000 },
      ],
      ytdNetCents: 720_105,
      priorYtdNetCents: -89_134,
    });

    assert.equal(series.points.length, 12);
    assert.equal(series.points[0]?.net, 2500);
    assert.match(series.points[0]?.monthLabel ?? "", /2026/);
    assert.equal(series.points[7]?.isCurrentMonth, true);
    assert.equal(series.points[7]?.net, -4000);
    assert.equal(series.points[8]?.isFutureMonth, true);
    assert.equal(series.points[8]?.net, 0);
    assert.ok(Math.abs((series.changePercent ?? 0) - 907.89) < 0.05);
    assert.equal(netIncomeYearChartHasData(series), true);
  });

  test("keeps later months visible when browsing an earlier asOf", () => {
    const series = buildNetIncomeYearChartSeries({
      year: 2026,
      asOf: "2026-03-31",
      now: new Date(2026, 7, 12),
      months: [
        { month: "2026-03", incomeCents: 100_000, expenseCents: 0 },
        { month: "2026-08", incomeCents: 50_000, expenseCents: 0 },
      ],
      ytdNetCents: 100_000,
      priorYtdNetCents: 0,
    });

    assert.equal(series.points[2]?.isCurrentMonth, true);
    assert.equal(series.points[2]?.net, 1000);
    assert.equal(series.points[7]?.isFutureMonth, false);
    assert.equal(series.points[7]?.net, 500);
    assert.equal(series.points[8]?.isFutureMonth, true);
  });
});

describe("formatNetIncomeRangeLabel", () => {
  test("formats a same-year span", () => {
    const label = formatNetIncomeRangeLabel(
      new Date(2026, 0, 1),
      new Date(2026, 7, 12),
    );
    assert.match(label, /Jan/);
    assert.match(label, /12/);
    assert.match(label, /2026/);
  });
});
