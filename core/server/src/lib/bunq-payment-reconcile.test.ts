import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BUNQ_IDEMPOTENCY_RETRY_WINDOW_MS,
  isIdempotencyRetryWindowExpired,
  isStuckApproved,
  matchProposalPayments,
} from "./bunq-payment-reconcile.js";

const NOW = new Date("2026-11-16T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;

describe("isIdempotencyRetryWindowExpired (23h)", () => {
  it("allows retry inside the window and refuses beyond 23h", () => {
    assert.equal(BUNQ_IDEMPOTENCY_RETRY_WINDOW_MS, 23 * HOUR);
    assert.equal(isIdempotencyRetryWindowExpired(ago(22 * HOUR), NOW), false);
    assert.equal(isIdempotencyRetryWindowExpired(ago(23 * HOUR), NOW), false);
    assert.equal(isIdempotencyRetryWindowExpired(ago(23 * HOUR + 1), NOW), true);
  });
  it("treats a missing attempt timestamp as expired (cannot prove the key is fresh)", () => {
    assert.equal(isIdempotencyRetryWindowExpired(null, NOW), true);
  });
});

describe("isStuckApproved (2 min)", () => {
  const base = {
    status: "approved",
    bunqPaymentId: null,
    approvedAt: ago(10 * MIN),
    updatedAt: ago(10 * MIN),
  };
  it("flags approved rows with an old attempt and no payment id", () => {
    assert.equal(isStuckApproved({ ...base, paymentAttemptedAt: ago(3 * MIN) }, NOW), true);
    assert.equal(isStuckApproved({ ...base, paymentAttemptedAt: ago(2 * MIN) }, NOW), true);
  });
  it("leaves fresh attempts alone", () => {
    assert.equal(isStuckApproved({ ...base, paymentAttemptedAt: ago(30_000) }, NOW), false);
  });
  it("never flags rows with a bunq payment id or another status", () => {
    assert.equal(
      isStuckApproved({ ...base, bunqPaymentId: "42", paymentAttemptedAt: ago(10 * MIN) }, NOW),
      false,
    );
    assert.equal(
      isStuckApproved({ ...base, status: "executed", paymentAttemptedAt: ago(10 * MIN) }, NOW),
      false,
    );
  });
  it("falls back to approvedAt when no attempt was recorded", () => {
    assert.equal(isStuckApproved({ ...base, paymentAttemptedAt: null }, NOW), true);
    assert.equal(
      isStuckApproved({ ...base, paymentAttemptedAt: null, approvedAt: ago(30_000) }, NOW),
      false,
    );
  });
});

describe("matchProposalPayments", () => {
  const facts = {
    recipientIban: "NL91ABNA0417164300",
    amountValue: "12.34",
    approvedAmountValue: null,
    amountCurrency: "EUR",
    memo: "Invoice 7",
    paymentAttemptedAt: new Date("2026-11-16T10:00:00.000Z"),
  };
  const payment = {
    id: "p1",
    created: "2026-11-16 10:00:05.000000",
    amountValue: "-12.34",
    amountCurrency: "EUR",
    description: "Invoice 7",
    counterpartyIban: "NL91 ABNA 0417 1643 00",
  };
  it("matches an outgoing payment with the same IBAN / amount / memo", () => {
    assert.deepEqual(matchProposalPayments(facts, [payment]).map((p) => p.id), ["p1"]);
  });
  it("uses the approved (partial) amount when present", () => {
    assert.equal(
      matchProposalPayments({ ...facts, approvedAmountValue: "10.00" }, [payment]).length,
      0,
    );
  });
  it("rejects different iban / amount / memo / earlier payments", () => {
    assert.equal(matchProposalPayments(facts, [{ ...payment, counterpartyIban: "NL00" }]).length, 0);
    assert.equal(matchProposalPayments(facts, [{ ...payment, amountValue: "-12.35" }]).length, 0);
    assert.equal(matchProposalPayments(facts, [{ ...payment, description: "other" }]).length, 0);
    assert.equal(
      matchProposalPayments(facts, [{ ...payment, created: "2026-11-15 10:00:00.000000" }]).length,
      0,
    );
  });
});
