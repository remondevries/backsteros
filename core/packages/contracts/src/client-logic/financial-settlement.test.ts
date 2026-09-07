import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isBalanceAffectingFinancialSettlement,
  isVoidFinancialSettlement,
  normalizeFinancialSettlementState,
} from "./financial-settlement.js";

describe("financial settlement", () => {
  it("normalizes and treats null/empty as settled", () => {
    assert.equal(normalizeFinancialSettlementState(null), null);
    assert.equal(normalizeFinancialSettlementState("  "), null);
    assert.equal(normalizeFinancialSettlementState("Settled"), "settled");
    assert.equal(isVoidFinancialSettlement(null), false);
    assert.equal(isVoidFinancialSettlement("settled"), false);
    assert.equal(isBalanceAffectingFinancialSettlement(null), true);
  });

  it("marks refused / cancelled / stale failures as void", () => {
    for (const state of [
      "refused",
      "cancelled",
      "canceled",
      "expired",
      "failed",
      "error",
      "returned",
      " Refused ",
    ]) {
      assert.equal(isVoidFinancialSettlement(state), true, state);
      assert.equal(isBalanceAffectingFinancialSettlement(state), false, state);
    }
  });

  it("keeps pending / authorised / captured as balance-affecting", () => {
    for (const state of ["pending", "authorised", "captured", "settled"]) {
      assert.equal(isVoidFinancialSettlement(state), false, state);
      assert.equal(isBalanceAffectingFinancialSettlement(state), true, state);
    }
  });
});
