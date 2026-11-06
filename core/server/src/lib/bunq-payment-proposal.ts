/**
 * Pure helpers for OS-167 bunq payment proposals (hash, IBAN, amounts, feature gate).
 * No network — safe for unit tests.
 */

import { createHash, timingSafeEqual } from "node:crypto";

export const BUNQ_PAYMENT_PROPOSAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "executed",
  "failed",
  "expired",
  /**
   * Payment HTTP outcome unknown (timeout / 5xx / lost response / DB write after
   * bank accept). Blocks further execute until Remon gives a fresh one-use
   * Approve & Pay; same bunq idempotency key is reused for the identical hash.
   */
  "needs_reconciliation",
] as const;

export type BunqPaymentProposalStatus =
  (typeof BUNQ_PAYMENT_PROPOSAL_STATUSES)[number];

export type BunqPaymentProposalHashInput = {
  recipientName: string;
  recipientIban: string;
  amountValue: string;
  amountCurrency: string;
  memo: string;
  sourceMonetaryAccountId: string;
};

/** Default proposal TTL — Remon must approve before expiry. */
export const BUNQ_PAYMENT_PROPOSAL_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/** Hard ceiling so Ralph cannot set an unbounded approval window. */
export const BUNQ_PAYMENT_PROPOSAL_MAX_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const IBAN_CHARS = /^[A-Z0-9]+$/;

/**
 * Feature gate — default OFF until Remon reviews UI and flips env on the
 * core that holds the bunq key. No auto-enable.
 */
export function isBunqPaymentProposalsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.BUNQ_PAYMENT_PROPOSALS_ENABLED?.trim() === "true";
}

/** Refuse live production payment HTTP in test / when explicitly disallowed. */
export function isBunqLivePaymentWriteAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NODE_ENV === "test" || env.VITEST === "true") {
    return false;
  }
  // Sandbox path does not need this flag; production transfers require it.
  return env.BUNQ_ALLOW_LIVE_PAYMENT_WRITES?.trim() === "true";
}

export function normalizeBunqIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

/**
 * Lightweight IBAN structure + ISO 13616 mod-97 check.
 * Rejects empty / short / non-alphanumeric values.
 */
export function assertValidBunqIban(iban: string): string {
  const normalized = normalizeBunqIban(iban);
  if (normalized.length < 15 || normalized.length > 34) {
    throw new Error("IBAN length is invalid");
  }
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(normalized)) {
    throw new Error("IBAN format is invalid");
  }
  if (!IBAN_CHARS.test(normalized)) {
    throw new Error("IBAN contains invalid characters");
  }
  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  let expanded = "";
  for (const char of rearranged) {
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      expanded += String(code - 55);
    } else {
      expanded += char;
    }
  }
  let remainder = 0;
  for (const digit of expanded) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  if (remainder !== 1) {
    throw new Error("IBAN checksum is invalid");
  }
  return normalized;
}

/** Normalize money amount to a fixed 2-decimal string (bunq style). */
export function normalizeBunqAmountValue(value: string): string {
  const trimmed = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("amount must be a positive decimal with at most 2 places");
  }
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount must be greater than zero");
  }
  // Cap single transfer — personal ops safety rail (not a bunq limit).
  if (amount > 50_000) {
    throw new Error("amount exceeds the single-transfer maximum (50000)");
  }
  return amount.toFixed(2);
}

export function normalizeBunqCurrency(currency: string): string {
  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("currency must be a 3-letter ISO code");
  }
  return normalized;
}

export function normalizeBunqMemo(memo: string): string {
  const trimmed = memo.trim();
  if (!trimmed) {
    throw new Error("memo is required");
  }
  if (trimmed.length > 140) {
    throw new Error("memo must be at most 140 characters");
  }
  return trimmed;
}

export function normalizeBunqRecipientName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    throw new Error("recipient name is required");
  }
  if (trimmed.length > 100) {
    throw new Error("recipient name must be at most 100 characters");
  }
  return trimmed;
}

export function normalizeBunqMonetaryAccountId(id: string): string {
  const trimmed = id.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    throw new Error("source monetary account id must be a bunq numeric id");
  }
  return trimmed;
}

export function canonicalizeBunqPaymentProposal(
  input: BunqPaymentProposalHashInput,
): BunqPaymentProposalHashInput {
  return {
    recipientName: normalizeBunqRecipientName(input.recipientName),
    recipientIban: assertValidBunqIban(input.recipientIban),
    amountValue: normalizeBunqAmountValue(input.amountValue),
    amountCurrency: normalizeBunqCurrency(input.amountCurrency),
    memo: normalizeBunqMemo(input.memo),
    sourceMonetaryAccountId: normalizeBunqMonetaryAccountId(
      input.sourceMonetaryAccountId,
    ),
  };
}

/**
 * SHA-256 hex of the canonical proposal fields (stable key order).
 * Remon approval must present this exact hash.
 */
export function hashBunqPaymentProposal(
  input: BunqPaymentProposalHashInput,
): { canonical: BunqPaymentProposalHashInput; proposalHash: string } {
  const canonical = canonicalizeBunqPaymentProposal(input);
  const payload = [
    canonical.recipientName,
    canonical.recipientIban,
    canonical.amountValue,
    canonical.amountCurrency,
    canonical.memo,
    canonical.sourceMonetaryAccountId,
  ].join("\n");
  const proposalHash = createHash("sha256").update(payload, "utf8").digest("hex");
  return { canonical, proposalHash };
}

export function proposalHashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a.trim().toLowerCase(), "utf8");
  const right = Buffer.from(b.trim().toLowerCase(), "utf8");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

/** True when approved amount is ≤ proposed (same currency assumed). */
export function isApprovedAmountAllowed(
  proposedValue: string,
  approvedValue: string,
): boolean {
  const proposed = Number(normalizeBunqAmountValue(proposedValue));
  const approved = Number(normalizeBunqAmountValue(approvedValue));
  return approved > 0 && approved <= proposed + 1e-9;
}
