/**
 * M1 / L2 — pure reconcile + sweeper helpers (no DB, no bunq HTTP).
 */

/** bunq idempotency keys are only honoured for 24h; stay clear of the edge. */
export const BUNQ_IDEMPOTENCY_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
/** `approved` with no bunq payment id after this long → needs_reconciliation. */
export const BUNQ_STUCK_APPROVED_AFTER_MS = 2 * 60 * 1000;

/**
 * Retrying with the same idempotency key after ~24h could create a SECOND
 * payment (bunq forgets the key). No attempt timestamp → treated as expired.
 */
export function isIdempotencyRetryWindowExpired(
  paymentAttemptedAt: Date | null | undefined,
  now: Date,
): boolean {
  if (!paymentAttemptedAt) return true;
  return (
    now.getTime() - paymentAttemptedAt.getTime() > BUNQ_IDEMPOTENCY_RETRY_WINDOW_MS
  );
}

export type StuckApprovedCandidate = {
  status: string;
  bunqPaymentId: string | null;
  paymentAttemptedAt: Date | null;
  approvedAt: Date | null;
  updatedAt: Date;
};

/** The instant a stuck-`approved` row started waiting on its payment attempt. */
export function stuckApprovedSince(row: StuckApprovedCandidate): Date {
  return row.paymentAttemptedAt ?? row.approvedAt ?? row.updatedAt;
}

export function isStuckApproved(
  row: StuckApprovedCandidate,
  now: Date,
): boolean {
  if (row.status !== "approved") return false;
  if (row.bunqPaymentId != null && row.bunqPaymentId.trim() !== "") return false;
  return (
    now.getTime() - stuckApprovedSince(row).getTime() >=
    BUNQ_STUCK_APPROVED_AFTER_MS
  );
}

export type ReconcilePaymentCandidate = {
  id: string;
  created: string | null;
  amountValue: string | null;
  amountCurrency: string | null;
  description: string | null;
  counterpartyIban: string | null;
};

export type ReconcileProposalFacts = {
  recipientIban: string;
  amountValue: string;
  approvedAmountValue: string | null;
  amountCurrency: string;
  memo: string;
  paymentAttemptedAt: Date | null;
};

function absAmount(value: string | null): string | null {
  if (value == null) return null;
  const n = Number(value.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.abs(n).toFixed(2);
}

function normIban(value: string | null): string {
  return (value ?? "").replace(/\s+/g, "").toUpperCase();
}

/**
 * Recent bank payments that look like this proposal's transfer (outgoing,
 * same IBAN / amount / currency / memo, created at or after the attempt).
 */
export function matchProposalPayments(
  facts: ReconcileProposalFacts,
  payments: readonly ReconcilePaymentCandidate[],
  slackMs = 60_000,
): ReconcilePaymentCandidate[] {
  const expectedAmount = absAmount(facts.approvedAmountValue ?? facts.amountValue);
  const attemptedAt = facts.paymentAttemptedAt?.getTime() ?? null;
  return payments.filter((payment) => {
    if (normIban(payment.counterpartyIban) !== normIban(facts.recipientIban)) {
      return false;
    }
    if (absAmount(payment.amountValue) !== expectedAmount) return false;
    if (
      (payment.amountCurrency ?? facts.amountCurrency).toUpperCase() !==
      facts.amountCurrency.toUpperCase()
    ) {
      return false;
    }
    if ((payment.description ?? "").trim() !== facts.memo.trim()) return false;
    if (attemptedAt != null && payment.created) {
      const created = Date.parse(payment.created.replace(" ", "T") + (payment.created.includes("Z") || /[+-]\d\d:?\d\d$/.test(payment.created) ? "" : "Z"));
      if (Number.isFinite(created) && created < attemptedAt - slackMs) {
        return false;
      }
    }
    return true;
  });
}
