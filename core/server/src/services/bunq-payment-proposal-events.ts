/**
 * M2 — append-only audit trail for bunq payment proposals.
 * Rows are inserted in the same transaction as the transition when possible;
 * the table has a DB trigger forbidding UPDATE / direct DELETE (migration 0203).
 */

import { asc, and, eq } from "drizzle-orm";

import { db } from "../db/index.js";
import {
  bunqPaymentProposalEvents,
  type DbBunqPaymentProposalEvent,
} from "../db/schema.js";
import { isAgentPersonaAuth } from "../lib/bunq-payment-proposal-auth.js";
import { newId } from "../lib/crypto.js";
import type { AuthContext } from "../middleware/auth.js";

export type BunqPaymentEventActorKind =
  | "agent"
  | "owner_api_key"
  | "local_shell"
  | "owner_session"
  | "system";

export type BunqPaymentEventType =
  | "created"
  | "approved"
  | "rejected"
  | "acknowledged"
  | "executed"
  | "failed"
  | "needs_reconciliation"
  | "expired"
  | "swept"
  | "auto_reconciled";

export type BunqPaymentEventActor = {
  kind: BunqPaymentEventActorKind;
  userId: string | null;
  apiKeyId: string | null;
};

export const SYSTEM_EVENT_ACTOR: BunqPaymentEventActor = {
  kind: "system",
  userId: null,
  apiKeyId: null,
};

export function eventActorFromAuth(auth: AuthContext): BunqPaymentEventActor {
  if (isAgentPersonaAuth(auth)) {
    return { kind: "agent", userId: null, apiKeyId: auth.apiKeyId ?? null };
  }
  if (auth.kind === "local_shell") {
    return { kind: "local_shell", userId: auth.userId, apiKeyId: null };
  }
  if (auth.kind === "api_key") {
    return {
      kind: "owner_api_key",
      userId: auth.userId,
      apiKeyId: auth.apiKeyId ?? null,
    };
  }
  return { kind: "owner_session", userId: auth.userId, apiKeyId: null };
}

export type BunqPaymentEventInput = {
  workspaceId: string;
  proposalId: string;
  eventType: BunqPaymentEventType;
  actor: BunqPaymentEventActor;
  proposalHash: string;
  amountValue: string;
  amountCurrency: string;
  statusFrom: string | null;
  statusTo: string;
  detail?: string | null;
};

/** `db` or a transaction handle. */
export type BunqPaymentEventWriter = Pick<typeof db, "insert">;

export async function recordBunqPaymentProposalEvent(
  writer: BunqPaymentEventWriter,
  input: BunqPaymentEventInput,
): Promise<void> {
  await writer.insert(bunqPaymentProposalEvents).values({
    id: newId(),
    workspaceId: input.workspaceId,
    proposalId: input.proposalId,
    eventType: input.eventType,
    actorKind: input.actor.kind,
    actorUserId: input.actor.userId,
    actorApiKeyId: input.actor.apiKeyId,
    proposalHash: input.proposalHash,
    amountValue: input.amountValue,
    amountCurrency: input.amountCurrency,
    statusFrom: input.statusFrom,
    statusTo: input.statusTo,
    detail: input.detail ?? null,
  });
}

/** Post-bank events must never mask the payment outcome. */
export async function recordBunqPaymentProposalEventBestEffort(
  writer: BunqPaymentEventWriter,
  input: BunqPaymentEventInput,
): Promise<void> {
  try {
    await recordBunqPaymentProposalEvent(writer, input);
  } catch (error) {
    console.error("[bunq] could not record payment proposal event", error);
  }
}

export async function listBunqPaymentProposalEvents(
  workspaceId: string,
  proposalId: string,
): Promise<DbBunqPaymentProposalEvent[]> {
  return db
    .select()
    .from(bunqPaymentProposalEvents)
    .where(
      and(
        eq(bunqPaymentProposalEvents.workspaceId, workspaceId),
        eq(bunqPaymentProposalEvents.proposalId, proposalId),
      ),
    )
    .orderBy(asc(bunqPaymentProposalEvents.createdAt));
}
