import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildSpendPanelYearMetrics } from "./spend-panel-year-metrics.js";

describe("buildSpendPanelYearMetrics", () => {
  test("denominator matches months included in the numerator", () => {
    // Selected Nov 2026: history includes Jan–Nov (11 months). Spend sums those
    // same months — average must ÷11, not ÷10 (completed-only).
    const history = Array.from({ length: 11 }, (_, i) => ({
      month: `2026-${String(i + 1).padStart(2, "0")}`,
      expenseCents: 100_00,
    }));
    // Also include all of 2025 in the trailing window.
    for (let i = 0; i < 12; i += 1) {
      history.unshift({
        month: `2025-${String(i + 1).padStart(2, "0")}`,
        expenseCents: 200_00,
      });
    }

    const metrics = buildSpendPanelYearMetrics(history, "2026-11");
    const y2026 = metrics.find((row) => row.year === 2026);
    const y2025 = metrics.find((row) => row.year === 2025);

    assert.equal(y2026?.spendCents, 11 * 100_00);
    assert.equal(y2026?.avgMonthlyCents, 100_00);
    assert.equal(y2025?.spendCents, 12 * 200_00);
    assert.equal(y2025?.avgMonthlyCents, 200_00);
  });

  test("uses a single history basis without rewriting the selected month", () => {
    const history = [
      { month: "2026-01", expenseCents: 50_00 },
      { month: "2026-02", expenseCents: 70_00 },
    ];
    const metrics = buildSpendPanelYearMetrics(history, "2026-02");
    assert.equal(metrics[0]?.year, 2026);
    assert.equal(metrics[0]?.spendCents, 120_00);
    assert.equal(metrics[0]?.avgMonthlyCents, 60_00);
  });
});
