import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canAcceptFreshPaymentApproval,
  canAutoRetryPaymentExecute,
  classifyBunqPaymentHttpFailure,
  nextStatusAfterPaymentAttempt,
} from "./bunq-payment-proposal-outcome.js";

describe("bunq payment attempt outcome classification", () => {
  it("treats 5xx / 408 / 429 as ambiguous → needs_reconciliation", () => {
    for (const status of [500, 502, 503, 408, 429]) {
      const outcome = classifyBunqPaymentHttpFailure({
        status,
        message: `fail ${status}`,
      });
      assert.equal(outcome.kind, "ambiguous");
      assert.equal(nextStatusAfterPaymentAttempt(outcome), "needs_reconciliation");
    }
  });

  it("treats 409 idempotency conflict as needs_reconciliation (not silent success)", () => {
    const outcome = classifyBunqPaymentHttpFailure({
      status: 409,
      message: "conflict",
    });
    assert.equal(outcome.kind, "idempotency_conflict");
    assert.equal(nextStatusAfterPaymentAttempt(outcome), "needs_reconciliation");
  });

  it("treats other 4xx as definite failure", () => {
    const outcome = classifyBunqPaymentHttpFailure({
      status: 400,
      message: "bad request",
    });
    assert.equal(outcome.kind, "definite_failure");
    assert.equal(nextStatusAfterPaymentAttempt(outcome), "failed");
  });

  it("blocks free execute retry; allows fresh approval only for pending / needs_reconciliation", () => {
    assert.equal(canAutoRetryPaymentExecute("approved"), false);
    assert.equal(canAutoRetryPaymentExecute("failed"), false);
    assert.equal(canAutoRetryPaymentExecute("needs_reconciliation"), false);
    assert.equal(canAcceptFreshPaymentApproval("pending"), true);
    assert.equal(canAcceptFreshPaymentApproval("needs_reconciliation"), true);
    assert.equal(canAcceptFreshPaymentApproval("approved"), false);
    assert.equal(canAcceptFreshPaymentApproval("executed"), false);
    assert.equal(canAcceptFreshPaymentApproval("failed"), false);
  });
});
