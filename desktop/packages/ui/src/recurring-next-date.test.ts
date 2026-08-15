import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  advanceMonthlyNextDate,
  upcomingMonthlyPaymentDate,
} from "../dist/recurring-next-date.js";

describe("advanceMonthlyNextDate", () => {
  test("returns null for empty", () => {
    assert.equal(advanceMonthlyNextDate(null), null);
    assert.equal(advanceMonthlyNextDate(undefined), null);
    assert.equal(advanceMonthlyNextDate(""), null);
  });

  test("rolls a past-month date into the current month", () => {
    const asOf = new Date(2026, 1, 1); // 1 Feb 2026
    assert.equal(advanceMonthlyNextDate("2026-01-01", asOf), "2026-02-01");
  });

  test("rolls many months ahead preserving day-of-month", () => {
    const asOf = new Date(2026, 1, 15); // 15 Feb 2026
    assert.equal(advanceMonthlyNextDate("2025-06-12", asOf), "2026-02-12");
  });

  test("clamps day when target month is shorter", () => {
    const asOf = new Date(2026, 1, 1); // Feb 2026
    assert.equal(advanceMonthlyNextDate("2026-01-31", asOf), "2026-02-28");
  });

  test("leaves current-month dates unchanged", () => {
    const asOf = new Date(2026, 1, 20); // 20 Feb 2026
    assert.equal(advanceMonthlyNextDate("2026-02-01", asOf), "2026-02-01");
    assert.equal(advanceMonthlyNextDate("2026-02-28", asOf), "2026-02-28");
  });

  test("leaves future-month dates unchanged", () => {
    const asOf = new Date(2026, 1, 1); // Feb 2026
    assert.equal(advanceMonthlyNextDate("2026-03-01", asOf), "2026-03-01");
    assert.equal(advanceMonthlyNextDate("2027-01-15", asOf), "2027-01-15");
  });

  test("passes through invalid calendar strings", () => {
    assert.equal(advanceMonthlyNextDate("not-a-date"), "not-a-date");
  });
});

describe("upcomingMonthlyPaymentDate", () => {
  test("keeps a future date in the current month", () => {
    const asOf = new Date(2026, 7, 12); // 12 Aug 2026
    assert.equal(upcomingMonthlyPaymentDate("2026-08-16", asOf), "2026-08-16");
  });

  test("rolls a past day in the current month to next month", () => {
    const asOf = new Date(2026, 7, 20); // 20 Aug 2026
    assert.equal(upcomingMonthlyPaymentDate("2026-08-01", asOf), "2026-09-01");
  });

  test("includes today", () => {
    const asOf = new Date(2026, 7, 16);
    assert.equal(upcomingMonthlyPaymentDate("2026-08-16", asOf), "2026-08-16");
  });
});
