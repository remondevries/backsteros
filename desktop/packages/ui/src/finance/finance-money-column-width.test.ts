import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { measureFinanceMoneyLabelWidthPx } from "../../dist/finance/finance-money-column-width.js";

describe("measureFinanceMoneyLabelWidthPx", () => {
  it("returns the fallback minimum when there are no labels", () => {
    assert.equal(measureFinanceMoneyLabelWidthPx([]), 48);
  });
});
