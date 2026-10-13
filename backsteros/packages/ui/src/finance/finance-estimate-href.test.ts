import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getFinanceEstimateHref,
  getFinanceEstimateIdFromPathname,
} from "./finance-nav.js";

describe("getFinanceEstimateHref", () => {
  it("builds a detail path under /finance/estimates", () => {
    assert.equal(
      getFinanceEstimateHref("est_abc"),
      "/finance/estimates/est_abc",
    );
  });

  it("encodes the estimate id", () => {
    assert.equal(
      getFinanceEstimateHref("a/b"),
      "/finance/estimates/a%2Fb",
    );
  });
});

describe("getFinanceEstimateIdFromPathname", () => {
  it("reads the third segment on estimates", () => {
    assert.equal(
      getFinanceEstimateIdFromPathname("/finance/estimates/est_abc"),
      "est_abc",
    );
  });

  it("returns null on the estimates list", () => {
    assert.equal(getFinanceEstimateIdFromPathname("/finance/estimates"), null);
  });

  it("returns null for other finance pages", () => {
    assert.equal(getFinanceEstimateIdFromPathname("/finance/invoices"), null);
    assert.equal(
      getFinanceEstimateIdFromPathname("/finance/invoices/inv_1"),
      null,
    );
  });
});
