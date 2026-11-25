/**
 * Stripe Balance Transactions → financial_transactions sync.
 * Only for the Finance bank account key `stripe`.
 * Insert-only by Stripe BT id (`txn_…`); no writes back to Stripe.
 */

import { and, eq } from "drizzle-orm";

import type { StripeBankAccountSyncResult } from "@backsteros/contracts";

import { db } from "../../db/index.js";
import { financialTransactions } from "../../db/schema.js";
import { StripeApiError } from "../../lib/stripe-client.js";
import { newId } from "../../lib/crypto.js";
import {
  STRIPE_BANK_ACCOUNT_KEY,
  ensureStripeBankAccount,
} from "../stripe-bank-account.js";
import {
  listAllStripeBalanceTransactions,
} from "../stripe-settings.js";
import { assignTransferCategoriesOnImport } from "./assign-transfer-category.js";
import {
  commitFinancialTransactionCreates,
  getBankAccountById,
  type FinancialTransactionSyncCreateInput,
} from "./finance.js";
import { mapStripeBalanceTransactionToLedgerRow } from "./stripe-sync-map.js";

export {
  mapStripeBalanceTransactionToLedgerRow,
  stripeBalanceTransactionFingerprint,
  stripeCreatedToBookedOn,
} from "./stripe-sync-map.js";

export async function syncBankAccountFromStripe(
  workspaceId: string,
  bankAccountId: string,
): Promise<StripeBankAccountSyncResult | null> {
  const account = await getBankAccountById(workspaceId, bankAccountId);
  if (!account) return null;

  if (account.key !== STRIPE_BANK_ACCOUNT_KEY) {
    throw new StripeApiError(
      `Stripe sync is only supported for the "${STRIPE_BANK_ACCOUNT_KEY}" bank account`,
      { code: "bad_request", status: 400 },
    );
  }

  await ensureStripeBankAccount(workspaceId);

  const transactions = await listAllStripeBalanceTransactions(workspaceId, {
    pageSize: 100,
    maxPages: 25,
  });
  const fetched = transactions.length;

  const localRows = await db
    .select({
      externalId: financialTransactions.externalId,
    })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.workspaceId, workspaceId),
        eq(financialTransactions.bankAccountId, bankAccountId),
        eq(financialTransactions.sourceCode, "stripe"),
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

  for (const txn of transactions) {
    const ledger = mapStripeBalanceTransactionToLedgerRow(txn, account.type);
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
    const transferAssign = await assignTransferCategoriesOnImport(
      workspaceId,
      pendingInserts,
    );
    inserted = await commitFinancialTransactionCreates(
      workspaceId,
      pendingInserts,
    );
    duplicates += pendingInserts.length - inserted;
    if (
      inserted > 0 &&
      transferAssign.counterpartIdsToRecategorize.length > 0
    ) {
      const { batchUpdateTransactions, getTransactionById } = await import(
        "./finance.js"
      );
      const { recordFinancialTransactionRestSyncEvent } = await import(
        "../sync.js"
      );
      const byCategory = new Map<string, string[]>();
      for (const id of transferAssign.counterpartIdsToRecategorize) {
        const categoryId = transferAssign.transferCategoryIdByRowId.get(id);
        if (!categoryId) continue;
        const list = byCategory.get(categoryId) ?? [];
        list.push(id);
        byCategory.set(categoryId, list);
      }
      for (const [categoryId, ids] of byCategory) {
        await batchUpdateTransactions(
          workspaceId,
          ids,
          { categoryId },
          undefined,
          { onlyUncategorized: true },
        );
        for (const id of ids) {
          const row = await getTransactionById(workspaceId, id);
          if (row) {
            await recordFinancialTransactionRestSyncEvent(
              workspaceId,
              row,
              "upsert",
            );
          }
        }
      }
    }
  }

  const lastSyncedAt = new Date().toISOString();
  return {
    bankAccountId,
    fetched,
    inserted,
    duplicates,
    lastSyncedAt,
  };
}
