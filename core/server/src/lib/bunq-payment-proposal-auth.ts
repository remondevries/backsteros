/**
 * Pure auth helpers for OS-167 payment proposals — no DB import.
 * Safe for unit tests without DATABASE_URL.
 */

import type { AuthContext } from "../middleware/auth.js";

/** Agent persona keys are API keys bound to a contact (never Access/door keys). */
export function isAgentPersonaAuth(
  auth: AuthContext | undefined | null,
): boolean {
  return Boolean(auth && auth.kind === "api_key" && auth.contactId != null);
}

function forbidden(message: string): Error {
  return Object.assign(new Error(message), {
    status: 403,
    code: "forbidden",
  });
}

/**
 * Stable Ralph allowlist — agent id from env (immutable), not display name.
 * Empty / unset → proposes are refused when the feature is on.
 */
export function resolveAllowedBunqPaymentProposalAgentId(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = env.BUNQ_PAYMENT_PROPOSAL_AGENT_ID?.trim();
  return raw || null;
}

export function assertAgentAllowedToProposeBunqPayments(
  agentId: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const allowed = resolveAllowedBunqPaymentProposalAgentId(env);
  if (!allowed) {
    throw forbidden(
      "bunq payment proposals require BUNQ_PAYMENT_PROPOSAL_AGENT_ID (stable agent id)",
    );
  }
  if (agentId !== allowed) {
    throw forbidden(
      "Only the configured payment-proposal agent may create bunq payment proposals",
    );
  }
}

/**
 * Remon only — authenticated workspace owner (local-shell or Access key).
 * Agent persona keys (Ralph) are always refused.
 */
export function assertRemonPaymentApprover(
  auth: AuthContext,
  workspaceOwnerUserId: string,
): string {
  if (isAgentPersonaAuth(auth)) {
    throw forbidden("Ralph cannot approve bunq payment proposals");
  }
  const userId = auth.userId?.trim();
  if (!userId || userId !== workspaceOwnerUserId) {
    throw forbidden(
      "Only the authenticated workspace owner (Remon) may approve bunq payments",
    );
  }
  if (auth.kind === "local_shell") {
    return userId;
  }
  if (auth.kind === "api_key" && auth.contactId == null) {
    return userId;
  }
  throw forbidden(
    "Only the authenticated workspace owner (Remon) may approve bunq payments",
  );
}
