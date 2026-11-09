/**
 * bunq → financial_transactions sync (OS-166 / OS-171).
 * Only for the Finance bank account key `bunq-personal`.
 * Insert-only by bunq payment id; no payment/mutation writes to bunq.
 *
 * Hybrid local-core (CORE_REPLICATION_ROLE=local) never calls bunq HTTP —
 * ownership is cloud-core via peer forward (permitted egress IP).
 */

import { and, eq } from "drizzle-orm";

import type { BunqBankAccountSyncResult } from "@backsteros/contracts";

import { db } from "../../db/index.js";
import { financialTransactions } from "../../db/schema.js";
import {
  BunqApiError,
  type BunqPayment,
} from "../../lib/bunq-client.js";
import {
  BunqSyncCloudForwardError,
  forwardBunqSyncToCloud,
  shouldForwardBunqSyncToCloud,
} from "../../lib/bunq-sync-cloud-forward.js";
import { newId } from "../../lib/crypto.js";
import {
  BUNQ_PERSONAL_BANK_ACCOUNT_KEY,
  ensureBunqPersonalBankAccount,
} from "../bunq-personal-bank-account.js";
import { getConnectedBunqClient } from "../bunq-settings.js";
import {
  commitFinancialTransactionCreates,
  getBankAccountById,
  type FinancialTransactionSyncCreateInput,
} from "./finance.js";
import { mapBunqPaymentToLedgerRow } from "./bunq-sync-map.js";

export {
  bunqPaymentFingerprint,
  bunqTimestampToBookedOn,
  mapBunqPaymentToLedgerRow,
  parseBunqAmountToCents,
} from "./bunq-sync-map.js";

export { BunqSyncCloudForwardError, shouldForwardBunqSyncToCloud };

export async function syncBankAccountFromBunq(
  workspaceId: string,
  bankAccountId: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<BunqBankAccountSyncResult | null> {
  const account = await getBankAccountById(workspaceId, bankAccountId);
  if (!account) return null;

  if (account.key !== BUNQ_PERSONAL_BANK_ACCOUNT_KEY) {
    throw new BunqApiError(
      400,
      "",
      `bunq sync is only supported for the "${BUNQ_PERSONAL_BANK_ACCOUNT_KEY}" bank account`,
    );
  }

  // Keep the canonical Finance row present even if someone renamed the display name.
  await ensureBunqPersonalBankAccount(workspaceId);

  if (shouldForwardBunqSyncToCloud()) {
    // No local bunq HTTP — cloud owns ingestion; ledger rows replicate back.
    return forwardBunqSyncToCloud({
      workspaceId,
      bankAccountId,
      fetchImpl: options.fetchImpl,
    });
  }

  return runBunqSyncLocally(workspaceId, bankAccountId, account.type);
}

/** Cloud / standalone path — calls bunq from this host's egress IP. */
export async function runBunqSyncLocally(
  workspaceId: string,
  bankAccountId: string,
  accountType: string,
): Promise<BunqBankAccountSyncResult> {
  const client = await getConnectedBunqClient(workspaceId);

  const monetaryAccounts = await client.listMonetaryAccounts();
  const payments: Array<{ payment: BunqPayment; monetaryAccountId: string }> =
    [];
  for (const monetary of monetaryAccounts) {
    const batch = await client.listAllPayments(monetary.id, {
      pageSize: 200,
      maxPages: 25,
    });
    for (const payment of batch) {
      payments.push({ payment, monetaryAccountId: monetary.id });
    }
  }

  const fetched = payments.length;
  const localRows = await db
    .select({
      externalId: financialTransactions.externalId,
    })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.workspaceId, workspaceId),
        eq(financialTransactions.bankAccountId, bankAccountId),
        eq(financialTransactions.sourceCode, "bunq"),
      ),
    );

  const existingExternalIds = new Set(
    localRows
      .map((row) => row.externalId?.trim())
      .filter((id): id is string => Boolean(id)),
  );

  const pendingInserts: Array<
    { id: string } & FinancialTransactionSyncCreateInput
  > = [];

  for (const entry of payments) {
    const ledger = mapBunqPaymentToLedgerRow(
      entry.payment,
      accountType,
      entry.monetaryAccountId,
    );
    if (!ledger) continue;
    if (existingExternalIds.has(ledger.externalId)) continue;
    pendingInserts.push({
      id: newId(),
      bankAccountId,
      bookedOn: ledger.bookedOn,
      amountCents: ledger.amountCents,
      currency: ledger.currency,
      payee: ledger.payee,
      counterparty: ledger.counterparty,
      memo: ledger.memo,
      balanceAfterCents: null,
      externalId: ledger.externalId,
      fingerprint: ledger.fingerprint,
      sourceCode: ledger.sourceCode,
      sourceType: ledger.sourceType,
      settlementState: ledger.settlementState,
      raw: ledger.raw,
    });
    existingExternalIds.add(ledger.externalId);
  }

  let inserted = 0;
  let duplicates = fetched - pendingInserts.length;
  if (pendingInserts.length > 0) {
    inserted = await commitFinancialTransactionCreates(
      workspaceId,
      pendingInserts,
    );
    duplicates += pendingInserts.length - inserted;
  }

  const lastSyncedAt = new Date().toISOString();
  return {
    bankAccountId,
    fetched,
    inserted,
    duplicates,
    monetaryAccountCount: monetaryAccounts.length,
    lastSyncedAt,
  };
}
