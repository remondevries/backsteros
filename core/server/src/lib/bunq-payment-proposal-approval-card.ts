/**
 * Pure approval-card builders for bunq payment proposals (OS-167 / OS-169).
 * No DB imports — safe for unit tests without DATABASE_URL.
 */

import type {
  BunqPaymentProposal,
  CreateBunqPaymentProposalResult,
} from "@backsteros/contracts";

import { isBunqPaymentSimulationEnabled } from "./bunq-payment-simulation.js";

/** Shared label for the explicit Remon reconciliation checkbox (chat + API). */
export function bunqUnknownOutcomeAckLabel(simulating: boolean): string {
  return simulating
    ? "I checked / reconciled this payment in Bunq (SIMULATION)"
    : "I checked / reconciled this payment in Bunq";
}

export function buildApprovalCard(
  proposal: BunqPaymentProposal,
  env: NodeJS.ProcessEnv = process.env,
): CreateBunqPaymentProposalResult["approval"] {
  const simulating = isBunqPaymentSimulationEnabled(env);
  const needsAck = proposal.status === "needs_reconciliation";
  const acked = proposal.unknownOutcomeAcknowledgedAt != null;
  const unknown = needsAck
    ? "Prior payment outcome is UNKNOWN — do not assume no payment was made. Acknowledge reconciliation before Retry payment.\n\n"
    : "";
  const simBanner = simulating
    ? "SIMULATION ONLY — no real bank transfer. Fake destination / amount for local preview.\n\n"
    : "";
  return {
    title: simulating
      ? needsAck
        ? "Reconcile bunq payment (SIMULATION)"
        : "Approve bunq payment (SIMULATION)"
      : needsAck
        ? "Reconcile bunq payment"
        : "Approve bunq payment",
    kind: "payment",
    summary: simulating
      ? `[SIMULATION] Pay ${proposal.amountValue} ${proposal.amountCurrency} to ${proposal.recipientName}`
      : `Pay ${proposal.amountValue} ${proposal.amountCurrency} to ${proposal.recipientName}`,
    fields: [
      { label: "Recipient", value: proposal.recipientName },
      // Full canonical IBAN on Remon confirm — never mask destination here.
      { label: "IBAN", value: proposal.recipientIban },
      {
        label: "Amount",
        value: `${proposal.amountValue} ${proposal.amountCurrency}`,
      },
      { label: "Memo", value: proposal.memo },
      { label: "From account", value: proposal.sourceMonetaryAccountId },
      ...(simulating
        ? [{ label: "Mode", value: "SIMULATION (local fake bank)" }]
        : []),
      ...(needsAck
        ? [
            {
              label: "Outcome",
              value: acked
                ? "UNKNOWN — acknowledged; Retry payment unlocked"
                : "UNKNOWN — do not assume no payment",
            },
          ]
        : []),
    ],
    details: `${simBanner}${unknown}Proposal ${proposal.id}\nHash ${proposal.proposalHash}`,
    approveLabel: needsAck ? "Retry payment" : "Approve",
    rejectLabel: "Reject",
    paymentProposal: {
      proposalId: proposal.id,
      proposalHash: proposal.proposalHash,
      ...(needsAck
        ? {
            requiresUnknownOutcomeAck: true,
            unknownOutcomeAcknowledged: acked,
            unknownOutcomeAckLabel: bunqUnknownOutcomeAckLabel(simulating),
          }
        : {}),
    },
  };
}
