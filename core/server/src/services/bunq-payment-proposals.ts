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
import { and, desc, eq, gt, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
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
  assertAgentMayPostPaymentCard,
  assertPaymentCardBoundToProposal,
} from "../lib/bunq-payment-proposal-chat-binding.js";
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
import {
  BUNQ_DAILY_CAP_COUNTED_STATUSES,
  BUNQ_DAILY_CAP_WINDOW_MS,
  BUNQ_OPEN_PROPOSAL_STATUSES,
  amountToCents,
  evaluateDailyCap,
  evaluateNewPayee,
  evaluateOpenProposalLimit,
  isIbanAllowlisted,
  resolveBunqPaymentLimits,
} from "../lib/bunq-payment-limits.js";
import {
  BUNQ_STUCK_APPROVED_AFTER_MS,
  isIdempotencyRetryWindowExpired,
  isStuckApproved,
  matchProposalPayments,
  type ReconcilePaymentCandidate,
} from "../lib/bunq-payment-reconcile.js";
import {
  SYSTEM_EVENT_ACTOR,
  eventActorFromAuth,
  recordBunqPaymentProposalEvent,
  recordBunqPaymentProposalEventBestEffort,
} from "./bunq-payment-proposal-events.js";
import {
  getConnectedBunqPaymentClient,
  isBunqPaymentsPaused,
  listBunqPayments,
} from "./bunq-settings.js";

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

/** M4 kill switch — create / approve / execute all refuse while paused. */
async function assertPaymentsNotPaused(workspaceId: string): Promise<void> {
  if (await isBunqPaymentsPaused(workspaceId)) {
    throw forbidden("bunq payments are paused (kill switch is on)");
  }
}

/** Allowlisted, or previously paid (executed) in this workspace. */
async function isKnownPayee(
  workspaceId: string,
  iban: string,
  excludeProposalId?: string,
): Promise<boolean> {
  const limits = resolveBunqPaymentLimits();
  if (isIbanAllowlisted(iban, limits.allowedIbans)) return true;
  const [paid] = await db
    .select({ id: bunqPaymentProposals.id })
    .from(bunqPaymentProposals)
    .where(
      and(
        eq(bunqPaymentProposals.workspaceId, workspaceId),
        eq(bunqPaymentProposals.recipientIban, iban),
        eq(bunqPaymentProposals.status, "executed"),
        ...(excludeProposalId
          ? [ne(bunqPaymentProposals.id, excludeProposalId)]
          : []),
      ),
    )
    .limit(1);
  return Boolean(paid);
}

/** True when the card should warn: policy active and the IBAN is first-seen. */
async function isNewPayee(
  workspaceId: string,
  iban: string,
): Promise<boolean> {
  if (resolveBunqPaymentLimits().newPayeePolicy === "off") return false;
  return !(await isKnownPayee(workspaceId, iban));
}

/** Approval card rebuilt from a proposal, with the new-payee warning. */
async function buildApprovalCardForProposal(
  workspaceId: string,
  proposal: BunqPaymentProposal,
): Promise<ReturnType<typeof buildApprovalCard>> {
  return buildApprovalCard(proposal, process.env, {
    newPayee: await isNewPayee(workspaceId, proposal.recipientIban),
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
  const approval = await buildApprovalCardForProposal(
    row.workspaceId,
    toProposal(row),
  );
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
  await assertPaymentsNotPaused(workspaceId);

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
    return {
      proposal,
      approval: await buildApprovalCardForProposal(workspaceId, proposal),
    };
  }

  // M3: guard rails. EUR-only so the daily cap is well-defined.
  if (canonical.amountCurrency !== "EUR") {
    throw badRequest("Only EUR payment proposals are supported");
  }
  const limits = resolveBunqPaymentLimits();
  const capDecision = evaluateDailyCap({
    spentCents: 0,
    requestedCents: amountToCents(canonical.amountValue),
    capCents: limits.dailyCapCents,
  });
  if (!capDecision.ok) throw forbidden(capDecision.message);

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
  const row = await db.transaction(async (tx) => {
    // Serialise per agent so concurrent creates cannot exceed the open limit.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`bunq-open:${workspaceId}:${ralph.id}`}))`,
    );
    const open = await tx
      .select({ id: bunqPaymentProposals.id })
      .from(bunqPaymentProposals)
      .where(
        and(
          eq(bunqPaymentProposals.workspaceId, workspaceId),
          eq(bunqPaymentProposals.proposedByAgentId, ralph.id),
          inArray(bunqPaymentProposals.status, [
            ...BUNQ_OPEN_PROPOSAL_STATUSES,
          ]),
          // Expired-but-unswept pending rows do not occupy a slot.
          or(
            ne(bunqPaymentProposals.status, "pending"),
            gt(bunqPaymentProposals.expiresAt, now),
          ),
        ),
      );
    const openDecision = evaluateOpenProposalLimit({
      openCount: open.length,
      max: limits.maxOpenProposalsPerAgent,
    });
    if (!openDecision.ok) throw conflict(openDecision.message);

    const [inserted] = await tx
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
    if (!inserted) throw badRequest("Could not create payment proposal");
    await recordBunqPaymentProposalEvent(tx, {
      workspaceId,
      proposalId: inserted.id,
      eventType: "created",
      actor: eventActorFromAuth(auth),
      proposalHash,
      amountValue: inserted.amountValue,
      amountCurrency: inserted.amountCurrency,
      statusFrom: null,
      statusTo: "pending",
    });
    return inserted;
  });
  const proposal = toProposal(row);
  return {
    proposal,
    approval: await buildApprovalCardForProposal(workspaceId, proposal),
  };
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
    if (updated) {
      await recordBunqPaymentProposalEventBestEffort(db, {
        workspaceId,
        proposalId: updated.id,
        eventType: "expired",
        actor: SYSTEM_EVENT_ACTOR,
        proposalHash: updated.proposalHash,
        amountValue: updated.amountValue,
        amountCurrency: updated.amountCurrency,
        statusFrom: "pending",
        statusTo: "expired",
      });
      return toProposal(updated);
    }
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

/**
 * Bind the proposal to exactly one chat card. Only links while unlinked (or
 * re-linking the same message) so a second agent post cannot steal the binding.
 */
export async function linkBunqPaymentProposalChatMessage(
  workspaceId: string,
  proposalId: string,
  chatThreadId: string,
  chatMessageId: string,
): Promise<boolean> {
  const rows = await db
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
        sql`(${bunqPaymentProposals.chatMessageId} is null or ${bunqPaymentProposals.chatMessageId} = ${chatMessageId})`,
      ),
    )
    .returning({ id: bunqPaymentProposals.id });
  return rows.length > 0;
}

/**
 * Agent posts `approval.paymentProposal`: everything the agent displayed is
 * discarded. Validates ownership / status / thread against the DB row and
 * returns a card rebuilt from that row.
 */
export async function prepareAgentPostedPaymentApproval(input: {
  workspaceId: string;
  threadId: string;
  agentId: string;
  claimed: { proposalId: string; proposalHash?: string | null };
}): Promise<{
  proposalId: string;
  approval: ReturnType<typeof buildApprovalCard>;
}> {
  const proposal = await getBunqPaymentProposal(
    input.workspaceId,
    input.claimed.proposalId,
  );
  assertAgentMayPostPaymentCard(proposal, {
    agentId: input.agentId,
    threadId: input.threadId,
    claimedProposalHash: input.claimed.proposalHash,
  });
  return {
    proposalId: proposal.id,
    approval: await buildApprovalCardForProposal(input.workspaceId, proposal),
  };
}

/**
 * Owner answers a payment card: re-read the proposal, require this exact
 * message is the linked card, and rebuild the card from the DB.
 */
export async function resolveChatPaymentProposalForAnswer(input: {
  workspaceId: string;
  threadId: string;
  messageId: string;
  proposalId: string;
}): Promise<{
  proposal: BunqPaymentProposal;
  approval: ReturnType<typeof buildApprovalCard>;
}> {
  const proposal = await getBunqPaymentProposal(
    input.workspaceId,
    input.proposalId,
  );
  assertPaymentCardBoundToProposal(proposal, {
    threadId: input.threadId,
    messageId: input.messageId,
  });
  return {
    proposal,
    approval: await buildApprovalCardForProposal(input.workspaceId, proposal),
  };
}

/**
 * L2 — recompute the hash from the stored payment fields and compare to the
 * hash Remon approved; M4 — honour the kill switch. Returns a failure message
 * (refuse) or null (safe to proceed). Fail-closed on any error.
 */
async function findPreBankFailure(
  row: DbBunqPaymentProposal,
): Promise<string | null> {
  try {
    const { proposalHash } = hashBunqPaymentProposal({
      recipientName: row.recipientName,
      recipientIban: row.recipientIban,
      amountValue: row.amountValue,
      amountCurrency: row.amountCurrency,
      memo: row.memo,
      sourceMonetaryAccountId: row.sourceMonetaryAccountId,
    });
    if (!proposalHashesEqual(proposalHash, row.proposalHash)) {
      return "Payment refused: stored payment fields no longer match the approved proposal hash (integrity check failed)";
    }
  } catch (error) {
    return `Payment refused: could not verify proposal integrity (${
      error instanceof Error ? error.message : "unknown error"
    })`;
  }
  if (
    row.approvedAmountValue &&
    !isApprovedAmountAllowed(row.amountValue, row.approvedAmountValue)
  ) {
    return "Payment refused: approved amount exceeds the proposed amount";
  }
  try {
    if (await isBunqPaymentsPaused(row.workspaceId)) {
      return "Payment refused: bunq payments are paused (kill switch is on)";
    }
  } catch {
    return "Payment refused: could not read the bunq pause flag (fail-closed)";
  }
  return null;
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

  // L2 + M4: last checks before any bank contact. All are definite local
  // failures (no bank call), so `failed` — never needs_reconciliation.
  const preBankFailure = await findPreBankFailure(row);
  if (preBankFailure) {
    const [failed] = await db
      .update(bunqPaymentProposals)
      .set({
        status: "failed",
        executionError: preBankFailure,
        updatedAt: new Date(),
      })
      .where(eq(bunqPaymentProposals.id, proposalId))
      .returning();
    if (!failed) throw notFound("Payment proposal");
    return failed;
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
  const approverUserId = assertRemonPaymentApprover(auth, ownerUserId, {
    proposalHash: input.proposalHash,
    approverCode: input.approverCode,
  });
  await assertPaymentsNotPaused(workspaceId);
  const actor = eventActorFromAuth(auth);

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
      // M1: bunq only honours a client idempotency key for ~24h. Past 23h a
      // "retry" could create a second real payment — refuse; resolve via ack.
      if (isIdempotencyRetryWindowExpired(row.paymentAttemptedAt, now)) {
        throw conflict(
          "The bunq idempotency window (23h) has passed since the unknown-outcome attempt — a retry could pay twice. Reconcile in bunq and acknowledge with the bunq payment id (or reject), then create a new proposal if the payment did not happen.",
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

    // M3: new-payee confirmation + rolling daily cap (serialised per workspace).
    const limits = resolveBunqPaymentLimits();
    if (row.amountCurrency.toUpperCase() !== "EUR") {
      throw badRequest("Only EUR payment proposals are supported");
    }
    const payeeDecision = evaluateNewPayee({
      policy: limits.newPayeePolicy,
      known: await isKnownPayee(workspaceId, row.recipientIban, row.id),
      confirmNewPayee: input.confirmNewPayee === true,
    });
    if (!payeeDecision.ok) throw forbidden(payeeDecision.message);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`bunq-daily-cap:${workspaceId}`}))`,
    );
    const windowStart = new Date(now.getTime() - BUNQ_DAILY_CAP_WINDOW_MS);
    const recent = await tx
      .select({
        amountValue: bunqPaymentProposals.amountValue,
        approvedAmountValue: bunqPaymentProposals.approvedAmountValue,
      })
      .from(bunqPaymentProposals)
      .where(
        and(
          eq(bunqPaymentProposals.workspaceId, workspaceId),
          ne(bunqPaymentProposals.id, row.id),
          inArray(bunqPaymentProposals.status, [
            ...BUNQ_DAILY_CAP_COUNTED_STATUSES,
          ]),
          gt(bunqPaymentProposals.approvedAt, windowStart),
        ),
      );
    const capDecision = evaluateDailyCap({
      spentCents: recent.reduce(
        (sum, r) =>
          sum + amountToCents(r.approvedAmountValue ?? r.amountValue),
        0,
      ),
      requestedCents: amountToCents(amountValue),
      capCents: limits.dailyCapCents,
    });
    if (!capDecision.ok) throw forbidden(capDecision.message);

    // One-use consume for this Approve & Pay cycle. Reapproval from
    // needs_reconciliation starts a new consume; bunq idempotency key unchanged.
    const [updated] = await tx
      .update(bunqPaymentProposals)
      .set({
        status: "approved",
        approvedByUserId: approverUserId,
        approvedByApiKeyId: auth.apiKeyId ?? null,
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
    await recordBunqPaymentProposalEvent(tx, {
      workspaceId,
      proposalId: row.id,
      eventType: "approved",
      actor,
      proposalHash: row.proposalHash,
      amountValue,
      amountCurrency: row.amountCurrency,
      statusFrom: row.status,
      statusTo: "approved",
      detail:
        row.status === "needs_reconciliation"
          ? "retry after acknowledged unknown outcome"
          : null,
    });
    return { kind: "approved" as const, row: updated };
  });

  if (!locked) throw notFound("Payment proposal");

  if (locked.kind === "idempotent") {
    return toProposal(locked.row);
  }

  // Execute only immediately after this fresh one-use approval — no free retry.
  const executed = await executeApprovedPayment(workspaceId, proposalId, deps);
  if (executed.status !== "approved") {
    await recordBunqPaymentProposalEventBestEffort(db, {
      workspaceId,
      proposalId,
      eventType:
        executed.status === "executed"
          ? "executed"
          : executed.status === "failed"
            ? "failed"
            : "needs_reconciliation",
      actor: SYSTEM_EVENT_ACTOR,
      proposalHash: executed.proposalHash,
      amountValue: executed.approvedAmountValue ?? executed.amountValue,
      amountCurrency: executed.amountCurrency,
      statusFrom: "approved",
      statusTo: executed.status,
      detail: executed.bunqPaymentId ?? executed.executionError ?? null,
    });
  }
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
  assertRemonPaymentApprover(auth, ownerUserId, {
    proposalHash: input.proposalHash,
    approverCode: input.approverCode,
  });
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
        rejectedByUserId: auth.userId,
        rejectedByApiKeyId: auth.apiKeyId ?? null,
        rejectedAt: now,
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
    await recordBunqPaymentProposalEvent(tx, {
      workspaceId,
      proposalId: row.id,
      eventType: "rejected",
      actor: eventActorFromAuth(auth),
      proposalHash: row.proposalHash,
      amountValue: row.amountValue,
      amountCurrency: row.amountCurrency,
      statusFrom: row.status,
      statusTo: "rejected",
      detail: input.note?.trim() || null,
    });
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
  const acknowledgerUserId = assertRemonPaymentApprover(auth, ownerUserId, {
    proposalHash: input.proposalHash,
    approverCode: input.approverCode,
  });
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

    const confirmedPaymentId =
      input.bunqPaymentId?.trim() ||
      (row.bunqPaymentId != null && row.bunqPaymentId.trim() !== ""
        ? row.bunqPaymentId.trim()
        : null);

    if (input.confirmPaymentAlreadyExists === true && confirmedPaymentId) {
      const [executed] = await tx
        .update(bunqPaymentProposals)
        .set({
          status: "executed",
          bunqPaymentId: confirmedPaymentId,
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
      await recordBunqPaymentProposalEvent(tx, {
        workspaceId,
        proposalId: row.id,
        eventType: "acknowledged",
        actor: eventActorFromAuth(auth),
        proposalHash: row.proposalHash,
        amountValue: row.approvedAmountValue ?? row.amountValue,
        amountCurrency: row.amountCurrency,
        statusFrom: "needs_reconciliation",
        statusTo: "executed",
        detail: `payment confirmed in bunq: ${confirmedPaymentId}`,
      });
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
    await recordBunqPaymentProposalEvent(tx, {
      workspaceId,
      proposalId: row.id,
      eventType: "acknowledged",
      actor: eventActorFromAuth(auth),
      proposalHash: row.proposalHash,
      amountValue: row.approvedAmountValue ?? row.amountValue,
      amountCurrency: row.amountCurrency,
      statusFrom: "needs_reconciliation",
      statusTo: "needs_reconciliation",
      detail: "unknown outcome acknowledged (payment not found in bunq)",
    });
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
    approverCode: string;
    /** M3 — Remon explicitly confirmed a first-seen payee. */
    confirmNewPayee?: boolean;
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
        approverCode: input.approverCode,
        ...(input.confirmNewPayee === true ? { confirmNewPayee: true } : {}),
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
    {
      proposalHash: input.proposalHash,
      approverCode: input.approverCode,
      note: input.note,
    },
  );
}

// ---------------------------------------------------------------------------
// M1 — auto-reconcile (read-only; never creates a payment)
// ---------------------------------------------------------------------------

export type BunqAutoReconcileDeps = {
  /** Recent payments on the source account (read-only GET). */
  listRecentPayments?: (
    workspaceId: string,
    monetaryAccountId: string,
  ) => Promise<ReconcilePaymentCandidate[]>;
  now?: () => Date;
};

export type BunqAutoReconcileResult =
  | { outcome: "matched"; bunqPaymentId: string; proposal: BunqPaymentProposal }
  | { outcome: "not_found"; checkedPayments: number }
  | { outcome: "skipped"; reason: string };

/**
 * Look up the payment in bunq (read-only) and, when exactly one outgoing
 * payment matches the proposal's IBAN / amount / memo (made after the attempt),
 * mark the proposal executed. It never resubmits and never sets `executed`
 * without a matching bunq payment id. A miss does NOT prove the payment did
 * not happen — it leaves the proposal in needs_reconciliation for Remon.
 */
export async function autoReconcileBunqPaymentProposal(
  workspaceId: string,
  proposalId: string,
  deps: BunqAutoReconcileDeps = {},
): Promise<BunqAutoReconcileResult> {
  const row = await getBunqPaymentProposal(workspaceId, proposalId);
  if (row.status !== "needs_reconciliation") {
    return { outcome: "skipped", reason: `status is ${row.status}` };
  }
  const attemptedAt = row.paymentAttemptedAt
    ? new Date(row.paymentAttemptedAt)
    : null;
  const list =
    deps.listRecentPayments ??
    ((wsId: string, accountId: string) => listBunqPayments(wsId, accountId));
  const payments = await list(workspaceId, row.sourceMonetaryAccountId);
  const matches = matchProposalPayments(
    {
      recipientIban: row.recipientIban,
      amountValue: row.amountValue,
      approvedAmountValue: row.approvedAmountValue,
      amountCurrency: row.amountCurrency,
      memo: row.memo,
      paymentAttemptedAt: attemptedAt,
    },
    payments,
  );
  if (matches.length !== 1) {
    return matches.length === 0
      ? { outcome: "not_found", checkedPayments: payments.length }
      : {
          outcome: "skipped",
          reason: `${matches.length} bunq payments match — ambiguous, reconcile manually`,
        };
  }
  const match = matches[0]!;
  const now = deps.now?.() ?? new Date();
  const [updated] = await db
    .update(bunqPaymentProposals)
    .set({
      status: "executed",
      bunqPaymentId: match.id,
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
  if (!updated) return { outcome: "skipped", reason: "status changed" };
  await recordBunqPaymentProposalEventBestEffort(db, {
    workspaceId,
    proposalId,
    eventType: "auto_reconciled",
    actor: SYSTEM_EVENT_ACTOR,
    proposalHash: updated.proposalHash,
    amountValue: updated.approvedAmountValue ?? updated.amountValue,
    amountCurrency: updated.amountCurrency,
    statusFrom: "needs_reconciliation",
    statusTo: "executed",
    detail: `matched bunq payment ${match.id}`,
  });
  await syncLinkedChatApprovalCard(updated);
  return {
    outcome: "matched",
    bunqPaymentId: match.id,
    proposal: toProposal(updated),
  };
}

// ---------------------------------------------------------------------------
// L2 — stuck `approved` sweeper
// ---------------------------------------------------------------------------

/**
 * A crash / lost response between "approved" and the bank outcome leaves a row
 * stuck in `approved`. After BUNQ_STUCK_APPROVED_AFTER_MS (2 min) with no bunq
 * payment id, the outcome is unknown → needs_reconciliation (never `failed`,
 * never auto-retried).
 */
export async function sweepStuckApprovedBunqPayments(
  options: { workspaceId?: string; now?: () => Date } = {},
): Promise<{ swept: string[] }> {
  const now = options.now?.() ?? new Date();
  const cutoff = new Date(now.getTime() - BUNQ_STUCK_APPROVED_AFTER_MS);
  const candidates = await db
    .select()
    .from(bunqPaymentProposals)
    .where(
      and(
        ...(options.workspaceId
          ? [eq(bunqPaymentProposals.workspaceId, options.workspaceId)]
          : []),
        eq(bunqPaymentProposals.status, "approved"),
        isNull(bunqPaymentProposals.bunqPaymentId),
        // approvedAt is always set for approved rows; attempt time wins below.
        lte(bunqPaymentProposals.approvedAt, cutoff),
      ),
    );
  const swept: string[] = [];
  for (const candidate of candidates) {
    if (!isStuckApproved(candidate, now)) continue;
    const [updated] = await db
      .update(bunqPaymentProposals)
      .set(
        needsReconciliationPatch({
          executionError:
            "Unknown payment outcome: the payment was approved but no result was recorded (process interrupted?). Reconcile with bunq before Retry payment.",
        }),
      )
      .where(
        and(
          eq(bunqPaymentProposals.id, candidate.id),
          eq(bunqPaymentProposals.status, "approved"),
          isNull(bunqPaymentProposals.bunqPaymentId),
        ),
      )
      .returning();
    if (!updated) continue;
    swept.push(updated.id);
    await recordBunqPaymentProposalEventBestEffort(db, {
      workspaceId: updated.workspaceId,
      proposalId: updated.id,
      eventType: "swept",
      actor: SYSTEM_EVENT_ACTOR,
      proposalHash: updated.proposalHash,
      amountValue: updated.approvedAmountValue ?? updated.amountValue,
      amountCurrency: updated.amountCurrency,
      statusFrom: "approved",
      statusTo: "needs_reconciliation",
      detail: "stuck in approved without a bunq payment id",
    });
    await syncLinkedChatApprovalCard(updated).catch(() => undefined);
  }
  return { swept };
}

/** Background interval; returns a stop function. No-op unless enabled. */
export function startBunqPaymentSweeper(intervalMs = 60_000): () => void {
  const timer = setInterval(() => {
    if (!isBunqPaymentProposalsEnabled()) return;
    sweepStuckApprovedBunqPayments().catch((error) => {
      console.error("[bunq] stuck-approved sweep failed", error);
    });
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
