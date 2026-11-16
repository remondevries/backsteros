import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  invoiceBaseTotalCents,
  invoiceOutstandingBaseCents,
  invoiceUnpaidBaseCents,
  PAYABLE_INVOICE_STATES,
  PAYABLES_FILTER,
  RECEIVABLE_INVOICE_STATES,
  RECEIVABLES_FILTER,
  sumBilledRevenueByMonth,
  sumOutstandingBase,
} from "./moneybird-invoice-amounts.js";

const BILLED = new Set(["open", "late", "paid"]);

function inv(
  partial: Partial<Parameters<typeof invoiceBaseTotalCents>[0]> & {
    state?: string;
    invoiceDate?: string | null;
  },
) {
  return {
    state: "open",
    invoiceDate: "2026-03-10",
    currency: "EUR",
    totalPriceExclTax: null,
    totalPriceInclTax: null,
    ...partial,
  };
}

describe("invoiceBaseTotalCents", () => {
  it("prefers excl-tax base over face totals for foreign currency", () => {
    assert.equal(
      invoiceBaseTotalCents(
        inv({
          currency: "USD",
          totalPriceExclTax: "1000.00",
          totalPriceExclTaxBase: "900.00",
        }),
      ),
      90_000,
    );
  });

  it("falls back to incl-tax base, never to USD face", () => {
    assert.equal(
      invoiceBaseTotalCents(
        inv({
          currency: "USD",
          totalPriceExclTax: "1000.00",
          totalPriceInclTaxBase: "1089.00",
        }),
      ),
      108_900,
    );
    assert.equal(
      invoiceBaseTotalCents(
        inv({ currency: "USD", totalPriceExclTax: "1000.00" }),
      ),
      null,
    );
  });

  it("uses face totals when the invoice is in EUR or currency is unknown", () => {
    assert.equal(
      invoiceBaseTotalCents(inv({ totalPriceExclTax: "82.64" })),
      8264,
    );
    assert.equal(
      invoiceBaseTotalCents(
        inv({ currency: null, totalPriceInclTax: "100.00" }),
      ),
      10_000,
    );
  });

  it("supports incl-tax basis", () => {
    assert.equal(
      invoiceBaseTotalCents(
        inv({
          currency: "USD",
          totalPriceInclTaxBase: "121.00",
          totalPriceExclTaxBase: "100.00",
        }),
        "incl",
      ),
      12_100,
    );
  });
});

describe("sumBilledRevenueByMonth", () => {
  it("sums EUR base excl. VAT per month and ignores other years/states", () => {
    const map = sumBilledRevenueByMonth(
      [
        inv({
          currency: "USD",
          totalPriceExclTax: "1000.00",
          totalPriceExclTaxBase: "900.00",
        }),
        inv({ totalPriceExclTax: "100.00", totalPriceExclTaxBase: "100.00" }),
        inv({ state: "draft", totalPriceExclTaxBase: "5000.00" }),
        inv({
          invoiceDate: "2025-03-10",
          totalPriceExclTaxBase: "7777.00",
        }),
        inv({
          invoiceDate: "2026-04-01",
          state: "paid",
          currency: "USD",
          totalPriceExclTax: "50.00",
        }),
      ],
      2026,
      BILLED,
    );
    assert.equal(map.get("2026-03"), 100_000);
    // USD with no base figure contributes nothing instead of face-as-EUR.
    assert.equal(map.get("2026-04"), 0);
    assert.equal(map.has("2025-03"), false);
  });
});

describe("outstanding totals", () => {
  it("uses total_unpaid_base for foreign currency", () => {
    assert.equal(
      invoiceUnpaidBaseCents(
        inv({
          currency: "USD",
          totalUnpaid: "600.00",
          totalUnpaidBase: "540.00",
        }),
      ),
      54_000,
    );
    assert.equal(
      invoiceUnpaidBaseCents(inv({ currency: "USD", totalUnpaid: "600.00" })),
      null,
    );
    assert.equal(
      invoiceUnpaidBaseCents(inv({ totalUnpaid: "12.50" })),
      1250,
    );
  });

  it("sums receivables by state with overdue split", () => {
    const totals = sumOutstandingBase(
      [
        inv({ state: "open", totalUnpaidBase: "100.00" }),
        inv({ state: "reminded", totalUnpaidBase: "50.00" }),
        inv({
          state: "late",
          currency: "USD",
          totalUnpaid: "300.00",
          totalUnpaidBase: "270.00",
        }),
        inv({ state: "paid", totalUnpaidBase: "0.00" }),
        inv({ state: "draft", totalUnpaidBase: "999.00" }),
        inv({ state: "open", totalUnpaidBase: "0.00" }),
        inv({ state: "open", currency: "USD", totalUnpaid: "40.00" }),
      ],
      RECEIVABLE_INVOICE_STATES,
    );
    assert.deepEqual(totals, {
      totalCents: 42_000,
      // late (270) + reminded (50)
      overdueCents: 32_000,
      count: 3,
    });
  });

  it("sums payables for unpaid purchase states only", () => {
    const totals = sumOutstandingBase(
      [
        inv({ state: "open", totalUnpaidBase: "10.00" }),
        inv({ state: "late", totalUnpaidBase: "5.25" }),
        inv({ state: "paid", totalUnpaidBase: "99.00" }),
        inv({ state: "draft", totalUnpaidBase: "99.00" }),
      ],
      PAYABLE_INVOICE_STATES,
    );
    assert.deepEqual(totals, { totalCents: 1525, overdueCents: 525, count: 2 });
  });

  it("builds period-free state filters", () => {
    assert.equal(
      RECEIVABLES_FILTER,
      "state:open|scheduled|pending_payment|reminded|late",
    );
    assert.equal(PAYABLES_FILTER, "state:new|open|pending_payment|late");
    assert.equal(PAYABLE_INVOICE_STATES.has("new"), true);
  });

  it("treats reminded as overdue alongside late", () => {
    const totals = sumOutstandingBase(
      [
        inv({ state: "reminded", totalUnpaidBase: "20.00" }),
        inv({ state: "late", totalUnpaidBase: "30.00" }),
        inv({ state: "open", totalUnpaidBase: "50.00" }),
      ],
      RECEIVABLE_INVOICE_STATES,
    );
    assert.deepEqual(totals, {
      totalCents: 10_000,
      overdueCents: 5000,
      count: 3,
    });
  });
});

describe("purchase invoice payables (no unpaid fields)", () => {
  it("derives outstanding as incl-base total minus payments[].price_base", () => {
    assert.equal(
      invoiceOutstandingBaseCents(
        inv({
          currency: "USD",
          totalPriceInclTax: "300.00",
          totalPriceInclTaxBase: "250.00",
          totalPriceExclTaxBase: "206.61",
          payments: [
            { price: "60.00", priceBase: "50.00" },
            { price: "30.00", priceBase: "25.00" },
          ],
        }),
      ),
      17_500,
    );
  });

  it("falls back to excl base, and to EUR face only for EUR documents", () => {
    assert.equal(
      invoiceOutstandingBaseCents(
        inv({ currency: "USD", totalPriceExclTaxBase: "80.00" }),
      ),
      8000,
    );
    assert.equal(
      invoiceOutstandingBaseCents(
        inv({
          totalPriceInclTax: "100.00",
          payments: [{ price: "40.00", priceBase: null }],
        }),
      ),
      6000,
    );
    // USD face payment without a base figure is never treated as EUR.
    assert.equal(
      invoiceOutstandingBaseCents(
        inv({
          currency: "USD",
          totalPriceInclTaxBase: "100.00",
          payments: [{ price: "40.00", priceBase: null }],
        }),
      ),
      null,
    );
    assert.equal(
      invoiceOutstandingBaseCents(inv({ currency: "USD", totalPriceInclTax: "100.00" })),
      null,
    );
  });

  it("prefers total_unpaid_base when Moneybird provides it", () => {
    assert.equal(
      invoiceOutstandingBaseCents(
        inv({
          totalUnpaidBase: "12.00",
          totalPriceInclTaxBase: "100.00",
          payments: [{ price: "1.00", priceBase: "1.00" }],
        }),
      ),
      1200,
    );
  });

  it("matches the EUR 306.74 creditors fixture", () => {
    const purchases = [
      // booked, nothing paid yet
      inv({
        state: "new",
        totalPriceExclTaxBase: "100.00",
        totalPriceInclTaxBase: "121.00",
      }),
      // partially paid
      inv({
        state: "open",
        totalPriceInclTaxBase: "250.00",
        payments: [{ price: "100.00", priceBase: "100.00" }],
      }),
      // USD, overdue; base figures only
      inv({
        state: "late",
        currency: "USD",
        totalPriceInclTax: "40.00",
        totalPriceInclTaxBase: "35.74",
      }),
      // payment initiated but not matched yet, fully covered by payments
      inv({
        state: "pending_payment",
        totalPriceInclTaxBase: "80.00",
        payments: [{ price: "80.00", priceBase: "80.00" }],
      }),
      // not payable
      inv({ state: "paid", totalPriceInclTaxBase: "999.00" }),
      inv({ state: "draft", totalPriceInclTaxBase: "999.00" }),
    ];
    assert.deepEqual(sumOutstandingBase(purchases, PAYABLE_INVOICE_STATES), {
      totalCents: 30_674,
      overdueCents: 3574,
      count: 3,
    });
  });
});
