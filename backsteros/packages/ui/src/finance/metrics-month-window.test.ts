import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  averageMonthlyDenominator,
  continuousMonthWindow,
  zeroFillMonthSpend,
} from "./metrics-month-window.js";

describe("metrics-month-window", () => {
  test("builds a continuous 12-month window ending at the selected month", () => {
    assert.deepEqual(continuousMonthWindow("2026-08", 12), [
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  test("zero-fills gaps so charts do not collapse sparse years", () => {
    const filled = zeroFillMonthSpend(
      "2026-08",
      new Map([
        ["2021-12", 100],
        ["2026-08", 50],
      ]),
      12,
    );
    assert.equal(filled.length, 12);
    assert.equal(filled[0]?.month, "2025-09");
    assert.equal(filled[0]?.spentCents, 0);
    assert.equal(filled.at(-1)?.month, "2026-08");
    assert.equal(filled.at(-1)?.spentCents, 50);
  });

  test("average denominator uses first→last activity span (Turfmarkt-style)", () => {
    // Five payments Jun–Oct 2018 → 5 months, not 12.
    assert.equal(
      averageMonthlyDenominator({
        year: 2018,
        monthKeysWithData: [
          "2018-06",
          "2018-07",
          "2018-08",
          "2018-09",
          "2018-10",
        ],
        now: new Date(2026, 10, 16),
      }),
      5,
    );
  });

  test("current year excludes the in-progress month from the denominator", () => {
    assert.equal(
      averageMonthlyDenominator({
        year: 2026,
        monthKeysWithData: ["2026-01", "2026-02", "2026-03", "2026-11"],
        now: new Date(2026, 10, 16), // November
      }),
      // first Jan → last completed Oct = 10
      10,
    );
  });
});
