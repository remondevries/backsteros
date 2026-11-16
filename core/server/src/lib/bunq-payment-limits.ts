/**
 * M3 — pure payment guard rails (no DB): daily cap, open-proposal limit,
 * new-payee policy. Env-configurable with safe defaults. New env names only;
 * existing BUNQ_PAYMENT_* flags are untouched.
 *
 *   BUNQ_PAYMENT_DAILY_CAP_EUR          decimal, default 2500.00 (rolling 24h)
 *   BUNQ_PAYMENT_MAX_OPEN_PROPOSALS     integer ≥ 1, default 5 per agent
 *   BUNQ_PAYMENT_NEW_PAYEE_POLICY       confirm (default) | refuse | off
 *   BUNQ_PAYMENT_ALLOWED_IBANS          comma list of pre-approved IBANs
 */

import { normalizeBunqIban } from "./bunq-payment-proposal.js";

export const DEFAULT_BUNQ_DAILY_CAP_CENTS = 2_500_00;
export const DEFAULT_BUNQ_MAX_OPEN_PROPOSALS_PER_AGENT = 5;
export const BUNQ_DAILY_CAP_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Statuses whose amount counts against the rolling daily cap. */
export const BUNQ_DAILY_CAP_COUNTED_STATUSES = [
  "approved",
  "executed",
  // Unknown outcome: money may have left — count it until reconciled.
  "needs_reconciliation",
] as const;
/** Statuses that occupy an agent's open-proposal slot. */
export const BUNQ_OPEN_PROPOSAL_STATUSES = [
  "pending",
  "approved",
  "needs_reconciliation",
] as const;

export type BunqNewPayeePolicy = "confirm" | "refuse" | "off";

export type BunqPaymentLimits = {
  dailyCapCents: number;
  maxOpenProposalsPerAgent: number;
  newPayeePolicy: BunqNewPayeePolicy;
  allowedIbans: ReadonlySet<string>;
};

/** "12.34" → 1234. Throws on malformed values. */
export function amountToCents(value: string): number {
  const trimmed = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`invalid amount ${value}`);
  }
  const [whole, frac = ""] = trimmed.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export function formatCents(cents: number): string {
  const whole = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, "0");
  return `${whole}.${frac}`;
}

export function resolveBunqPaymentLimits(
  env: NodeJS.ProcessEnv = process.env,
): BunqPaymentLimits {
  let dailyCapCents = DEFAULT_BUNQ_DAILY_CAP_CENTS;
  const capRaw = env.BUNQ_PAYMENT_DAILY_CAP_EUR?.trim();
  if (capRaw) {
    try {
      const cents = amountToCents(capRaw);
      if (cents > 0) dailyCapCents = cents;
    } catch {
      // keep the safe default on garbage
    }
  }

  let maxOpen = DEFAULT_BUNQ_MAX_OPEN_PROPOSALS_PER_AGENT;
  const openRaw = env.BUNQ_PAYMENT_MAX_OPEN_PROPOSALS?.trim();
  if (openRaw && /^\d+$/.test(openRaw) && Number(openRaw) >= 1) {
    maxOpen = Number(openRaw);
  }

  const policyRaw = env.BUNQ_PAYMENT_NEW_PAYEE_POLICY?.trim().toLowerCase();
  const newPayeePolicy: BunqNewPayeePolicy =
    policyRaw === "refuse" || policyRaw === "off" ? policyRaw : "confirm";

  const allowedIbans = new Set<string>();
  for (const part of (env.BUNQ_PAYMENT_ALLOWED_IBANS ?? "").split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    try {
      allowedIbans.add(normalizeBunqIban(trimmed));
    } catch {
      // ignore malformed allowlist entries
    }
  }

  return {
    dailyCapCents,
    maxOpenProposalsPerAgent: maxOpen,
    newPayeePolicy,
    allowedIbans,
  };
}

export type LimitDecision =
  | { ok: true }
  | { ok: false; status: 403 | 409; message: string };

export function evaluateDailyCap(input: {
  spentCents: number;
  requestedCents: number;
  capCents: number;
}): LimitDecision {
  if (input.requestedCents > input.capCents) {
    return {
      ok: false,
      status: 403,
      message: `Amount exceeds the daily payment cap (${formatCents(input.capCents)} EUR)`,
    };
  }
  if (input.spentCents + input.requestedCents > input.capCents) {
    return {
      ok: false,
      status: 403,
      message: `Daily payment cap reached: ${formatCents(input.spentCents)} of ${formatCents(input.capCents)} EUR already approved in the last 24h`,
    };
  }
  return { ok: true };
}

export function evaluateOpenProposalLimit(input: {
  openCount: number;
  max: number;
}): LimitDecision {
  if (input.openCount >= input.max) {
    return {
      ok: false,
      status: 409,
      message: `Too many open payment proposals (${input.openCount}/${input.max}); wait for Remon to decide or let them expire`,
    };
  }
  return { ok: true };
}

export function isIbanAllowlisted(
  iban: string,
  allowedIbans: ReadonlySet<string>,
): boolean {
  try {
    return allowedIbans.has(normalizeBunqIban(iban));
  } catch {
    return false;
  }
}

/**
 * `known` = allowlisted or previously paid (executed) in this workspace.
 * confirm → needs `confirmNewPayee`; refuse → never until allowlisted.
 */
export function evaluateNewPayee(input: {
  policy: BunqNewPayeePolicy;
  known: boolean;
  confirmNewPayee: boolean;
}): LimitDecision {
  if (input.policy === "off" || input.known) return { ok: true };
  if (input.policy === "refuse") {
    return {
      ok: false,
      status: 403,
      message:
        "New payee refused: this IBAN has never been paid and is not in BUNQ_PAYMENT_ALLOWED_IBANS",
    };
  }
  if (!input.confirmNewPayee) {
    return {
      ok: false,
      status: 409,
      message:
        "New payee: this IBAN has never been paid. Re-approve with confirmNewPayee=true after verifying it",
    };
  }
  return { ok: true };
}
