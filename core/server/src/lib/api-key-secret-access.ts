/**
 * Pure policy for revealing / rotating API key secrets — no DB import.
 *
 * Agent persona keys (contactId != null) carry the payment-proposal door.
 * A leaked Access key must not be able to read or mint them. Only the local
 * shell (physical Remon session) may reveal/rotate agent keys, and only the
 * local shell may touch the payment-proposal agent's key.
 */

import type { AuthContext } from "../middleware/auth.js";

export type ApiKeySecretAccessTarget = {
  contactId: string | null;
  /** True when this key is bound to BUNQ_PAYMENT_PROPOSAL_AGENT_ID. */
  isPaymentProposalAgentKey: boolean;
};

export type ApiKeySecretAccessDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

export function evaluateApiKeySecretAccess(
  auth: Pick<AuthContext, "kind">,
  target: ApiKeySecretAccessTarget,
): ApiKeySecretAccessDecision {
  if (auth.kind === "local_shell") return { allowed: true };
  if (target.isPaymentProposalAgentKey) {
    return {
      allowed: false,
      reason:
        "The payment-proposal agent key can only be revealed or rotated from the local shell",
    };
  }
  if (target.contactId != null) {
    return {
      allowed: false,
      reason:
        "Agent API keys can only be revealed or rotated from the local shell",
    };
  }
  return { allowed: true };
}
