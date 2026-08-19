import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatCalendarDate,
  formatCents,
  formatFullTxDate,
  formatMonthLabel,
  formatSignedCents,
  formatTxDateShort,
  shiftMonthKey,
  trailingMonthKeys,
  transactionDisplayTitle,
} from "./finance-format";

describe("formatCents", () => {
  it("formats euros with thousands grouping", () => {
    assert.equal(formatCents(123456789), "€1.234.567,89");
  });

  it("formats negative amounts", () => {
    assert.equal(formatCents(-1050), "-€10,50");
  });

  it("formats zero", () => {
    assert.equal(formatCents(0), "€0,00");
  });

  it("uses known currency symbols and falls back to the code", () => {
    assert.equal(formatCents(500, "USD"), "$5,00");
    assert.equal(formatCents(500, "CHF"), "CHF 5,00");
  });
});

describe("formatSignedCents", () => {
  it("prefixes credits with plus", () => {
    assert.equal(formatSignedCents(1050), "+€10,50");
  });

  it("keeps debits negative", () => {
    assert.equal(formatSignedCents(-1050), "-€10,50");
  });
});

describe("shiftMonthKey", () => {
  it("shifts within a year", () => {
    assert.equal(shiftMonthKey("2026-08", -1), "2026-07");
  });

  it("shifts across year boundaries", () => {
    assert.equal(shiftMonthKey("2026-01", -1), "2025-12");
    assert.equal(shiftMonthKey("2025-12", 1), "2026-01");
    assert.equal(shiftMonthKey("2026-02", -14), "2024-12");
  });
});

describe("trailingMonthKeys", () => {
  it("returns the window oldest first, inclusive", () => {
    assert.deepEqual(trailingMonthKeys("2026-02", 4), [
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });
});

describe("formatMonthLabel", () => {
  it("renders full month and year", () => {
    assert.equal(formatMonthLabel("2026-08"), "August 2026");
  });
});

describe("formatCalendarDate", () => {
  it("renders a compact day label", () => {
    assert.equal(formatCalendarDate("2026-08-05"), "5 Aug 2026");
  });
});

describe("formatFullTxDate", () => {
  it("formats weekday, short month, day, year", () => {
    assert.equal(formatFullTxDate("2026-08-15"), "Saturday, Aug 15, 2026");
  });
});

describe("formatTxDateShort", () => {
  it("renders day and short month without the year", () => {
    assert.equal(formatTxDateShort("2026-08-05"), "5 Aug");
    assert.equal(formatTxDateShort("2026-07-25"), "25 Jul");
  });
});

describe("transactionDisplayTitle", () => {
  it("prefers displayName, then payee, memo, counterparty", () => {
    assert.equal(
      transactionDisplayTitle({
        displayName: "Coffee",
        payee: "STARBUCKS 123",
        memo: null,
        counterparty: null,
      }),
      "Coffee",
    );
    assert.equal(
      transactionDisplayTitle({
        displayName: "  ",
        payee: "STARBUCKS 123",
        memo: null,
        counterparty: null,
      }),
      "STARBUCKS 123",
    );
    assert.equal(
      transactionDisplayTitle({
        displayName: null,
        payee: "",
        memo: "Monthly rent",
        counterparty: null,
      }),
      "Monthly rent",
    );
    assert.equal(
      transactionDisplayTitle({
        displayName: null,
        payee: "",
        memo: null,
        counterparty: null,
      }),
      "Transaction",
    );
  });
});
