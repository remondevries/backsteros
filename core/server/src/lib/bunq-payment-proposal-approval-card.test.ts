import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BunqPaymentProposal } from "@backsteros/contracts";

import {
  buildApprovalCard,
  bunqUnknownOutcomeAckLabel,
} from "./bunq-payment-proposal-approval-card.js";

function proposal(
  partial: Partial<BunqPaymentProposal> &
    Pick<BunqPaymentProposal, "status" | "unknownOutcomeAcknowledgedAt">,
): BunqPaymentProposal {
  return {
    id: "prop-1",
    proposedByAgentId: "agent-1",
    recipientName: "Ada",
    recipientIban: "NL91ABNA0417164300",
    amountValue: "1.00",
    amountCurrency: "EUR",
    memo: "Test",
    sourceMonetaryAccountId: "55",
    proposalHash: "a".repeat(64),
    expiresAt: new Date().toISOString(),
    chatThreadId: null,
    chatMessageId: null,
    approvedByUserId: null,
    approvedAt: null,
    consumedAt: null,
    approvedAmountValue: null,
    bunqPaymentId: null,
    executionError: null,
    paymentAttemptedAt: null,
    clientIdempotencyKey: "client-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

describe("OS-169 buildApprovalCard unknown-outcome UX", () => {
  it("labels pending Approve without requiresUnknownOutcomeAck", () => {
    const card = buildApprovalCard(
      proposal({
        status: "pending",
        unknownOutcomeAcknowledgedAt: null,
      }),
      {},
    );
    assert.equal(card.approveLabel, "Approve");
    assert.equal(card.paymentProposal.requiresUnknownOutcomeAck, undefined);
  });

  it("requires explicit ack checkbox before Retry on needs_reconciliation", () => {
    const card = buildApprovalCard(
      proposal({
        status: "needs_reconciliation",
        unknownOutcomeAcknowledgedAt: null,
      }),
      {},
    );
    assert.equal(card.approveLabel, "Retry payment");
    assert.equal(card.paymentProposal.requiresUnknownOutcomeAck, true);
    assert.equal(card.paymentProposal.unknownOutcomeAcknowledged, false);
    assert.match(card.details ?? "", /UNKNOWN/i);
    assert.match(
      card.paymentProposal.unknownOutcomeAckLabel ?? "",
      /I checked \/ reconciled this payment in Bunq/,
    );
  });

  it("marks ack unlocked after persisted acknowledgement", () => {
    const card = buildApprovalCard(
      proposal({
        status: "needs_reconciliation",
        unknownOutcomeAcknowledgedAt: new Date().toISOString(),
      }),
      {},
    );
    assert.equal(card.paymentProposal.unknownOutcomeAcknowledged, true);
  });

  it("SIMULATION suffix on ack label when simulation env is on", () => {
    assert.match(bunqUnknownOutcomeAckLabel(true), /SIMULATION/);
    const card = buildApprovalCard(
      proposal({
        status: "needs_reconciliation",
        unknownOutcomeAcknowledgedAt: null,
      }),
      { BUNQ_PAYMENT_SIMULATION: "true" },
    );
    assert.match(
      card.paymentProposal.unknownOutcomeAckLabel ?? "",
      /SIMULATION/,
    );
  });
});
