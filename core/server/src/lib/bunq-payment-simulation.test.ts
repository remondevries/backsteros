import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BunqLiveApiRefusedError, BunqPaymentAmbiguousOutcomeError } from "./bunq-client.js";
import {
  BUNQ_PAYMENT_SIMULATION_ID_PREFIX,
  BUNQ_PAYMENT_SIMULATION_MEMO_MARKER,
  assertBunqPaymentSimulationSafe,
  createSimulatedBunqPaymentClient,
  isBunqPaymentSimulationEnabled,
  shouldSimulateAmbiguousPaymentOutcome,
} from "./bunq-payment-simulation.js";

describe("bunq payment simulation gate", () => {
  it("defaults off", () => {
    assert.equal(isBunqPaymentSimulationEnabled({}), false);
    assert.equal(
      isBunqPaymentSimulationEnabled({ BUNQ_PAYMENT_SIMULATION: "true" }),
      true,
    );
  });

  it("refuses combining simulation with live write flag", () => {
    assert.throws(
      () =>
        assertBunqPaymentSimulationSafe({
          BUNQ_PAYMENT_SIMULATION: "true",
          BUNQ_ALLOW_LIVE_PAYMENT_WRITES: "true",
        }),
      (error: unknown) => error instanceof BunqLiveApiRefusedError,
    );
  });

  it("detects ambiguous demo memo marker", () => {
    assert.equal(
      shouldSimulateAmbiguousPaymentOutcome(
        `Rent ${BUNQ_PAYMENT_SIMULATION_MEMO_MARKER}`,
      ),
      true,
    );
    assert.equal(shouldSimulateAmbiguousPaymentOutcome("Rent"), false);
  });
});

describe("simulated bunq payment client", () => {
  it("returns SIM- payment ids and never dials bunq hosts", async () => {
    const prev = process.env.BUNQ_PAYMENT_SIMULATION;
    const live = process.env.BUNQ_ALLOW_LIVE_PAYMENT_WRITES;
    process.env.BUNQ_PAYMENT_SIMULATION = "true";
    delete process.env.BUNQ_ALLOW_LIVE_PAYMENT_WRITES;
    try {
      const client = createSimulatedBunqPaymentClient();
      const result = await client.createPayment({
        monetaryAccountId: "1",
        amountValue: "1.00",
        amountCurrency: "EUR",
        recipientName: "Fake Recipient",
        recipientIban: "NL91ABNA0417164300",
        description: "SIMULATION preview",
        idempotencyKey: "44444444-4444-4444-4444-444444444444",
      });
      assert.ok(result.paymentId.startsWith(BUNQ_PAYMENT_SIMULATION_ID_PREFIX));
    } finally {
      if (prev === undefined) delete process.env.BUNQ_PAYMENT_SIMULATION;
      else process.env.BUNQ_PAYMENT_SIMULATION = prev;
      if (live === undefined) delete process.env.BUNQ_ALLOW_LIVE_PAYMENT_WRITES;
      else process.env.BUNQ_ALLOW_LIVE_PAYMENT_WRITES = live;
    }
  });

  it("forces ambiguous outcome for [SIM:AMBIGUOUS] memo", async () => {
    const prev = process.env.BUNQ_PAYMENT_SIMULATION;
    process.env.BUNQ_PAYMENT_SIMULATION = "true";
    delete process.env.BUNQ_ALLOW_LIVE_PAYMENT_WRITES;
    try {
      const client = createSimulatedBunqPaymentClient();
      await assert.rejects(
        () =>
          client.createPayment({
            monetaryAccountId: "1",
            amountValue: "1.00",
            amountCurrency: "EUR",
            recipientName: "Fake Recipient",
            recipientIban: "NL91ABNA0417164300",
            description: `Preview ${BUNQ_PAYMENT_SIMULATION_MEMO_MARKER}`,
            idempotencyKey: "55555555-5555-5555-5555-555555555555",
          }),
        (error: unknown) => error instanceof BunqPaymentAmbiguousOutcomeError,
      );
    } finally {
      if (prev === undefined) delete process.env.BUNQ_PAYMENT_SIMULATION;
      else process.env.BUNQ_PAYMENT_SIMULATION = prev;
    }
  });
});
