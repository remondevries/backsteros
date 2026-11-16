import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildSpendPanelYearMetrics } from "./spend-panel-year-metrics.js";

describe("buildSpendPanelYearMetrics", () => {
  test("excludes the in-progress selected month from the average (A5)", () => {
    const history = Array.from({ length: 11 }, (_, i) => ({
      month: `2026-${String(i + 1).padStart(2, "0")}`,
      expenseCents: i === 10 ? 50_00 : 100_00,
    }));
    for (let i = 0; i < 12; i += 1) {
      history.unshift({
        month: `2025-${String(i + 1).padStart(2, "0")}`,
        expenseCents: 200_00,
      });
    }

    const metrics = buildSpendPanelYearMetrics(
      history,
      "2026-11",
      new Date(2026, 10, 16),
    );
    const y2026 = metrics.find((row) => row.year === 2026);
    const y2025 = metrics.find((row) => row.year === 2025);

    assert.equal(y2026?.spendCents, 10 * 100_00 + 50_00);
    // Average over Jan–Oct only (exclude in-progress Nov).
    assert.equal(y2026?.avgMonthlyCents, 100_00);
    assert.equal(y2025?.spendCents, 12 * 200_00);
    assert.equal(y2025?.avgMonthlyCents, 200_00);
  });

  test("keeps the selected month in the average when browsing a past month", () => {
    const history = [
      { month: "2026-01", expenseCents: 50_00 },
      { month: "2026-02", expenseCents: 70_00 },
    ];
    const metrics = buildSpendPanelYearMetrics(
      history,
      "2026-02",
      new Date(2026, 10, 16),
    );
    assert.equal(metrics[0]?.year, 2026);
    assert.equal(metrics[0]?.spendCents, 120_00);
    assert.equal(metrics[0]?.avgMonthlyCents, 60_00);
  });
});
