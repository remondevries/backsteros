import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  accumulateKindBasedIncomeExpense,
  buildIncomeCategoryIdSet,
  isCounterpartyOwnAccount,
  isOwnAccountTransfer,
  isOwnAccountTransferPayee,
} from "./cashflow-exclusion.js";

describe("isOwnAccountTransferPayee", () => {
  test("detects Amex thank-you credits", () => {
    assert.equal(
      isOwnAccountTransferPayee({
        payee: "HARTELIJK BEDANKT VOOR UW BETALING",
        amountCents: 645_53,
      }),
      true,
    );
    assert.equal(
      isOwnAccountTransferPayee({
        payee: "CREDIT SALDO OVERGEBOEKT",
        amountCents: 663_00,
      }),
      true,
    );
  });

  test("detects American Express payment debits from checking", () => {
    assert.equal(
      isOwnAccountTransferPayee({
        payee: "American Express",
        amountCents: -645_53,
      }),
      true,
    );
  });

  test("leaves ordinary merchants alone", () => {
    assert.equal(
      isOwnAccountTransferPayee({
        payee: "LINEAR.APP COVINA",
        amountCents: -2859,
      }),
      false,
    );
  });
});

describe("accumulateKindBasedIncomeExpense", () => {
  const incomeIds = new Set(["cat-salary"]);

  test("nets expense-kind credits into expense (A4)", () => {
    const totals = { incomeCents: 0, expenseCents: 0 };
    accumulateKindBasedIncomeExpense(-100_00, "cat-food", incomeIds, totals);
    accumulateKindBasedIncomeExpense(40_00, "cat-food", incomeIds, totals);
    assert.deepEqual(totals, { incomeCents: 0, expenseCents: 60_00 });
  });

  test("nets income-kind debits into income", () => {
    const totals = { incomeCents: 0, expenseCents: 0 };
    accumulateKindBasedIncomeExpense(5_000_00, "cat-salary", incomeIds, totals);
    accumulateKindBasedIncomeExpense(-200_00, "cat-salary", incomeIds, totals);
    assert.deepEqual(totals, { incomeCents: 4_800_00, expenseCents: 0 });
  });

  test("routes uncategorized by sign", () => {
    const totals = { incomeCents: 0, expenseCents: 0 };
    accumulateKindBasedIncomeExpense(50_00, null, incomeIds, totals);
    accumulateKindBasedIncomeExpense(-30_00, null, incomeIds, totals);
    assert.deepEqual(totals, { incomeCents: 50_00, expenseCents: 30_00 });
  });
});

describe("buildIncomeCategoryIdSet", () => {
  test("keeps only cashflow income kinds", () => {
    const ids = buildIncomeCategoryIdSet([
      { id: "a", kind: "income", listing: "regular" },
      { id: "b", kind: "expense", listing: "regular" },
      { id: "c", kind: "income", listing: "excluded" },
      { id: "d", kind: "transfer", listing: "regular" },
    ]);
    assert.deepEqual([...ids], ["a"]);
  });
});

describe("isOwnAccountTransfer", () => {
  const own = new Set(["NL80INGB0008304884", "NL43INGB0663319099"]);

  test("prefers own-account IBAN over payee", () => {
    assert.equal(
      isCounterpartyOwnAccount("NL43 INGB 0663 3190 99", own),
      true,
    );
    assert.equal(
      isOwnAccountTransfer({
        counterparty: "NL43INGB0663319099",
        payee: "LINEAR.APP",
        amountCents: -50_00,
        ownAccountRefs: own,
      }),
      true,
    );
  });

  test("falls back to payee heuristic when IBAN unknown", () => {
    assert.equal(
      isOwnAccountTransfer({
        counterparty: "NL63DEUT0265188040",
        payee: "American Express Europe SA",
        amountCents: -64_553,
        ownAccountRefs: own,
      }),
      true,
    );
  });
});
