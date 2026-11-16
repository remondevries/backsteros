/**
 * Pure chat ↔ bunq payment proposal binding checks — no DB import.
 *
 * The agent can post any JSON as an approval card. Whatever it claims
 * (title, IBAN, amount, hash) is discarded: the card is rebuilt from the DB
 * row, and the answer path re-reads the row and requires the card to be the
 * one message linked to that proposal.
 */

import type { BunqPaymentProposal } from "@backsteros/contracts";

function httpError(
  status: number,
  code: string,
  message: string,
): Error {
  return Object.assign(new Error(message), { status, code });
}

/** Agent posts approval.paymentProposal — refuse anything but its own pending proposal. */
export function assertAgentMayPostPaymentCard(
  proposal: Pick<
    BunqPaymentProposal,
    | "status"
    | "proposedByAgentId"
    | "chatThreadId"
    | "chatMessageId"
    | "proposalHash"
  >,
  ctx: {
    agentId: string;
    threadId: string;
    claimedProposalHash?: string | null;
  },
): void {
  if (proposal.proposedByAgentId !== ctx.agentId) {
    throw httpError(
      403,
      "forbidden",
      "Only the agent that proposed this payment may post its approval card",
    );
  }
  if (proposal.status !== "pending") {
    throw httpError(
      409,
      "conflict",
      `Payment proposal is ${proposal.status}; only pending proposals can be posted as approval cards`,
    );
  }
  if (proposal.chatThreadId && proposal.chatThreadId !== ctx.threadId) {
    throw httpError(
      403,
      "forbidden",
      "Payment proposal belongs to a different chat thread",
    );
  }
  const claimed = ctx.claimedProposalHash?.trim().toLowerCase();
  if (claimed && claimed !== proposal.proposalHash.toLowerCase()) {
    throw httpError(
      400,
      "bad_request",
      "Approval card proposalHash does not match the stored proposal",
    );
  }
  if (proposal.chatMessageId) {
    throw httpError(
      409,
      "conflict",
      "Payment proposal already has an approval card",
    );
  }
}

/** Owner answers a payment card — it must be the single card linked to the proposal. */
export function assertPaymentCardBoundToProposal(
  proposal: Pick<BunqPaymentProposal, "chatMessageId" | "chatThreadId">,
  ctx: { threadId: string; messageId: string },
): void {
  if (proposal.chatMessageId !== ctx.messageId) {
    throw httpError(
      403,
      "forbidden",
      "This approval card is not the one linked to the payment proposal",
    );
  }
  if (proposal.chatThreadId !== ctx.threadId) {
    throw httpError(
      403,
      "forbidden",
      "Payment proposal belongs to a different chat thread",
    );
  }
}

/** Payment cards need the hash-bound step-up code on answer. */
export function requirePaymentApproverCode(
  approverCode: string | undefined,
): string {
  const code = approverCode?.trim();
  if (!code || !/^\d{6}$/.test(code)) {
    throw httpError(
      400,
      "bad_request",
      "approverCode (6 digits) is required to answer a payment approval card",
    );
  }
  return code;
}
