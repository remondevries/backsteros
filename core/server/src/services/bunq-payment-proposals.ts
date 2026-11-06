/**
 * OS-167 — Ralph proposes personal bunq payments; Remon must Approve & Pay in
 * chat (exact hash, one-time consume, TTL, amount ≤ proposed) before transfer.
 *
 * bunq idempotency: server UUID as X-Bunq-Client-Idempotency-Key (not Request-Id).
 * Unknown outcomes → needs_reconciliation; no auto-retry / no new key until
 * Remon explicitly acks via the dedicated endpoint, then gives a fresh one-use
 * Approve & Pay (OS-169 — chat Approve alone never invents the ack).
 *
 * Feature default OFF (`BUNQ_PAYMENT_PROPOSALS_ENABLED`). Live production
 * payment HTTP additionally requires `BUNQ_ALLOW_LIVE_PAYMENT_WRITES` and is
 * hard-refused in tests. Read-only bunq sync (OS-166) is untouched.
 */

import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type {
  AcknowledgeBunqPaymentUnknownOutcomeInput,
  ApproveBunqPaymentProposalInput,
  BunqPaymentProposal,
  CreateBunqPaymentProposalInput,
  CreateBunqPaymentProposalResult,
  RejectBunqPaymentProposalInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  agents,
  bunqPaymentProposals,
  workspaces,
  type DbBunqPaymentProposal,
} from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import {
  BunqApiError,
  BunqLiveApiRefusedError,
  BunqPaymentAmbiguousOutcomeError,
  BunqPaymentIdempotencyConflictError,
} from "../lib/bunq-client.js";
import {
  assertAgentAllowedToProposeBunqPayments,
  assertRemonPaymentApprover,
  isAgentPersonaAuth,
} from "../lib/bunq-payment-proposal-auth.js";
import {
  canAcceptFreshPaymentApproval,
} from "../lib/bunq-payment-proposal-outcome.js";
import {
  BUNQ_PAYMENT_PROPOSAL_DEFAULT_TTL_MS,
  BUNQ_PAYMENT_PROPOSAL_MAX_TTL_MS,
  hashBunqPaymentProposal,
  isApprovedAmountAllowed,
  isBunqPaymentProposalsEnabled,
  normalizeBunqAmountValue,
  proposalHashesEqual,
  type BunqPaymentProposalStatus,
} from "../lib/bunq-payment-proposal.js";
import { buildApprovalCard } from "../lib/bunq-payment-proposal-approval-card.js";
import type { AuthContext } from "../middleware/auth.js";
import type { BunqClient } from "../lib/bunq-client.js";
import { getConnectedBunqPaymentClient } from "./bunq-settings.js";

export { assertRemonPaymentApprover } from "../lib/bunq-payment-proposal-auth.js";
export {
  buildApprovalCard,
  bunqUnknownOutcomeAckLabel,
} from "../lib/bunq-payment-proposal-approval-card.js";

/** Test / sandbox seams — production callers leave defaults. */
export type BunqPaymentProposalDeps = {
  getPaymentClient?: (workspaceId: string) => Promise<BunqClient>;
  now?: () => Date;
};

function badRequest(message: string): Error {
  return Object.assign(new Error(message), {
    status: 400,
    code: "bad_request",
  });
}

function forbidden(message: string): Error {
  return Object.assign(new Error(message), {
    status: 403,
    code: "forbidden",
  });
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), {
    status: 404,
    code: "not_found",
  });
}

function conflict(message: string): Error {
  return Object.assign(new Error(message), {
    status: 409,
    code: "conflict",
  });
}

function assertFeatureEnabled(): void {
  if (!isBunqPaymentProposalsEnabled()) {
    throw forbidden(
      "bunq payment proposals are disabled (BUNQ_PAYMENT_PROPOSALS_ENABLED)",
    );
  }
}

function toProposal(row: DbBunqPaymentProposal): BunqPaymentProposal {
  return {
    id: row.id,
    proposedByAgentId: row.proposedByAgentId,
    recipientName: row.recipientName,
    recipientIban: row.recipientIban,
    amountValue: row.amountValue,
    amountCurrency: row.amountCurrency,
    memo: row.memo,
    sourceMonetaryAccountId: row.sourceMonetaryAccountId,
    proposalHash: row.proposalHash,
    status: row.status as BunqPaymentProposalStatus,
    expiresAt: row.expiresAt.toISOString(),
    chatThreadId: row.chatThreadId,
    chatMessageId: row.chatMessageId,
    approvedByUserId: row.approvedByUserId,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    consumedAt: row.consumedAt?.toISOString() ?? null,
    approvedAmountValue: row.approvedAmountValue,
    bunqPaymentId: row.bunqPaymentId,
    executionError: row.executionError,
    paymentAttemptedAt: row.paymentAttemptedAt?.toISOString() ?? null,
    clientIdempotencyKey: row.clientIdempotencyKey,
    unknownOutcomeAcknowledgedAt:
      row.unknownOutcomeAcknowledgedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * When a linked chat card exists, refresh its approval payload after
 * needs_reconciliation / ack so Remon sees the checkbox before Retry.
 * Clears approvalAnswer so the card is not locked as "Approved".
 */
async function syncLinkedChatApprovalCard(
  row: DbBunqPaymentProposal,
): Promise<void> {
  if (!row.chatMessageId || !row.chatThreadId) return;
  const { chatThreadMessages } = await import("../db/schema.js");
  const approval = buildApprovalCard(toProposal(row));
  await db
    .update(chatThreadMessages)
    .set({
      approval,
      // Leave unanswered so Remon can ack + Retry on the same card.
      approvalAnswer: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(chatThreadMessages.id, row.chatMessageId),
        eq(chatThreadMessages.workspaceId, row.workspaceId),
        eq(chatThreadMessages.threadId, row.chatThreadId),
      ),
    );
}

/** Shared patch when entering needs_reconciliation — clears prior ack. */
function needsReconciliationPatch(extra: {
  bunqPaymentId?: string | null;
  executionError: string;
}): {
  status: "needs_reconciliation";
  bunqPaymentId?: string | null;
  executionError: string;
  unknownOutcomeAcknowledgedAt: null;
  unknownOutcomeAcknowledgedByUserId: null;
  updatedAt: Date;
} {
  return {
    status: "needs_reconciliation",
    ...(extra.bunqPaymentId !== undefined
      ? { bunqPaymentId: extra.bunqPaymentId }
      : {}),
    executionError: extra.executionError,
    unknownOutcomeAcknowledgedAt: null,
    unknownOutcomeAcknowledgedByUserId: null,
    updatedAt: new Date(),
  };
}

/**
 * Resolve the proposing agent from the caller's API key binding, then check
 * the stable BUNQ_PAYMENT_PROPOSAL_AGENT_ID allowlist (not display name).
 */
export async function resolveRalphAgentForApiKey(
  workspaceId: string,
  apiKeyId: string | null | undefined,
): Promise<{ id: string; name: string; contactId: string | null }> {
  if (!apiKeyId) {
    throw forbidden(
      "Payment proposals require a mapped agent API key",
    );
  }
  const [agent] = await db
    .select({
      id: agents.id,
      name: agents.name,
      contactId: agents.contactId,
      enabled: agents.enabled,
      apiKeyId: agents.apiKeyId,
    })
    .from(agents)
    .where(
      and(eq(agents.workspaceId, workspaceId), eq(agents.apiKeyId, apiKeyId)),
    )
    .limit(1);
  if (!agent || !agent.enabled) {
    throw forbidden(
      "Payment proposals require an enabled agent bound to this API key",
    );
  }
  assertAgentAllowedToProposeBunqPayments(agent.id);
  return {
    id: agent.id,
    name: agent.name,
    contactId: agent.contactId,
  };
}

async function resolveWorkspaceOwnerUserId(
  workspaceId: string,
): Promise<string> {
  const [row] = await db
    .select({ ownerUserId: workspaces.ownerUserId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  const ownerUserId = row?.ownerUserId?.trim();
  if (!ownerUserId) {
    throw badRequest("Workspace owner is not configured");
  }
  return ownerUserId;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockProposal(
  tx: Tx,
  workspaceId: string,
  proposalId: string,
): Promise<DbBunqPaymentProposal | null> {
  const [locked] = await tx
    .select()
    .from(bunqPaymentProposals)
    .where(
      and(
        eq(bunqPaymentProposals.workspaceId, workspaceId),
        eq(bunqPaymentProposals.id, proposalId),
      ),
    )
    .for("update")
    .limit(1);
  return locked ?? null;
}

function markExpiredIfNeeded(
  row: DbBunqPaymentProposal,
  now: Date,
): BunqPaymentProposalStatus {
  if (
    row.status === "pending" &&
    row.expiresAt.getTime() <= now.getTime() &&
    !row.consumedAt
  ) {
    return "expired";
  }
  return row.status as BunqPaymentProposalStatus;
}

export async function createBunqPaymentProposal(
  workspaceId: string,
  auth: AuthContext,
  input: CreateBunqPaymentProposalInput,
): Promise<CreateBunqPaymentProposalResult> {
  assertFeatureEnabled();
  if (!isAgentPersonaAuth(auth)) {
    throw forbidden("Only the configured payment-proposal agent may create bunq payment proposals");
  }
  const ralph = await resolveRalphAgentForApiKey(workspaceId, auth.apiKeyId);

  let canonical;
  let proposalHash: string;
  try {
    ({ canonical, proposalHash } = hashBunqPaymentProposal({
      recipientName: input.recipientName,
      recipientIban: input.recipientIban,
      amountValue: input.amountValue,
      amountCurrency: input.amountCurrency,
      memo: input.memo,
      sourceMonetaryAccountId: input.sourceMonetaryAccountId,
    }));
  } catch (error) {
    throw badRequest(
      error instanceof Error ? error.message : "Invalid payment proposal",
    );
  }

  const clientIdempotencyKey = input.idempotencyKey.trim();
  const [existing] = await db
    .select()
    .from(bunqPaymentProposals)
    .where(
      and(
        eq(bunqPaymentProposals.workspaceId, workspaceId),
        eq(bunqPaymentProposals.clientIdempotencyKey, clientIdempotencyKey),
      ),
    )
    .limit(1);
  if (existing) {
    if (!proposalHashesEqual(existing.proposalHash, proposalHash)) {
      throw conflict(
        "Client idempotency key already used for a different payment proposal",
      );
    }
    const proposal = toProposal(existing);
    return { proposal, approval: buildApprovalCard(proposal) };
  }

  const ttlMs = Math.min(
    Math.max(
      (input.ttlSeconds ?? BUNQ_PAYMENT_PROPOSAL_DEFAULT_TTL_MS / 1000) * 1000,
      60_000,
    ),
    BUNQ_PAYMENT_PROPOSAL_MAX_TTL_MS,
  );
  const now = new Date();
  const id = newId();
  // Server-generated UUID for X-Bunq-Client-Idempotency-Key — tied to this hash.
  const bunqIdempotencyKey = randomUUID();
  const [row] = await db
    .insert(bunqPaymentProposals)
    .values({
      id,
      workspaceId,
      proposedByAgentId: ralph.id,
      proposedByApiKeyId: auth.apiKeyId,
      recipientName: canonical.recipientName,
      recipientIban: canonical.recipientIban,
      amountValue: canonical.amountValue,
      amountCurrency: canonical.amountCurrency,
      memo: canonical.memo,
      sourceMonetaryAccountId: canonical.sourceMonetaryAccountId,
      proposalHash,
      status: "pending",
      expiresAt: new Date(now.getTime() + ttlMs),
      chatThreadId: input.chatThreadId?.trim() || null,
      clientIdempotencyKey,
      bunqIdempotencyKey,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!row) {
    throw badRequest("Could not create payment proposal");
  }
  const proposal = toProposal(row);
  return { proposal, approval: buildApprovalCard(proposal) };
}

export async function getBunqPaymentProposal(
  workspaceId: string,
  proposalId: string,
): Promise<BunqPaymentProposal> {
  assertFeatureEnabled();
  const [row] = await db
    .select()
    .from(bunqPaymentProposals)
    .where(
      and(
        eq(bunqPaymentProposals.workspaceId, workspaceId),
        eq(bunqPaymentProposals.id, proposalId),
      ),
    )
    .limit(1);
  if (!row) throw notFound("Payment proposal");
  const now = new Date();
  const status = markExpiredIfNeeded(row, now);
  if (status === "expired" && row.status === "pending") {
    const [updated] = await db
      .update(bunqPaymentProposals)
      .set({ status: "expired", updatedAt: now })
      .where(
        and(
          eq(bunqPaymentProposals.id, row.id),
          eq(bunqPaymentProposals.status, "pending"),
        ),
      )
      .returning();
    if (updated) return toProposal(updated);
  }
  return toProposal(row);
}

export async function listBunqPaymentProposals(
  workspaceId: string,
): Promise<BunqPaymentProposal[]> {
  assertFeatureEnabled();
  const rows = await db
    .select()
    .from(bunqPaymentProposals)
    .where(eq(bunqPaymentProposals.workspaceId, workspaceId))
    .orderBy(desc(bunqPaymentProposals.createdAt))
    .limit(100);
  return rows.map(toProposal);
}

export async function linkBunqPaymentProposalChatMessage(
  workspaceId: string,
  proposalId: string,
  chatThreadId: string,
  chatMessageId: string,
): Promise<void> {
  await db
    .update(bunqPaymentProposals)
    .set({
      chatThreadId,
      chatMessageId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bunqPaymentProposals.workspaceId, workspaceId),
        eq(bunqPaymentProposals.id, proposalId),
      ),
    );
}

/**
 * Execute exactly once per fresh Remon approval. Uses the persisted
 * bunq_idempotency_key. Never rotates the key for the same proposal hash.
 * Ambiguous outcomes → needs_reconciliation (blocks until fresh reapproval).
 */
async function executeApprovedPayment(
  workspaceId: string,
  proposalId: string,
  deps: BunqPaymentProposalDeps = {},
): Promise<DbBunqPaymentProposal> {
  const now = new Date();
  const [row] = await db
    .select()
    .from(bunqPaymentProposals)
    .where(
      and(
        eq(bunqPaymentProposals.workspaceId, workspaceId),
        eq(bunqPaymentProposals.id, proposalId),
      ),
    )
    .limit(1);
  if (!row) throw notFound("Payment proposal");
  if (row.status === "executed" && row.bunqPaymentId) {
    return row;
  }
  if (row.status !== "approved") {
    throw conflict(
      `Cannot execute payment while status is ${row.status} — fresh Approve & Pay required`,
    );
  }

  // Mark attempt before HTTP so a crash mid-flight still surfaces as attempted.
  await db
    .update(bunqPaymentProposals)
    .set({ paymentAttemptedAt: now, updatedAt: now })
    .where(eq(bunqPaymentProposals.id, proposalId));

  let client;
  try {
    const getClient = deps.getPaymentClient ?? getConnectedBunqPaymentClient;
    client = await getClient(workspaceId);
  } catch (error) {
    // Client wiring failed before HTTP — definite local failure (no bank call).
    const message =
      error instanceof Error ? error.message : "bunq client unavailable";
    const [failed] = await db
      .update(bunqPaymentProposals)
      .set({
        status: "failed",
        executionError: message,
        updatedAt: new Date(),
      })
      .where(eq(bunqPaymentProposals.id, proposalId))
      .returning();
    if (!failed) throw notFound("Payment proposal");
    return failed;
  }

  const amountValue = row.approvedAmountValue ?? row.amountValue;
  try {
    const { paymentId } = await client.createPayment({
      monetaryAccountId: row.sourceMonetaryAccountId,
      amountValue,
      amountCurrency: row.amountCurrency,
      recipientName: row.recipientName,
      recipientIban: row.recipientIban,
      description: row.memo,
      idempotencyKey: row.bunqIdempotencyKey,
    });
    try {
      const [executed] = await db
        .update(bunqPaymentProposals)
        .set({
          status: "executed",
          bunqPaymentId: paymentId,
          executionError: null,
          updatedAt: new Date(),
        })
        .where(eq(bunqPaymentProposals.id, proposalId))
        .returning();
      if (!executed) {
        // Bank accepted but DB update missing — unknown from Remon's POV.
        throw new Error("DB update missing after bunq payment accept");
      }
      return executed;
    } catch (dbError) {
      const message =
        dbError instanceof Error
          ? dbError.message
          : "DB update failed after bunq payment";
      const [reconcile] = await db
        .update(bunqPaymentProposals)
        .set(
          needsReconciliationPatch({
            bunqPaymentId: paymentId,
            executionError: `Payment may have succeeded (id recorded when possible): ${message}`,
          }),
        )
        .where(eq(bunqPaymentProposals.id, proposalId))
        .returning();
      if (!reconcile) throw notFound("Payment proposal");
      await syncLinkedChatApprovalCard(reconcile);
      return reconcile;
    }
  } catch (error) {
    if (error instanceof BunqPaymentAmbiguousOutcomeError) {
      const [reconcile] = await db
        .update(bunqPaymentProposals)
        .set(
          needsReconciliationPatch({
            executionError: `Unknown payment outcome: ${error.message}. Do not assume failure; reconcile with bunq before Retry payment.`,
          }),
        )
        .where(eq(bunqPaymentProposals.id, proposalId))
        .returning();
      if (!reconcile) throw notFound("Payment proposal");
      await syncLinkedChatApprovalCard(reconcile);
      return reconcile;
    }
    if (error instanceof BunqPaymentIdempotencyConflictError) {
      const [reconcile] = await db
        .update(bunqPaymentProposals)
        .set(
          needsReconciliationPatch({
            executionError: `bunq idempotency conflict (409): payment may already exist for this key. Reconcile before a new key or Retry payment with the same key after confirmation.`,
          }),
        )
        .where(eq(bunqPaymentProposals.id, proposalId))
        .returning();
      if (!reconcile) throw notFound("Payment proposal");
      await syncLinkedChatApprovalCard(reconcile);
      return reconcile;
    }
    if (error instanceof BunqLiveApiRefusedError) {
      // Local gate refused before live HTTP — definite, no bank call.
      const [failed] = await db
        .update(bunqPaymentProposals)
        .set({
          status: "failed",
          executionError: error.message,
          updatedAt: new Date(),
        })
        .where(eq(bunqPaymentProposals.id, proposalId))
        .returning();
      if (!failed) throw notFound("Payment proposal");
      return failed;
    }
    if (error instanceof BunqApiError && error.status >= 400 && error.status < 500) {
      const [failed] = await db
        .update(bunqPaymentProposals)
        .set({
          status: "failed",
          executionError: error.message,
          updatedAt: new Date(),
        })
        .where(eq(bunqPaymentProposals.id, proposalId))
        .returning();
      if (!failed) throw notFound("Payment proposal");
      return failed;
    }
    const message =
      error instanceof Error ? error.message : "bunq payment failed";
    const [reconcile] = await db
      .update(bunqPaymentProposals)
      .set(
        needsReconciliationPatch({
          executionError: `Unknown payment outcome: ${message}`,
        }),
      )
      .where(eq(bunqPaymentProposals.id, proposalId))
      .returning();
    if (!reconcile) throw notFound("Payment proposal");
    await syncLinkedChatApprovalCard(reconcile);
    return reconcile;
  }
}

export async function approveBunqPaymentProposal(
  workspaceId: string,
  proposalId: string,
  auth: AuthContext,
  input: ApproveBunqPaymentProposalInput,
  deps: BunqPaymentProposalDeps = {},
): Promise<BunqPaymentProposal> {
  assertFeatureEnabled();
  const ownerUserId = await resolveWorkspaceOwnerUserId(workspaceId);
  const approverUserId = assertRemonPaymentApprover(auth, ownerUserId);

  const now = deps.now?.() ?? new Date();
  let approvedAmount: string;
  try {
    approvedAmount = input.amountValue
      ? normalizeBunqAmountValue(input.amountValue)
      : "";
  } catch (error) {
    throw badRequest(
      error instanceof Error ? error.message : "Invalid amount",
    );
  }

  const locked = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    const row = await lockProposal(tx, workspaceId, proposalId);
    if (!row) return null;

    if (row.status === "executed" && row.bunqPaymentId) {
      return { kind: "idempotent" as const, row };
    }

    // Server derives/validates hash — refuse mismatch (no client bypass).
    if (!proposalHashesEqual(row.proposalHash, input.proposalHash)) {
      throw badRequest("Proposal hash mismatch — approval refused");
    }

    if (row.status === "needs_reconciliation") {
      if (row.unknownOutcomeAcknowledgedAt == null) {
        throw conflict(
          "Prior payment outcome is UNKNOWN (needs_reconciliation). Acknowledge via POST …/acknowledge-unknown-outcome after reconciling in Bunq, then Retry payment (same bunq idempotency key).",
        );
      }
      if (input.acknowledgeUnknownOutcome !== true) {
        throw conflict(
          "Prior payment outcome is unknown (needs_reconciliation). Set acknowledgeUnknownOutcome=true after the dedicated reconciliation ack, then Approve & Pay again (same bunq idempotency key).",
        );
      }
    } else if (!canAcceptFreshPaymentApproval(row.status)) {
      throw conflict(
        `Payment proposal is ${row.status} — approved+consumed does not allow free retry; create a new proposal for modified payment data`,
      );
    }

    if (row.status === "pending") {
      const status = markExpiredIfNeeded(row, now);
      if (status === "expired") {
        await tx
          .update(bunqPaymentProposals)
          .set({ status: "expired", updatedAt: now })
          .where(eq(bunqPaymentProposals.id, row.id));
        throw conflict("Payment proposal has expired");
      }
    }

    const amountValue = approvedAmount || row.amountValue;
    if (!isApprovedAmountAllowed(row.amountValue, amountValue)) {
      throw badRequest("Approved amount may not exceed the proposed amount");
    }

    // One-use consume for this Approve & Pay cycle. Reapproval from
    // needs_reconciliation starts a new consume; bunq idempotency key unchanged.
    const [updated] = await tx
      .update(bunqPaymentProposals)
      .set({
        status: "approved",
        approvedByUserId: approverUserId,
        approvedAt: now,
        consumedAt: now,
        approvedAmountValue: amountValue,
        executionError:
          row.status === "needs_reconciliation"
            ? "Reauthorized after unknown outcome acknowledgment"
            : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(bunqPaymentProposals.id, row.id),
          sql`${bunqPaymentProposals.status} in ('pending', 'needs_reconciliation')`,
        ),
      )
      .returning();
    if (!updated) {
      throw conflict("Payment proposal approval already consumed");
    }
    return { kind: "approved" as const, row: updated };
  });

  if (!locked) throw notFound("Payment proposal");

  if (locked.kind === "idempotent") {
    return toProposal(locked.row);
  }

  // Execute only immediately after this fresh one-use approval — no free retry.
  const executed = await executeApprovedPayment(workspaceId, proposalId, deps);
  return toProposal(executed);
}

export async function rejectBunqPaymentProposal(
  workspaceId: string,
  proposalId: string,
  auth: AuthContext,
  input: RejectBunqPaymentProposalInput,
): Promise<BunqPaymentProposal> {
  assertFeatureEnabled();
  const ownerUserId = await resolveWorkspaceOwnerUserId(workspaceId);
  assertRemonPaymentApprover(auth, ownerUserId);
  const now = new Date();

  const updated = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    const row = await lockProposal(tx, workspaceId, proposalId);
    if (!row) return null;
    if (row.status !== "pending" && row.status !== "needs_reconciliation") {
      throw conflict(`Payment proposal is ${row.status}`);
    }
    if (row.status === "pending" && markExpiredIfNeeded(row, now) === "expired") {
      await tx
        .update(bunqPaymentProposals)
        .set({ status: "expired", updatedAt: now })
        .where(eq(bunqPaymentProposals.id, row.id));
      throw conflict("Payment proposal has expired");
    }
    if (!proposalHashesEqual(row.proposalHash, input.proposalHash)) {
      throw badRequest("Proposal hash mismatch — rejection refused");
    }
    const [next] = await tx
      .update(bunqPaymentProposals)
      .set({
        status: "rejected",
        consumedAt: now,
        approvedByUserId: auth.userId,
        approvedAt: now,
        executionError: input.note?.trim() || null,
        updatedAt: now,
      })
      .where(
        and(
          eq(bunqPaymentProposals.id, row.id),
          sql`${bunqPaymentProposals.status} in ('pending', 'needs_reconciliation')`,
        ),
      )
      .returning();
    if (!next) throw conflict("Payment proposal already consumed");
    return next;
  });

  if (!updated) throw notFound("Payment proposal");
  return toProposal(updated);
}

/**
 * OS-169 — Remon explicitly acknowledges UNKNOWN prior outcome.
 * Does not execute a payment. Optional confirmPaymentAlreadyExists marks
 * executed when a bunq payment id is already known (never resubmits).
 */
export async function acknowledgeBunqPaymentUnknownOutcome(
  workspaceId: string,
  proposalId: string,
  auth: AuthContext,
  input: AcknowledgeBunqPaymentUnknownOutcomeInput,
): Promise<BunqPaymentProposal> {
  assertFeatureEnabled();
  const ownerUserId = await resolveWorkspaceOwnerUserId(workspaceId);
  const acknowledgerUserId = assertRemonPaymentApprover(auth, ownerUserId);
  const now = new Date();

  const updated = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    const row = await lockProposal(tx, workspaceId, proposalId);
    if (!row) return null;

    if (!proposalHashesEqual(row.proposalHash, input.proposalHash)) {
      throw badRequest("Proposal hash mismatch — acknowledgment refused");
    }

    if (row.status === "executed" && row.bunqPaymentId) {
      return row;
    }

    if (row.status !== "needs_reconciliation") {
      throw conflict(
        `Payment proposal is ${row.status} — unknown-outcome ack only applies to needs_reconciliation`,
      );
    }

    if (
      input.confirmPaymentAlreadyExists === true &&
      row.bunqPaymentId != null &&
      row.bunqPaymentId.trim() !== ""
    ) {
      const [executed] = await tx
        .update(bunqPaymentProposals)
        .set({
          status: "executed",
          unknownOutcomeAcknowledgedAt: now,
          unknownOutcomeAcknowledgedByUserId: acknowledgerUserId,
          executionError: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(bunqPaymentProposals.id, row.id),
            eq(bunqPaymentProposals.status, "needs_reconciliation"),
          ),
        )
        .returning();
      if (!executed) throw conflict("Payment proposal already consumed");
      return executed;
    }

    if (row.unknownOutcomeAcknowledgedAt != null) {
      // Idempotent replay of the same ack.
      return row;
    }

    const [acked] = await tx
      .update(bunqPaymentProposals)
      .set({
        unknownOutcomeAcknowledgedAt: now,
        unknownOutcomeAcknowledgedByUserId: acknowledgerUserId,
        updatedAt: now,
      })
      .where(
        and(
          eq(bunqPaymentProposals.id, row.id),
          eq(bunqPaymentProposals.status, "needs_reconciliation"),
        ),
      )
      .returning();
    if (!acked) throw conflict("Payment proposal already consumed");
    return acked;
  });

  if (!updated) throw notFound("Payment proposal");
  await syncLinkedChatApprovalCard(updated);
  return toProposal(updated);
}

/**
 * Called from chat approval /answer when the card carries paymentProposal.
 * Remon-only path already enforced by the chat route (agents get 403).
 * OS-169: never invent acknowledgeUnknownOutcome from Approve alone — only
 * forward true when a prior dedicated ack is already persisted.
 */
export async function handleChatPaymentProposalAnswer(
  input: {
    workspaceId: string;
    auth: AuthContext;
    proposalId: string;
    proposalHash: string;
    decision: "approved" | "rejected";
    note?: string;
  },
  deps: BunqPaymentProposalDeps = {},
): Promise<BunqPaymentProposal | null> {
  if (!isBunqPaymentProposalsEnabled()) {
    return null;
  }
  if (input.decision === "approved") {
    const existing = await getBunqPaymentProposal(
      input.workspaceId,
      input.proposalId,
    );
    const priorAck =
      existing.status === "needs_reconciliation" &&
      existing.unknownOutcomeAcknowledgedAt != null;
    return approveBunqPaymentProposal(
      input.workspaceId,
      input.proposalId,
      input.auth,
      {
        proposalHash: input.proposalHash,
        // Only after dedicated ack endpoint — never from Approve click alone.
        ...(priorAck ? { acknowledgeUnknownOutcome: true } : {}),
      },
      deps,
    );
  }
  return rejectBunqPaymentProposal(
    input.workspaceId,
    input.proposalId,
    input.auth,
    { proposalHash: input.proposalHash, note: input.note },
  );
}
