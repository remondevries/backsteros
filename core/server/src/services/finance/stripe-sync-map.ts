import type { StripeBalanceTransaction } from "@backsteros/contracts";

import { toCashflowAmountCents } from "./ledger-polarity.js";

export function stripeBalanceTransactionFingerprint(txnId: string): string {
  return `stripe:${txnId}`;
}

/** Stripe `created` is unix seconds. */
export function stripeCreatedToBookedOn(created: number): string | null {
  if (!Number.isFinite(created) || created <= 0) return null;
  try {
    return new Date(created * 1000).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function typeLabel(type: string): string {
  return type.replace(/_/g, " ").trim();
}

function settlementStateFromStatus(status: string | null): string {
  const normalized = status?.trim().toLowerCase() ?? "";
  if (normalized === "pending") return "pending";
  if (normalized === "available") return "settled";
  return normalized || "settled";
}

/**
 * Map a Stripe Balance Transaction into a ledger row.
 * Uses `net` (amount after Stripe fees) — same cashflow signal Firm showed live.
 */
export function mapStripeBalanceTransactionToLedgerRow(
  txn: StripeBalanceTransaction,
  accountType: string | null | undefined,
): {
  bookedOn: string;
  amountCents: number;
  currency: string;
  payee: string;
  counterparty: string | null;
  memo: string | null;
  externalId: string;
  fingerprint: string;
  sourceCode: string;
  sourceType: string | null;
  settlementState: string;
  raw: Record<string, unknown>;
} | null {
  const bookedOn = stripeCreatedToBookedOn(txn.created);
  if (!bookedOn) return null;
  if (!txn.id?.trim()) return null;

  const title = txn.description?.trim() || typeLabel(txn.type) || "Stripe";
  const memoParts = [typeLabel(txn.type), txn.status]
    .filter(Boolean)
    .map(String);
  if (txn.fee !== 0) {
    memoParts.push(`fee ${txn.fee}`);
  }

  return {
    bookedOn,
    amountCents: toCashflowAmountCents(txn.net, accountType),
    currency: (txn.currency ?? "eur").trim().toUpperCase() || "EUR",
    payee: title,
    counterparty: txn.source?.trim() || null,
    memo: memoParts.join(" · ") || null,
    externalId: txn.id.trim(),
    fingerprint: stripeBalanceTransactionFingerprint(txn.id.trim()),
    sourceCode: "stripe",
    sourceType: txn.type?.trim() || null,
    settlementState: settlementStateFromStatus(txn.status),
    raw: {
      stripe_balance_transaction_id: txn.id,
      stripe_amount: txn.amount,
      stripe_fee: txn.fee,
      stripe_net: txn.net,
      stripe_currency: txn.currency,
      stripe_type: txn.type,
      stripe_status: txn.status,
      stripe_created: txn.created,
      stripe_description: txn.description,
      stripe_source: txn.source,
    },
  };
}
