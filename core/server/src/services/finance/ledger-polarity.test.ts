import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toCashflowAmountCents } from "./ledger-polarity.js";

describe("toCashflowAmountCents", () => {
  it("leaves bank / savings / investment amounts unchanged", () => {
    assert.equal(toCashflowAmountCents(1200, "bank_account"), 1200);
    assert.equal(toCashflowAmountCents(-500, "bank_account"), -500);
    assert.equal(toCashflowAmountCents(100, "savings"), 100);
    assert.equal(toCashflowAmountCents(-100, "investment"), -100);
    assert.equal(toCashflowAmountCents(50, null), 50);
  });

  it("flips credit_card liability polarity to cashflow polarity", () => {
    // AMEX purchase (positive in CSV) → expense
    assert.equal(toCashflowAmountCents(2173, "credit_card"), -2173);
    // AMEX payment / credit (negative in CSV) → inflow that reduces debt
    assert.equal(toCashflowAmountCents(-1778, "credit_card"), 1778);
  });
});
