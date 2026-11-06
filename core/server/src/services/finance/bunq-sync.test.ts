import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bunqPaymentFingerprint,
  bunqTimestampToBookedOn,
  mapBunqPaymentToLedgerRow,
  parseBunqAmountToCents,
} from "./bunq-sync-map.js";

describe("bunq-sync-map", () => {
  it("parses bunq decimal amounts to cents", () => {
    assert.equal(parseBunqAmountToCents("12.34"), 1234);
    assert.equal(parseBunqAmountToCents("-5.00"), -500);
  });

  it("maps bunq timestamps to bookedOn dates", () => {
    assert.equal(
      bunqTimestampToBookedOn("2026-11-06 12:00:00.000000"),
      "2026-11-06",
    );
    assert.equal(bunqTimestampToBookedOn(null), null);
  });

  it("maps a payment into a ledger row with bunq source metadata", () => {
    const row = mapBunqPaymentToLedgerRow(
      {
        id: "99",
        created: "2026-11-06 09:15:00.000000",
        updated: null,
        amount: { value: "-3.50", currency: "EUR" },
        description: "Coffee",
        counterpartyName: "Cafe",
        counterpartyIban: "NL00BUNQ0000000000",
        type: "EBA_SCT",
        subType: "PAYMENT",
      },
      "bank_account",
      "100",
    );
    assert.ok(row);
    assert.equal(row.bookedOn, "2026-11-06");
    assert.equal(row.amountCents, -350);
    assert.equal(row.payee, "Cafe");
    assert.equal(row.counterparty, "NL00BUNQ0000000000");
    assert.equal(row.memo, "Coffee");
    assert.equal(row.externalId, "99");
    assert.equal(row.fingerprint, bunqPaymentFingerprint("99"));
    assert.equal(row.sourceCode, "bunq");
    assert.equal(row.settlementState, "settled");
    assert.equal(row.raw.bunq_monetary_account_id, "100");
  });
});
