import type { BunqPayment } from "../../lib/bunq-client.js";
import { parseDecimalAmountToCents } from "./fingerprint.js";
import { toCashflowAmountCents } from "./ledger-polarity.js";

export function bunqPaymentFingerprint(paymentId: string): string {
  return `bunq:${paymentId}`;
}

/** bunq amounts use a period decimal separator (e.g. `-12.50`). */
export function parseBunqAmountToCents(raw: string): number {
  return parseDecimalAmountToCents(raw);
}

/** bunq timestamps look like `2026-11-06 12:00:00.000000`. */
export function bunqTimestampToBookedOn(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const match = raw.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

export function mapBunqPaymentToLedgerRow(
  payment: BunqPayment,
  accountType: string | null | undefined,
  monetaryAccountId: string,
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
  const bookedOn = bunqTimestampToBookedOn(payment.created);
  if (!bookedOn) return null;
  if (!payment.amount?.value) return null;

  const sourceAmountCents = parseBunqAmountToCents(payment.amount.value);
  return {
    bookedOn,
    amountCents: toCashflowAmountCents(sourceAmountCents, accountType),
    currency: (payment.amount.currency ?? "EUR").trim().toUpperCase() || "EUR",
    payee: payment.counterpartyName?.trim() || "",
    counterparty: payment.counterpartyIban?.trim() || null,
    memo: payment.description?.trim() || null,
    externalId: payment.id,
    fingerprint: bunqPaymentFingerprint(payment.id),
    sourceCode: "bunq",
    sourceType: payment.type?.trim() || null,
    settlementState: "settled",
    raw: {
      bunq_payment_id: payment.id,
      bunq_monetary_account_id: monetaryAccountId,
      bunq_created: payment.created,
      bunq_updated: payment.updated,
      bunq_type: payment.type,
      bunq_sub_type: payment.subType,
      bunq_amount: payment.amount,
      bunq_description: payment.description,
      bunq_counterparty_name: payment.counterpartyName,
      bunq_counterparty_iban: payment.counterpartyIban,
    },
  };
}
