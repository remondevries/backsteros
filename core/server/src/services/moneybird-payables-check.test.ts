import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MoneybirdPurchaseInvoice } from "../lib/moneybird-client.js";
import {
  checkMoneybirdPayables,
  computeMoneybirdPayablesTotals,
  evaluateMoneybirdPayablesCheck,
  formatPayablesCheckSummary,
} from "./moneybird-payables-check.js";

function inv(
  partial: Partial<MoneybirdPurchaseInvoice> & { state: string },
): MoneybirdPurchaseInvoice {
  return {
    id: partial.id ?? "1",
    state: partial.state,
    reference: null,
    date: null,
    dueDate: null,
    currency: partial.currency ?? "EUR",
    totalPriceInclTax: partial.totalPriceInclTax ?? null,
    totalPriceExclTax: partial.totalPriceExclTax ?? null,
    totalPriceInclTaxBase: partial.totalPriceInclTaxBase ?? null,
    totalPriceExclTaxBase: partial.totalPriceExclTaxBase ?? null,
    totalUnpaid: partial.totalUnpaid ?? null,
    totalUnpaidBase: partial.totalUnpaidBase ?? null,
    payments: partial.payments ?? [],
    contactId: null,
    contactName: null,
  };
}

/** Synthetic fixture only — not a live Moneybird baseline (OS-184). */
const FIXTURE_EXPECTED_CENTS = 30_674;

function creditorsFixture(): MoneybirdPurchaseInvoice[] {
  return [
    inv({
      state: "new",
      totalPriceExclTaxBase: "100.00",
      totalPriceInclTaxBase: "121.00",
    }),
    inv({
      state: "open",
      totalPriceInclTaxBase: "250.00",
      payments: [
        { id: "p1", paymentDate: null, price: "100.00", priceBase: "100.00" },
      ],
    }),
    inv({
      state: "late",
      currency: "USD",
      totalPriceInclTax: "40.00",
      totalPriceInclTaxBase: "35.74",
    }),
    inv({
      state: "pending_payment",
      totalPriceInclTaxBase: "80.00",
      payments: [
        { id: "p2", paymentDate: null, price: "80.00", priceBase: "80.00" },
      ],
    }),
    inv({ state: "paid", totalPriceInclTaxBase: "999.00" }),
    inv({ state: "draft", totalPriceInclTaxBase: "999.00" }),
  ];
}

describe("evaluateMoneybirdPayablesCheck (OS-175 / OS-184)", () => {
  it("reports live totals without a hard-coded expected baseline", () => {
    const result = evaluateMoneybirdPayablesCheck(creditorsFixture());
    assert.equal(result.totalCents, FIXTURE_EXPECTED_CENTS);
    assert.equal(result.expectedCents, null);
    assert.equal(result.deltaCents, null);
    assert.equal(result.withinTolerance, null);
    assert.equal(result.count, 3);
    assert.equal(result.overdueCents, 3574);
    assert.match(
      formatPayablesCheckSummary(result),
      /^payablesEUR=306\.74 overdueEUR=35\.74 count=3 filter=/,
    );
  });

  it("compares only when expectedCents is supplied by the caller", () => {
    const result = evaluateMoneybirdPayablesCheck(
      [
        inv({
          state: "open",
          totalPriceInclTaxBase: "400.00",
        }),
      ],
      { expectedCents: FIXTURE_EXPECTED_CENTS, toleranceCents: 1 },
    );
    assert.equal(result.withinTolerance, false);
    assert.equal(result.deltaCents, 40_000 - FIXTURE_EXPECTED_CENTS);
    assert.match(
      formatPayablesCheckSummary(result),
      /expectedEUR=306\.74.*withinTolerance=false/,
    );
  });

  it("ignores total_unpaid_base=0 when summing purchase payables", () => {
    const totals = computeMoneybirdPayablesTotals([
      inv({
        state: "open",
        totalUnpaidBase: "0.00",
        totalPriceInclTaxBase: "354.25",
      }),
    ]);
    assert.deepEqual(totals, {
      totalCents: 35_425,
      overdueCents: 0,
      count: 1,
    });
  });
});

describe("checkMoneybirdPayables (OS-175 / OS-184)", () => {
  it("loads via deps and never requires a live Moneybird call", async () => {
    let loads = 0;
    const result = await checkMoneybirdPayables({
      listPurchaseInvoices: async () => {
        loads += 1;
        return creditorsFixture();
      },
    });
    assert.equal(loads, 1);
    assert.equal(result.totalCents, FIXTURE_EXPECTED_CENTS);
    assert.equal(result.withinTolerance, null);
    assert.match(
      formatPayablesCheckSummary(result),
      /payablesEUR=306\.74.*count=3/,
    );
  });
});
