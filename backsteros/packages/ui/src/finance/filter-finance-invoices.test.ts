import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MoneybirdSalesInvoiceSummary } from "@backsteros/contracts";

import { DROPDOWN_NONE_VALUE } from "../components/dropdowns/dropdown-options.js";
import {
  buildInvoiceSummaryLines,
  buildMoneybirdInvoicesFilter,
  filterFinanceInvoices,
  invoiceAmountExclVat,
  invoiceAmountExclVatBase,
  isBilledInvoiceState,
} from "./filter-finance-invoices.js";
import { buildTopCustomerShares } from "./document-summary-stats.js";

function invoice(
  partial: Partial<MoneybirdSalesInvoiceSummary> & { id: string },
): MoneybirdSalesInvoiceSummary {
  return {
    invoiceId: "2026-001",
    state: "open",
    invoiceDate: "2026-01-15",
    dueDate: null,
    reference: "Project work",
    currency: "EUR",
    totalPriceInclTax: "100.00",
    totalPriceExclTax: "82.64",
    contactId: "mb-1",
    contactName: "Acme BV",
    ...partial,
  };
}

describe("filterFinanceInvoices", () => {
  const rows = [
    {
      ...invoice({ id: "1", invoiceId: "2026-001", contactName: "Acme BV" }),
      linkedOrganizationId: "org-1",
      linkedOrganizationName: "Acme",
    },
    {
      ...invoice({
        id: "2",
        invoiceId: "2026-002",
        reference: "Retainer",
        contactName: "Solo",
      }),
      linkedOrganizationId: null,
      linkedOrganizationName: null,
    },
  ];

  it("filters by search and organization", () => {
    assert.deepEqual(
      filterFinanceInvoices(rows, {
        search: "retainer",
        organizationId: null,
      }).map((row) => row.id),
      ["2"],
    );

    assert.deepEqual(
      filterFinanceInvoices(rows, {
        search: "",
        organizationId: "org-1",
      }).map((row) => row.id),
      ["1"],
    );

    assert.deepEqual(
      filterFinanceInvoices(rows, {
        search: "",
        organizationId: DROPDOWN_NONE_VALUE,
      }).map((row) => row.id),
      ["2"],
    );
  });
});

describe("buildMoneybirdInvoicesFilter", () => {
  it("builds period-only and period+state filters", () => {
    assert.equal(
      buildMoneybirdInvoicesFilter(2026),
      "period:20260101..20261231",
    );
    assert.equal(
      buildMoneybirdInvoicesFilter(2026, ["open", "paid"]),
      "period:20260101..20261231,state:open|paid",
    );
    assert.equal(
      buildMoneybirdInvoicesFilter(2026, [], { contactId: "99" }),
      "period:20260101..20261231,contact_id:99",
    );
  });
});

describe("invoice excl. VAT helpers", () => {
  it("prefers excl. VAT and recognizes billed states", () => {
    assert.equal(
      invoiceAmountExclVat(
        invoice({ id: "1", totalPriceExclTax: "82.64", totalPriceInclTax: "100.00" }),
      ),
      "82.64",
    );
    assert.equal(
      invoiceAmountExclVat(
        invoice({ id: "2", totalPriceExclTax: null, totalPriceInclTax: "100.00" }),
      ),
      "100.00",
    );
    assert.equal(isBilledInvoiceState("open"), true);
    assert.equal(isBilledInvoiceState("paid"), true);
    assert.equal(isBilledInvoiceState("draft"), false);
    assert.equal(isBilledInvoiceState("uncollectible"), false);
  });
});

describe("EUR base aggregates", () => {
  const usd = invoice({
    id: "usd",
    currency: "USD",
    totalPriceExclTax: "1000.00",
    totalPriceInclTax: "1210.00",
    totalPriceExclTaxBase: "900.00",
    totalPriceInclTaxBase: "1089.00",
    contactId: "mb-usd",
    contactName: "US Client",
  });

  it("keeps row amounts in document currency, aggregates in EUR base", () => {
    assert.equal(invoiceAmountExclVat(usd), "1000.00");
    assert.equal(invoiceAmountExclVatBase(usd), "900.00");
  });

  it("never treats a foreign face amount as EUR", () => {
    assert.equal(
      invoiceAmountExclVatBase(
        invoice({ id: "x", currency: "USD", totalPriceExclTax: "1000.00" }),
      ),
      null,
    );
    assert.equal(
      invoiceAmountExclVatBase(
        invoice({
          id: "y",
          currency: "USD",
          totalPriceExclTax: "1000.00",
          totalPriceInclTaxBase: "1089.00",
        }),
      ),
      "1089.00",
    );
    assert.equal(
      invoiceAmountExclVatBase(
        invoice({ id: "z", totalPriceExclTax: null, totalPriceInclTax: "100.00" }),
      ),
      "100.00",
    );
  });

  it("builds billed summary lines and customer shares from EUR base", () => {
    const lines = buildInvoiceSummaryLines([
      usd,
      invoice({
        id: "eur",
        totalPriceExclTax: "500.00",
        totalPriceExclTaxBase: "500.00",
        contactId: "mb-eur",
        contactName: "EU Client",
      }),
      invoice({ id: "draft", state: "draft", totalPriceExclTaxBase: "9999.00" }),
    ]);
    assert.equal(lines.length, 2);
    assert.equal(lines.find((l) => l.id === "usd")?.amountCents, 90_000);
    const shares = buildTopCustomerShares(lines, { year: 2026 });
    assert.equal(shares[0]?.label, "US Client");
    assert.equal(shares[0]?.amountCents, 90_000);
    assert.ok(Math.abs((shares[0]?.share ?? 0) - 900 / 1400) < 1e-9);
  });
});
