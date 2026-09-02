import { and, eq, inArray, isNull } from "drizzle-orm";

import type { MoneybirdBankAccountSyncResult } from "@backsteros/contracts";

import { db } from "../../db/index.js";
import { bankAccounts, financialTransactions } from "../../db/schema.js";
import {
  MoneybirdApiError,
  MoneybirdClient,
} from "../../lib/moneybird-client.js";
import { newId } from "../../lib/crypto.js";
import { getMoneybirdCredentials } from "../moneybird-settings.js";
import { getBankAccountById } from "./finance.js";
import { mapMoneybirdMutationToLedgerRow } from "./moneybird-sync-map.js";

export {
  mapMoneybirdMutationToLedgerRow,
  moneybirdMutationFingerprint,
  parseMoneybirdAmountToCents,
} from "./moneybird-sync-map.js";

const MUTATION_FETCH_CHUNK = 100;

function defaultMoneybirdSyncPeriod(now = new Date()): string {
  const year = now.getFullYear();
  return `${year - 2}0101..${year}1231`;
}

function chunkIds<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function syncBankAccountFromMoneybird(
  workspaceId: string,
  bankAccountId: string,
  options?: { period?: string },
): Promise<MoneybirdBankAccountSyncResult | null> {
  const account = await getBankAccountById(workspaceId, bankAccountId);
  if (!account) return null;

  const moneybirdFinancialAccountId =
    account.moneybirdFinancialAccountId?.trim() || null;
  if (!moneybirdFinancialAccountId) {
    throw new MoneybirdApiError(
      400,
      "",
      "Bank account is not linked to a Moneybird financial account",
    );
  }

  const { apiToken, administrationId } =
    await getMoneybirdCredentials(workspaceId);
  if (!apiToken) {
    throw new MoneybirdApiError(
      400,
      "",
      "Moneybird API token is not configured",
    );
  }
  if (!administrationId) {
    throw new MoneybirdApiError(
      400,
      "",
      "Moneybird administration id is not configured",
    );
  }

  const client = new MoneybirdClient({ apiToken, administrationId });
  const period = options?.period?.trim() || defaultMoneybirdSyncPeriod();
  const syncIds = await client.listFinancialMutationSyncIds({
    financialAccountId: moneybirdFinancialAccountId,
    period,
    state: "all",
  });
  const remoteIds = syncIds.map((row) => row.id);
  const fetched = remoteIds.length;

  if (fetched === 0) {
    const lastSyncedAt = new Date();
    await db
      .update(bankAccounts)
      .set({ moneybirdLastSyncedAt: lastSyncedAt, updatedAt: lastSyncedAt })
      .where(
        and(
          eq(bankAccounts.workspaceId, workspaceId),
          eq(bankAccounts.id, bankAccountId),
          isNull(bankAccounts.deletedAt),
        ),
      );
    return {
      bankAccountId,
      moneybirdFinancialAccountId,
      fetched: 0,
      inserted: 0,
      duplicates: 0,
      lastSyncedAt: lastSyncedAt.toISOString(),
    };
  }

  const existing = await db
    .select({ externalId: financialTransactions.externalId })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.workspaceId, workspaceId),
        eq(financialTransactions.bankAccountId, bankAccountId),
        inArray(financialTransactions.externalId, remoteIds),
      ),
    );
  const existingIds = new Set(
    existing
      .map((row) => row.externalId)
      .filter((id): id is string => Boolean(id)),
  );
  const missingIds = remoteIds.filter((id) => !existingIds.has(id));
  const duplicates = fetched - missingIds.length;

  let inserted = 0;
  for (const idChunk of chunkIds(missingIds, MUTATION_FETCH_CHUNK)) {
    const mutations = await client.fetchFinancialMutationsByIds(idChunk);
    for (const mutation of mutations) {
      if (existingIds.has(mutation.id)) continue;
      if (
        mutation.financialAccountId &&
        mutation.financialAccountId !== moneybirdFinancialAccountId
      ) {
        continue;
      }
      const ledger = mapMoneybirdMutationToLedgerRow(mutation, account.type);
      const result = await db
        .insert(financialTransactions)
        .values({
          id: newId(),
          workspaceId,
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
          raw: ledger.raw,
        })
        .onConflictDoNothing({
          target: [
            financialTransactions.bankAccountId,
            financialTransactions.fingerprint,
          ],
        })
        .returning({ id: financialTransactions.id });
      if (result.length > 0) {
        inserted++;
        existingIds.add(mutation.id);
      }
    }
  }

  const lastSyncedAt = new Date();
  await db
    .update(bankAccounts)
    .set({ moneybirdLastSyncedAt: lastSyncedAt, updatedAt: lastSyncedAt })
    .where(
      and(
        eq(bankAccounts.workspaceId, workspaceId),
        eq(bankAccounts.id, bankAccountId),
        isNull(bankAccounts.deletedAt),
      ),
    );

  return {
    bankAccountId,
    moneybirdFinancialAccountId,
    fetched,
    inserted,
    duplicates: duplicates + (missingIds.length - inserted),
    lastSyncedAt: lastSyncedAt.toISOString(),
  };
}
