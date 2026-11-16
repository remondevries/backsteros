import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_BUNQ_DAILY_CAP_CENTS,
  DEFAULT_BUNQ_MAX_OPEN_PROPOSALS_PER_AGENT,
  amountToCents,
  evaluateDailyCap,
  evaluateNewPayee,
  evaluateOpenProposalLimit,
  formatCents,
  isIbanAllowlisted,
  resolveBunqPaymentLimits,
} from "./bunq-payment-limits.js";

describe("resolveBunqPaymentLimits", () => {
  it("has safe defaults", () => {
    const limits = resolveBunqPaymentLimits({});
    assert.equal(limits.dailyCapCents, DEFAULT_BUNQ_DAILY_CAP_CENTS);
    assert.equal(limits.dailyCapCents, 250_000);
    assert.equal(
      limits.maxOpenProposalsPerAgent,
      DEFAULT_BUNQ_MAX_OPEN_PROPOSALS_PER_AGENT,
    );
    assert.equal(limits.newPayeePolicy, "confirm");
    assert.equal(limits.allowedIbans.size, 0);
  });

  it("reads env and falls back to defaults on garbage", () => {
    const limits = resolveBunqPaymentLimits({
      BUNQ_PAYMENT_DAILY_CAP_EUR: "100.5",
      BUNQ_PAYMENT_MAX_OPEN_PROPOSALS: "2",
      BUNQ_PAYMENT_NEW_PAYEE_POLICY: "REFUSE",
      BUNQ_PAYMENT_ALLOWED_IBANS: "nl91 abna 0417 1643 00, nonsense!",
    });
    assert.equal(limits.dailyCapCents, 10_050);
    assert.equal(limits.maxOpenProposalsPerAgent, 2);
    assert.equal(limits.newPayeePolicy, "refuse");
    assert.equal(isIbanAllowlisted("NL91ABNA0417164300", limits.allowedIbans), true);

    const bad = resolveBunqPaymentLimits({
      BUNQ_PAYMENT_DAILY_CAP_EUR: "lots",
      BUNQ_PAYMENT_MAX_OPEN_PROPOSALS: "0",
      BUNQ_PAYMENT_NEW_PAYEE_POLICY: "whatever",
    });
    assert.equal(bad.dailyCapCents, DEFAULT_BUNQ_DAILY_CAP_CENTS);
    assert.equal(bad.maxOpenProposalsPerAgent, DEFAULT_BUNQ_MAX_OPEN_PROPOSALS_PER_AGENT);
    assert.equal(bad.newPayeePolicy, "confirm");
  });
});

describe("cents helpers", () => {
  it("round-trips", () => {
    assert.equal(amountToCents("12.34"), 1234);
    assert.equal(amountToCents("5"), 500);
    assert.equal(amountToCents("5.5"), 550);
    assert.equal(formatCents(250_000), "2500.00");
    assert.equal(formatCents(5), "0.05");
    assert.throws(() => amountToCents("-1"));
  });
});

describe("evaluateDailyCap", () => {
  it("allows up to and including the cap", () => {
    assert.deepEqual(
      evaluateDailyCap({ spentCents: 100_000, requestedCents: 150_000, capCents: 250_000 }),
      { ok: true },
    );
  });
  it("refuses a single amount above the cap", () => {
    const d = evaluateDailyCap({ spentCents: 0, requestedCents: 250_001, capCents: 250_000 });
    assert.equal(d.ok, false);
  });
  it("refuses once cumulative spend passes the cap", () => {
    const d = evaluateDailyCap({ spentCents: 200_000, requestedCents: 50_001, capCents: 250_000 });
    assert.equal(d.ok, false);
    assert.match((d as { message: string }).message, /Daily payment cap reached/);
  });
});

describe("evaluateOpenProposalLimit", () => {
  it("refuses at the limit", () => {
    assert.equal(evaluateOpenProposalLimit({ openCount: 4, max: 5 }).ok, true);
    assert.equal(evaluateOpenProposalLimit({ openCount: 5, max: 5 }).ok, false);
  });
});

describe("evaluateNewPayee", () => {
  it("passes known payees and policy off", () => {
    assert.equal(evaluateNewPayee({ policy: "confirm", known: true, confirmNewPayee: false }).ok, true);
    assert.equal(evaluateNewPayee({ policy: "off", known: false, confirmNewPayee: false }).ok, true);
  });
  it("requires the confirmation flag for new payees (confirm)", () => {
    const refused = evaluateNewPayee({ policy: "confirm", known: false, confirmNewPayee: false });
    assert.equal(refused.ok, false);
    assert.equal((refused as { status: number }).status, 409);
    assert.equal(
      evaluateNewPayee({ policy: "confirm", known: false, confirmNewPayee: true }).ok,
      true,
    );
  });
  it("refuses new payees outright (refuse) even when confirmed", () => {
    const d = evaluateNewPayee({ policy: "refuse", known: false, confirmNewPayee: true });
    assert.equal(d.ok, false);
    assert.equal((d as { status: number }).status, 403);
  });
});
