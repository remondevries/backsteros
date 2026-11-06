/**
 * Pure outcome classification for OS-167 payment attempts — no DB / network.
 */

export type BunqPaymentAttemptOutcome =
  | { kind: "success"; paymentId: string }
  | { kind: "definite_failure"; message: string; status?: number }
  | { kind: "ambiguous"; message: string; status?: number }
  | { kind: "idempotency_conflict"; message: string };

export function classifyBunqPaymentHttpFailure(input: {
  status: number;
  message: string;
  body?: string;
}): BunqPaymentAttemptOutcome {
  if (input.status === 409) {
    return {
      kind: "idempotency_conflict",
      message:
        input.message ||
        "bunq idempotency conflict — payment may already exist; reconcile before retry",
    };
  }
  if (input.status >= 500 || input.status === 408 || input.status === 429) {
    return {
      kind: "ambiguous",
      message: input.message,
      status: input.status,
    };
  }
  if (input.status >= 400 && input.status < 500) {
    return {
      kind: "definite_failure",
      message: input.message,
      status: input.status,
    };
  }
  return {
    kind: "ambiguous",
    message: input.message || `unexpected bunq status ${input.status}`,
    status: input.status,
  };
}

export function classifyBunqPaymentTransportFailure(
  error: unknown,
): BunqPaymentAttemptOutcome {
  const message =
    error instanceof Error ? error.message : "bunq payment transport failure";
  return {
    kind: "ambiguous",
    message,
  };
}

/**
 * Status transitions after a Remon-authorized payment attempt.
 * Never auto-retry; ambiguous → needs_reconciliation.
 */
export function nextStatusAfterPaymentAttempt(
  outcome: BunqPaymentAttemptOutcome,
): "executed" | "failed" | "needs_reconciliation" {
  if (outcome.kind === "success") return "executed";
  if (outcome.kind === "definite_failure") return "failed";
  // idempotency_conflict and ambiguous: do not assume no payment
  return "needs_reconciliation";
}

/** Statuses that may receive a fresh Remon Approve & Pay (one-use). */
export function canAcceptFreshPaymentApproval(status: string): boolean {
  return status === "pending" || status === "needs_reconciliation";
}

/** Free execute retry without a new Remon approval is never allowed. */
export function canAutoRetryPaymentExecute(status: string): boolean {
  void status;
  return false;
}
