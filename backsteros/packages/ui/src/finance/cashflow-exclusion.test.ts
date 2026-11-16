import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
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
