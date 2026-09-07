import type { MoneybirdFinancialMutation } from "../../lib/moneybird-client.js";
import { normalizeFinancialSettlementState } from "@backsteros/contracts";
import { parseDecimalAmountToCents } from "./fingerprint.js";
import { toCashflowAmountCents } from "./ledger-polarity.js";

export function moneybirdMutationFingerprint(mutationId: string): string {
  return `moneybird:${mutationId}`;
}

/** Moneybird amounts use a period decimal separator (e.g. `-12.50`). */
export function parseMoneybirdAmountToCents(raw: string): number {
  return parseDecimalAmountToCents(raw);
}

export function mapMoneybirdMutationToLedgerRow(
  mutation: MoneybirdFinancialMutation,
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
  settlementState: string | null;
  raw: Record<string, unknown>;
} {
  const sourceAmountCents = parseMoneybirdAmountToCents(mutation.amount);
  return {
    bookedOn: mutation.date,
    amountCents: toCashflowAmountCents(sourceAmountCents, accountType),
    currency: (mutation.currency ?? "EUR").trim().toUpperCase() || "EUR",
    payee: mutation.contraAccountName?.trim() || "",
    counterparty: mutation.contraAccountNumber?.trim() || null,
    memo: mutation.message?.trim() || null,
    externalId: mutation.id,
    fingerprint: moneybirdMutationFingerprint(mutation.id),
    sourceCode: "moneybird",
    sourceType: mutation.state?.trim() || null,
    settlementState: normalizeFinancialSettlementState(mutation.settlementState),
    raw: mutation.raw,
  };
}
