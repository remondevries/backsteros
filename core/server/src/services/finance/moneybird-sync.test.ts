import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MoneybirdFinancialMutation } from "../../lib/moneybird-client.js";
import {
  mapMoneybirdMutationToLedgerRow,
  moneybirdMutationFingerprint,
  parseMoneybirdAmountToCents,
} from "./moneybird-sync-map.js";

function sampleMutation(
  overrides: Partial<MoneybirdFinancialMutation> = {},
): MoneybirdFinancialMutation {
  return {
    id: "497158965890647593",
    amount: "-42.50",
    code: null,
    date: "2026-09-02",
    message: "Office supplies",
    contraAccountName: "Staples",
    contraAccountNumber: "NL00BANK0123456789",
    state: "unprocessed",
    settlementState: "settled",
    financialAccountId: "497158965840315923",
    currency: "EUR",
    accountServicerTransactionId: null,
    version: 1,
    raw: { id: "497158965890647593", amount: "-42.50" },
    ...overrides,
  };
}

describe("moneybird-sync mapping", () => {
  it("parses Moneybird decimal amounts to cents", () => {
    assert.equal(parseMoneybirdAmountToCents("100.0"), 10000);
    assert.equal(parseMoneybirdAmountToCents("-12.50"), -1250);
    assert.equal(parseMoneybirdAmountToCents("0.01"), 1);
  });

  it("maps mutation fields onto ledger columns", () => {
    const row = mapMoneybirdMutationToLedgerRow(sampleMutation(), "bank_account");
    assert.equal(row.bookedOn, "2026-09-02");
    assert.equal(row.amountCents, -4250);
    assert.equal(row.currency, "EUR");
    assert.equal(row.payee, "Staples");
    assert.equal(row.counterparty, "NL00BANK0123456789");
    assert.equal(row.memo, "Office supplies");
    assert.equal(row.externalId, "497158965890647593");
    assert.equal(
      row.fingerprint,
      moneybirdMutationFingerprint("497158965890647593"),
    );
    assert.equal(row.sourceCode, "moneybird");
    assert.equal(row.sourceType, "unprocessed");
  });

  it("applies credit-card cashflow polarity", () => {
    const charge = mapMoneybirdMutationToLedgerRow(
      sampleMutation({ amount: "25.00" }),
      "credit_card",
    );
    assert.equal(charge.amountCents, -2500);
  });
});
