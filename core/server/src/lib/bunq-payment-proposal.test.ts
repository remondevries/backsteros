import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertValidBunqIban,
  hashBunqPaymentProposal,
  isApprovedAmountAllowed,
  isBunqLivePaymentWriteAllowed,
  isBunqPaymentProposalsEnabled,
  normalizeBunqAmountValue,
  proposalHashesEqual,
} from "./bunq-payment-proposal.js";

describe("bunq payment proposal feature gates", () => {
  it("defaults payment proposals to disabled", () => {
    assert.equal(isBunqPaymentProposalsEnabled({}), false);
    assert.equal(
      isBunqPaymentProposalsEnabled({ BUNQ_PAYMENT_PROPOSALS_ENABLED: "true" }),
      true,
    );
  });

  it("refuses live payment writes in tests", () => {
    assert.equal(
      isBunqLivePaymentWriteAllowed({ NODE_ENV: "test" }),
      false,
    );
    assert.equal(
      isBunqLivePaymentWriteAllowed({
        NODE_ENV: "production",
        BUNQ_ALLOW_LIVE_PAYMENT_WRITES: "true",
      }),
      true,
    );
  });
});

describe("bunq payment proposal hash + IBAN", () => {
  it("normalizes and hashes canonical fields stably", () => {
    const a = hashBunqPaymentProposal({
      recipientName: "  Ada  Lovelace ",
      recipientIban: "nl91 abna 0417 1643 00",
      amountValue: "10.5",
      amountCurrency: "eur",
      memo: " Rent ",
      sourceMonetaryAccountId: "123",
    });
    const b = hashBunqPaymentProposal({
      recipientName: "Ada Lovelace",
      recipientIban: "NL91ABNA0417164300",
      amountValue: "10.50",
      amountCurrency: "EUR",
      memo: "Rent",
      sourceMonetaryAccountId: "123",
    });
    assert.equal(a.proposalHash, b.proposalHash);
    assert.equal(a.canonical.amountValue, "10.50");
    assert.equal(a.canonical.recipientIban, "NL91ABNA0417164300");
    assert.equal(a.proposalHash.length, 64);
    assert.equal(proposalHashesEqual(a.proposalHash, b.proposalHash), true);
  });

  it("rejects tampered hash comparison", () => {
    const { proposalHash } = hashBunqPaymentProposal({
      recipientName: "Ada",
      recipientIban: "NL91ABNA0417164300",
      amountValue: "1.00",
      amountCurrency: "EUR",
      memo: "x",
      sourceMonetaryAccountId: "1",
    });
    assert.equal(proposalHashesEqual(proposalHash, "0".repeat(64)), false);
  });

  it("validates IBAN checksum", () => {
    assert.equal(assertValidBunqIban("NL91ABNA0417164300"), "NL91ABNA0417164300");
    assert.throws(() => assertValidBunqIban("NL00ABNA0417164300"));
  });

  it("allows approved amount only when ≤ proposed", () => {
    assert.equal(isApprovedAmountAllowed("10.00", "10.00"), true);
    assert.equal(isApprovedAmountAllowed("10.00", "9.99"), true);
    assert.equal(isApprovedAmountAllowed("10.00", "10.01"), false);
    assert.throws(() => normalizeBunqAmountValue("-1"));
  });
});
