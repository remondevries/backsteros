import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildEstimateStatusAmountChartSeries,
  buildEstimateStatusMonthContributions,
  estimateChartYears,
  estimateStatusAmountChartHasData,
  parseEstimateDocumentDate,
} from "./estimate-amount-chart-series.js";

describe("parseEstimateDocumentDate", () => {
  it("parses ISO dates", () => {
    const date = parseEstimateDocumentDate("2026-03-15");
    assert.ok(date);
    assert.equal(date.getFullYear(), 2026);
    assert.equal(date.getMonth(), 2);
    assert.equal(date.getDate(), 15);
  });

  it("returns null for free-text labels", () => {
    assert.equal(parseEstimateDocumentDate("oktober 2026"), null);
  });
});

describe("buildEstimateStatusAmountChartSeries", () => {
  it("splits monthly totals per status", () => {
    const series = buildEstimateStatusAmountChartSeries({
      year: 2026,
      asOf: new Date(2026, 9, 8),
      fullYear: true,
      estimates: [
        {
          documentDate: "2026-01-10",
          totalAmountCents: 10_000,
          status: "concept",
        },
        {
          documentDate: "2026-01-20",
          totalAmountCents: 5_000,
          status: "approved",
        },
        {
          documentDate: "2026-03-01",
          totalAmountCents: 20_000,
          status: "in_review",
        },
        {
          documentDate: "2026-03-15",
          totalAmountCents: 8_000,
          status: "declined",
        },
      ],
    });

    assert.equal(series.length, 4);
    const byId = Object.fromEntries(series.map((line) => [line.id, line]));
    assert.equal(byId.concept?.data[0]?.y, 100);
    assert.equal(byId.approved?.data[0]?.y, 50);
    assert.equal(byId.in_review?.data[2]?.y, 200);
    assert.equal(byId.declined?.data[2]?.y, 80);
    assert.equal(byId.concept?.data[2]?.y, 0);
    // Future months after asOf (Oct) are null on the full-year axis.
    assert.equal(byId.concept?.data[10]?.y, null);
    assert.equal(estimateStatusAmountChartHasData(series), true);
  });
});

describe("buildEstimateStatusMonthContributions", () => {
  it("lists each estimate in the month with id, title, and amount", () => {
    const rows = buildEstimateStatusMonthContributions(
      [
        {
          id: "a",
          number: 2,
          title: "Website",
          documentDate: "2026-01-10",
          totalAmountCents: 10_000,
          status: "concept",
        },
        {
          id: "b",
          number: 3,
          title: "App",
          documentDate: "2026-01-20",
          totalAmountCents: 5_000,
          status: "approved",
        },
        {
          id: "c",
          number: 4,
          title: "Other year",
          documentDate: "2025-12-01",
          totalAmountCents: 9_000,
          status: "approved",
        },
      ],
      2026,
    );

    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((row) => ({
        id: row.id,
        displayId: row.displayId,
        title: row.title,
        status: row.status,
        month: row.month,
        amountCents: row.amountCents,
      })),
      [
        {
          id: "a",
          displayId: "ES-2",
          title: "Website",
          status: "concept",
          month: "2026-01",
          amountCents: 10_000,
        },
        {
          id: "b",
          displayId: "ES-3",
          title: "App",
          status: "approved",
          month: "2026-01",
          amountCents: 5_000,
        },
      ],
    );
  });
});

describe("estimateChartYears", () => {
  it("spans estimate dates and always includes the current year as latest floor", () => {
    const range = estimateChartYears(
      [
        { documentDate: "2024-06-01" },
        { documentDate: "2025-01-01" },
      ],
      new Date(2026, 5, 1),
    );
    assert.equal(range.earliestYear, 2024);
    assert.equal(range.latestYear, 2026);
  });
});
