import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MoneybirdPurchaseInvoice } from "../lib/moneybird-client.js";
import {
  MONEYBIRD_PAYABLES_EXPECTED_CENTS,
  checkMoneybirdPayables,
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

/** Same fixture as moneybird-invoice-amounts.test.ts (EUR 306.74). */
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

describe("evaluateMoneybirdPayablesCheck (OS-175)", () => {
  it("matches the EUR 306.74 creditors fixture within tolerance", () => {
    const result = evaluateMoneybirdPayablesCheck(creditorsFixture());
    assert.equal(result.totalCents, MONEYBIRD_PAYABLES_EXPECTED_CENTS);
    assert.equal(result.expectedCents, 30_674);
    assert.equal(result.deltaCents, 0);
    assert.equal(result.withinTolerance, true);
    assert.equal(result.count, 3);
    assert.equal(result.overdueCents, 3574);
  });

  it("flags when live totals drift outside tolerance", () => {
    const result = evaluateMoneybirdPayablesCheck(
      [
        inv({
          state: "open",
          totalPriceInclTaxBase: "400.00",
        }),
      ],
      { expectedCents: 30_674, toleranceCents: 1 },
    );
    assert.equal(result.withinTolerance, false);
    assert.equal(result.deltaCents, 40_000 - 30_674);
  });
});

describe("checkMoneybirdPayables (OS-175)", () => {
  it("loads via deps and never requires a live Moneybird call", async () => {
    let loads = 0;
    const result = await checkMoneybirdPayables({
      listPurchaseInvoices: async () => {
        loads += 1;
        return creditorsFixture();
      },
    });
    assert.equal(loads, 1);
    assert.equal(result.withinTolerance, true);
    assert.match(
      formatPayablesCheckSummary(result),
      /payablesEUR=306\.74.*expectedEUR=306\.74.*withinTolerance=true/,
    );
  });
});
