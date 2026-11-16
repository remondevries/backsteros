/**
 * Pure auth helpers for OS-167 payment proposals — no DB import.
 * Safe for unit tests without DATABASE_URL.
 */

import type { AuthContext } from "../middleware/auth.js";
import {
  resolveBunqPaymentApproverTotpSecret,
  verifyBunqPaymentApproverCode,
} from "./bunq-payment-approver-stepup.js";

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
 * Explicit Remon device / Access keys allowed to attempt payment approval.
 * Comma-separated api_key ids. Empty → no API key may approve (local_shell only,
 * and still requires step-up).
 */
export function resolveBunqPaymentApproverApiKeyIds(
  env: NodeJS.ProcessEnv = process.env,
): ReadonlySet<string> {
  const raw = env.BUNQ_PAYMENT_APPROVER_API_KEY_IDS?.trim() ?? "";
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  );
}

export type PaymentApproverStepUp = {
  /** 6-digit code bound to proposalHash (HMAC step-up). */
  approverCode: string;
  proposalHash: string;
  nowMs?: number;
};

/**
 * Remon only — workspace owner with a dedicated approver credential.
 * Bearer API keys alone are never enough: require hash-bound step-up code.
 * App Access keys outside BUNQ_PAYMENT_APPROVER_API_KEY_IDS are refused.
 * Agent persona keys (Ralph) are always refused.
 */
export function assertRemonPaymentApprover(
  auth: AuthContext,
  workspaceOwnerUserId: string,
  stepUp: PaymentApproverStepUp,
  env: NodeJS.ProcessEnv = process.env,
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

  if (auth.kind === "api_key") {
    if (auth.contactId != null) {
      throw forbidden(
        "Only the authenticated workspace owner (Remon) may approve bunq payments",
      );
    }
    const allowlist = resolveBunqPaymentApproverApiKeyIds(env);
    const keyId = auth.apiKeyId?.trim() ?? "";
    if (!keyId || !allowlist.has(keyId)) {
      throw forbidden(
        "This Access key is not allowed to approve bunq payments (configure BUNQ_PAYMENT_APPROVER_API_KEY_IDS)",
      );
    }
  } else if (auth.kind !== "local_shell") {
    throw forbidden(
      "Only the authenticated workspace owner (Remon) may approve bunq payments",
    );
  }

  const secret = resolveBunqPaymentApproverTotpSecret(env);
  if (!secret) {
    throw forbidden(
      "bunq payment approval requires BUNQ_PAYMENT_APPROVER_TOTP_SECRET (hash-bound step-up)",
    );
  }
  const ok = verifyBunqPaymentApproverCode(
    secret,
    stepUp.proposalHash,
    stepUp.approverCode,
    stepUp.nowMs ?? Date.now(),
  );
  if (!ok) {
    throw forbidden(
      "Invalid or expired payment approver code for this proposal hash",
    );
  }

  return userId;
}

/**
 * M4 kill switch. PAUSE is deliberately easy: any authenticated non-agent
 * workspace owner credential may stop payments. RESUME is as strict as a
 * payment approval credential (local shell, or an allowlisted approver key) —
 * an agent or arbitrary Access key can never re-enable payments.
 */
export function assertMayTogglePaymentsPause(
  auth: AuthContext,
  workspaceOwnerUserId: string,
  paused: boolean,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (isAgentPersonaAuth(auth)) {
    throw forbidden("Agents cannot change the bunq payments pause switch");
  }
  const userId = auth.userId?.trim();
  if (!userId || userId !== workspaceOwnerUserId) {
    throw forbidden(
      "Only the workspace owner may change the bunq payments pause switch",
    );
  }
  if (paused) return;
  if (auth.kind === "local_shell") return;
  if (auth.kind === "api_key") {
    const keyId = auth.apiKeyId?.trim() ?? "";
    if (keyId && resolveBunqPaymentApproverApiKeyIds(env).has(keyId)) return;
  }
  throw forbidden(
    "Resuming bunq payments requires the local shell or an approver Access key (BUNQ_PAYMENT_APPROVER_API_KEY_IDS)",
  );
}
