import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mapStripeBalanceTransactionToLedgerRow,
  stripeBalanceTransactionFingerprint,
  stripeCreatedToBookedOn,
} from "./stripe-sync-map.js";

describe("stripe-sync-map", () => {
  it("maps unix created to bookedOn dates", () => {
    // 2026-11-06T12:00:00.000Z
    assert.equal(stripeCreatedToBookedOn(1_793_966_400), "2026-11-06");
    assert.equal(stripeCreatedToBookedOn(0), null);
  });

  it("fingerprints by Stripe balance transaction id", () => {
    assert.equal(
      stripeBalanceTransactionFingerprint("txn_123"),
      "stripe:txn_123",
    );
  });

  it("maps a balance transaction into a ledger row with stripe source metadata", () => {
    const row = mapStripeBalanceTransactionToLedgerRow(
      {
        id: "txn_abc",
        amount: 1050,
        currency: "eur",
        type: "charge",
        status: "available",
        created: 1_793_966_400,
        description: "Invoice 42",
        fee: 50,
        net: 1000,
        source: "ch_xyz",
      },
      "bank_account",
    );
    assert.ok(row);
    assert.equal(row.bookedOn, "2026-11-06");
    assert.equal(row.amountCents, 1000);
    assert.equal(row.currency, "EUR");
    assert.equal(row.payee, "Invoice 42");
    assert.equal(row.counterparty, "ch_xyz");
    assert.equal(row.externalId, "txn_abc");
    assert.equal(row.fingerprint, "stripe:txn_abc");
    assert.equal(row.sourceCode, "stripe");
    assert.equal(row.sourceType, "charge");
    assert.equal(row.settlementState, "settled");
    assert.equal(row.raw.stripe_fee, 50);
  });
});
