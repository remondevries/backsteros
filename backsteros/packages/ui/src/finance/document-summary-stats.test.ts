import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildTopCustomerShares,
  calendarMonthKey,
  monthKeyFromDocumentDate,
  parseMoneyAmountToCents,
  previousCalendarMonthKey,
  resolveMonthTotalCents,
  sumAmountForMonth,
  type DocumentSummaryLine,
} from "./document-summary-stats.js";

function line(
  partial: Partial<DocumentSummaryLine> & Pick<DocumentSummaryLine, "id">,
): DocumentSummaryLine {
  return {
    date: "2026-10-01",
    amountCents: 10_000,
    customerKey: "a",
    customerLabel: "Acme",
    ...partial,
  };
}

describe("document-summary-stats", () => {
  it("parses month keys and Moneybird amounts", () => {
    assert.equal(monthKeyFromDocumentDate("2026-10-15"), "2026-10");
    assert.equal(monthKeyFromDocumentDate("oktober 2026"), null);
    assert.equal(parseMoneyAmountToCents("12500.50"), 1_250_050);
    assert.equal(parseMoneyAmountToCents("12,5"), 1250);
  });

  it("computes calendar month keys", () => {
    assert.equal(calendarMonthKey(new Date(2026, 9, 8)), "2026-10");
    assert.equal(previousCalendarMonthKey(new Date(2026, 9, 8)), "2026-09");
    assert.equal(previousCalendarMonthKey(new Date(2026, 0, 3)), "2025-12");
  });

  it("sums amounts for a month", () => {
    const lines = [
      line({ id: "1", date: "2026-10-01", amountCents: 100 }),
      line({ id: "2", date: "2026-10-20", amountCents: 50 }),
      line({ id: "3", date: "2026-09-01", amountCents: 999 }),
    ];
    assert.equal(sumAmountForMonth(lines, "2026-10"), 150);
  });

  it("prefers series months when resolving totals", () => {
    assert.equal(
      resolveMonthTotalCents({
        monthKey: "2026-10",
        lines: [line({ id: "1", amountCents: 1 })],
        seriesMonths: [{ month: "2026-10", incomeCents: 42_000 }],
      }),
      42_000,
    );
  });

  it("builds at most three customer shares without an Other bucket", () => {
    const lines = [
      line({
        id: "1",
        customerKey: "a",
        customerLabel: "Acme",
        amountCents: 500,
        date: "2026-01-01",
      }),
      line({
        id: "2",
        customerKey: "b",
        customerLabel: "Beta",
        amountCents: 300,
        date: "2026-02-01",
      }),
      line({
        id: "3",
        customerKey: "c",
        customerLabel: "Cedar",
        amountCents: 100,
        date: "2026-03-01",
      }),
      line({
        id: "4",
        customerKey: "d",
        customerLabel: "Delta",
        amountCents: 50,
        date: "2026-04-01",
      }),
    ];
    const shares = buildTopCustomerShares(lines, { limit: 3, year: 2026 });
    assert.equal(shares.length, 3);
    assert.equal(shares[0]?.label, "Acme");
    assert.equal(shares[1]?.label, "Beta");
    assert.equal(shares[2]?.label, "Cedar");
    assert.ok(shares.every((row) => row.key !== "__other__"));
    assert.ok(Math.abs(shares.reduce((sum, row) => sum + row.share, 0) - 1) < 1e-9);
  });
});
