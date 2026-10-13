import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildNetThisMonthPeriods,
  computeNetThisMonthStats,
  previousMonthKey,
  resolveNetThisMonthAsOfDay,
} from "./net-this-month.js";

describe("previousMonthKey", () => {
  it("rolls across year boundaries", () => {
    assert.equal(previousMonthKey("2026-01"), "2025-12");
    assert.equal(previousMonthKey("2026-08"), "2026-07");
  });
});

describe("resolveNetThisMonthAsOfDay", () => {
  it("uses today for the current month and last day otherwise", () => {
    const now = new Date(2026, 7, 13); // Aug 13
    assert.equal(resolveNetThisMonthAsOfDay("2026-08", now), 13);
    assert.equal(resolveNetThisMonthAsOfDay("2026-07", now), 31);
    assert.equal(resolveNetThisMonthAsOfDay("2026-02", now), 28);
  });
});

describe("buildNetThisMonthPeriods", () => {
  it("compares MTD against the same day span in the prior month", () => {
    const periods = buildNetThisMonthPeriods(
      "2026-08",
      new Date(2026, 7, 13),
    );
    assert.deepEqual(periods, {
      period: { from: "2026-08-01", to: "2026-08-13" },
      priorPeriod: { from: "2026-07-01", to: "2026-07-13" },
    });
  });
});

describe("computeNetThisMonthStats", () => {
  it("sums income/spend and percent change vs prior", () => {
    const stats = computeNetThisMonthStats({
      month: "2026-08",
      now: new Date(2026, 7, 13),
      transactions: [
        { bookedOn: "2026-08-02", amountCents: 100_00 },
        { bookedOn: "2026-08-10", amountCents: -50_00 },
        { bookedOn: "2026-08-20", amountCents: -10_00 }, // outside MTD
      ],
      priorTransactions: [
        { bookedOn: "2026-07-05", amountCents: 80_00 },
        { bookedOn: "2026-07-12", amountCents: -40_00 },
      ],
    });
    assert.ok(stats);
    assert.equal(stats.incomeCents, 100_00);
    assert.equal(stats.spendCents, 50_00);
    assert.equal(stats.netCents, 50_00);
    assert.equal(stats.priorNetCents, 40_00);
    assert.ok(stats.changePercent != null);
    assert.ok(Math.abs(stats.changePercent - 25) < 0.001);
  });

  it("omits credit-card payoff legs tagged as non-cashflow", () => {
    const transferId = "cat-transfer";
    const stats = computeNetThisMonthStats({
      month: "2026-08",
      now: new Date(2026, 7, 13),
      nonCashflowCategoryIds: new Set([transferId]),
      transactions: [
        { bookedOn: "2026-08-03", amountCents: -80_00, categoryId: "cat-food" },
        {
          bookedOn: "2026-08-10",
          amountCents: -80_00,
          categoryId: transferId,
        },
        {
          bookedOn: "2026-08-10",
          amountCents: 80_00,
          categoryId: transferId,
        },
        { bookedOn: "2026-08-05", amountCents: 200_00 },
      ],
      priorTransactions: [],
    });
    assert.ok(stats);
    assert.equal(stats.incomeCents, 200_00);
    assert.equal(stats.spendCents, 80_00);
    assert.equal(stats.netCents, 120_00);
  });
});
