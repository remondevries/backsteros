import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildMoneybirdInvoicesMonthPeriodFilter,
  buildMoneybirdInvoicesPeriodFilter,
  buildTransactionsPath,
} from "./finance-api";

describe("buildTransactionsPath", () => {
  it("defaults to the workspace list with the desktop page limit", () => {
    assert.equal(buildTransactionsPath({}), "/api/v1/transactions?limit=200");
  });

  it("scopes to a bank account", () => {
    assert.equal(
      buildTransactionsPath({ accountId: "acc 1" }),
      "/api/v1/bank-accounts/acc%201/transactions?limit=200",
    );
  });

  it("serializes filters, cursor and total flag", () => {
    const path = buildTransactionsPath({
      q: " coffee ",
      categoryId: "cat1",
      uncategorized: true,
      month: "2026-08",
      cursor: "abc",
      includeTotal: true,
      limit: 50,
    });
    const [base, query] = path.split("?");
    const params = new URLSearchParams(query);
    assert.equal(base, "/api/v1/transactions");
    assert.equal(params.get("q"), "coffee");
    assert.equal(params.get("categoryId"), "cat1");
    assert.equal(params.get("uncategorized"), "true");
    assert.equal(params.get("month"), "2026-08");
    assert.equal(params.get("cursor"), "abc");
    assert.equal(params.get("includeTotal"), "true");
    assert.equal(params.get("limit"), "50");
  });

  it("omits empty search strings", () => {
    assert.equal(
      buildTransactionsPath({ q: "   " }),
      "/api/v1/transactions?limit=200",
    );
  });
});

describe("buildMoneybirdInvoicesPeriodFilter", () => {
  it("scopes to the calendar year", () => {
    assert.equal(
      buildMoneybirdInvoicesPeriodFilter(2026),
      "period:20260101..20261231",
    );
  });
});

describe("buildMoneybirdInvoicesMonthPeriodFilter", () => {
  it("scopes to billed invoices in the calendar month including last day", () => {
    assert.equal(
      buildMoneybirdInvoicesMonthPeriodFilter("2026-02"),
      "period:20260201..20260228,state:open|scheduled|pending_payment|reminded|late|paid",
    );
    assert.equal(
      buildMoneybirdInvoicesMonthPeriodFilter("2024-02"),
      "period:20240201..20240229,state:open|scheduled|pending_payment|reminded|late|paid",
    );
  });
});
