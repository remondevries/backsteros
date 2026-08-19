import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { financeSectionForPathname } from "./finance-sections";

describe("financeSectionForPathname", () => {
  it("maps section roots", () => {
    assert.equal(financeSectionForPathname("/finance"), "dashboard");
    assert.equal(
      financeSectionForPathname("/finance/transactions"),
      "transactions",
    );
    assert.equal(financeSectionForPathname("/finance/invoices"), "invoices");
    assert.equal(financeSectionForPathname("/finance/goals"), "goals");
    assert.equal(financeSectionForPathname("/finance/cashflow"), "cashflow");
    assert.equal(financeSectionForPathname("/finance/accounts"), "accounts");
    assert.equal(
      financeSectionForPathname("/finance/investments"),
      "investments",
    );
    assert.equal(
      financeSectionForPathname("/finance/categories"),
      "categories",
    );
    assert.equal(
      financeSectionForPathname("/finance/recurrings"),
      "recurrings",
    );
  });

  it("maps detail routes into their section", () => {
    assert.equal(
      financeSectionForPathname("/finance/transaction/t1"),
      "transactions",
    );
    assert.equal(financeSectionForPathname("/finance/invoice/i1"), "invoices");
    assert.equal(financeSectionForPathname("/finance/account/a1"), "accounts");
    assert.equal(
      financeSectionForPathname("/finance/category/c1"),
      "categories",
    );
    assert.equal(financeSectionForPathname("/finance/goal/g1"), "goals");
    assert.equal(
      financeSectionForPathname("/finance/recurring/r1"),
      "recurrings",
    );
  });

  it("returns null outside finance and for unknown segments", () => {
    assert.equal(financeSectionForPathname("/tasks"), null);
    assert.equal(financeSectionForPathname("/finance/unknown"), null);
  });
});
