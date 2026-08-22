import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MoneybirdSalesInvoiceSummary } from "@backsteros/contracts";

import { DROPDOWN_NONE_VALUE } from "../../dist/components/dropdowns/dropdown-options.js";
import {
  buildMoneybirdInvoicesFilter,
  filterFinanceInvoices,
} from "../../dist/finance/filter-finance-invoices.js";

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
