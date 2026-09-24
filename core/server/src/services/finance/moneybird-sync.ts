import { and, eq, isNull } from "drizzle-orm";

import type { MoneybirdBankAccountSyncResult } from "@backsteros/contracts";
import { isBalanceAffectingFinancialSettlement } from "@backsteros/contracts";

import { db } from "../../db/index.js";
import { bankAccounts, financialTransactions } from "../../db/schema.js";
import {
  MoneybirdApiError,
  MoneybirdClient,
  type MoneybirdFinancialMutation,
} from "../../lib/moneybird-client.js";
import { newId } from "../../lib/crypto.js";
import { getMoneybirdCredentials } from "../moneybird-settings.js";
import {
  getBankAccountById,
  commitFinancialTransactionCreates,
  commitFinancialTransactionDeletes,
  commitFinancialTransactionLedgerRefreshes,
} from "./finance.js";
import type { FinancialTransactionSyncCreateInput } from "./finance.js";
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

/** Parse Moneybird `YYYYMMDD..YYYYMMDD` period into ISO dates. */
export function parseMoneybirdPeriodBounds(
  period: string,
): { from: string; to: string } | null {
  const m = period.trim().match(/^(\d{8})\.\.(\d{8})$/);
  if (!m) return null;
  const toIso = (raw: string) =>
    `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return { from: toIso(m[1]), to: toIso(m[2]) };
}

function localMoneybirdVersion(raw: unknown): number | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const versionRaw = (raw as Record<string, unknown>).version;
  if (typeof versionRaw === "number" && Number.isFinite(versionRaw)) {
    return versionRaw;
  }
  if (typeof versionRaw === "string" && versionRaw.trim()) {
    const n = Number(versionRaw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function moneybirdLedgerAlignmentFingerprint(
  moneybirdFinancialAccountId: string,
): string {
  return `moneybird:ledger-alignment:${moneybirdFinancialAccountId}`;
}

async function fetchMoneybirdReportedBalanceCents(
  client: MoneybirdClient,
  moneybirdFinancialAccountId: string,
): Promise<number | null> {
  const ledgerAccounts = await client.listLedgerAccounts({
    stopWhenFinancialAccountId: moneybirdFinancialAccountId,
  });
  const ledger = ledgerAccounts.find(
    (row) => row.financialAccountId === moneybirdFinancialAccountId,
  );
  if (!ledger) return null;
  const values = await client.getBalanceSheetLedgerValues({
    period: "this_year",
  });
  return values.get(ledger.id) ?? null;
}

function mutationSumCents(
  mutations: MoneybirdFinancialMutation[],
  accountType: string | null | undefined,
): number {
  let sum = 0;
  for (const mutation of mutations) {
    const ledger = mapMoneybirdMutationToLedgerRow(mutation, accountType);
    if (!isBalanceAffectingFinancialSettlement(ledger.settlementState)) {
      continue;
    }
    sum += ledger.amountCents;
  }
  return sum;
}

async function upsertLedgerAlignmentRow(options: {
  workspaceId: string;
  bankAccountId: string;
  moneybirdFinancialAccountId: string;
  alignmentCents: number;
  reportedBalanceCents: number;
}): Promise<"inserted" | "updated" | "unchanged" | "removed"> {
  const {
    workspaceId,
    bankAccountId,
    moneybirdFinancialAccountId,
    alignmentCents,
    reportedBalanceCents,
  } = options;
  const fingerprint = moneybirdLedgerAlignmentFingerprint(
    moneybirdFinancialAccountId,
  );
  const [existing] = await db
    .select({
      id: financialTransactions.id,
      amountCents: financialTransactions.amountCents,
    })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.workspaceId, workspaceId),
        eq(financialTransactions.bankAccountId, bankAccountId),
        eq(financialTransactions.fingerprint, fingerprint),
      ),
    )
    .limit(1);

  if (alignmentCents === 0) {
    if (existing) {
      await commitFinancialTransactionDeletes(workspaceId, [existing.id]);
      return "removed";
    }
    return "unchanged";
  }

  const bookedOn = new Date().toISOString().slice(0, 10);
  const row: { id: string } & FinancialTransactionSyncCreateInput = {
    id: existing?.id ?? newId(),
    bankAccountId,
    bookedOn,
    amountCents: alignmentCents,
    currency: "EUR",
    payee: "Moneybird",
    counterparty: null,
    memo: "Ledger balance alignment",
    balanceAfterCents: null,
    externalId: `moneybird-ledger-alignment:${moneybirdFinancialAccountId}`,
    fingerprint,
    sourceCode: "moneybird",
    sourceType: "ledger_alignment",
    settlementState: "settled",
    raw: {
      moneybird_ledger_alignment: true,
      moneybird_financial_account_id: moneybirdFinancialAccountId,
      reported_balance_cents: reportedBalanceCents,
    },
  };

  if (existing) {
    if (existing.amountCents === alignmentCents) return "unchanged";
    await commitFinancialTransactionLedgerRefreshes(workspaceId, [row]);
    return "updated";
  }
  await commitFinancialTransactionCreates(workspaceId, [row]);
  return "inserted";
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
  const periodBounds = parseMoneybirdPeriodBounds(period);
  const syncIds = await client.listFinancialMutationSyncIds({
    financialAccountId: moneybirdFinancialAccountId,
    period,
    state: "all",
  });
  const remoteById = new Map(syncIds.map((row) => [row.id, row]));
  const remoteIds = [...remoteById.keys()];
  const fetched = remoteIds.length;

  const alignmentFingerprint = moneybirdLedgerAlignmentFingerprint(
    moneybirdFinancialAccountId,
  );

  const localRows = await db
    .select({
      id: financialTransactions.id,
      externalId: financialTransactions.externalId,
      raw: financialTransactions.raw,
      fingerprint: financialTransactions.fingerprint,
      bookedOn: financialTransactions.bookedOn,
    })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.workspaceId, workspaceId),
        eq(financialTransactions.bankAccountId, bankAccountId),
        eq(financialTransactions.sourceCode, "moneybird"),
      ),
    );

  const localByExternalId = new Map<
    string,
    { id: string; version: number | null }
  >();
  for (const row of localRows) {
    if (row.fingerprint === alignmentFingerprint) continue;
    if (!row.externalId) continue;
    localByExternalId.set(row.externalId, {
      id: row.id,
      version: localMoneybirdVersion(row.raw),
    });
  }

  const missingIds: string[] = [];
  const staleIds: string[] = [];
  const unchangedIds: string[] = [];
  for (const [id, remote] of remoteById) {
    const local = localByExternalId.get(id);
    if (!local) {
      missingIds.push(id);
      continue;
    }
    const remoteVersion = remote.version;
    if (
      remoteVersion == null ||
      local.version == null ||
      remoteVersion > local.version
    ) {
      staleIds.push(id);
    } else {
      unchangedIds.push(id);
    }
  }

  // Orphans: Moneybird dropped the mutation (common for card authorisations that
  // settle under a new id). Only remove rows whose booked_on falls inside the
  // sync period so wider history outside the filter is kept.
  const orphanIds: string[] = [];
  for (const row of localRows) {
    if (row.fingerprint === alignmentFingerprint) continue;
    if (!row.externalId) continue;
    if (remoteById.has(row.externalId)) continue;
    if (periodBounds) {
      if (row.bookedOn < periodBounds.from || row.bookedOn > periodBounds.to) {
        continue;
      }
    }
    orphanIds.push(row.id);
  }

  let inserted = 0;
  let updated = 0;
  let removed = 0;
  let duplicates = 0;

  if (orphanIds.length > 0) {
    removed = await commitFinancialTransactionDeletes(workspaceId, orphanIds);
  }

  // Fetch every remote mutation so we can refresh stale rows and compute the
  // mutation sum for Moneybird ledger alignment (balance-sheet vs mutations).
  const allMutations: MoneybirdFinancialMutation[] = [];
  for (const idChunk of chunkIds(remoteIds, MUTATION_FETCH_CHUNK)) {
    const mutations = await client.fetchFinancialMutationsByIds(idChunk);
    allMutations.push(...mutations);
  }

  const pendingInserts: Array<
    { id: string } & FinancialTransactionSyncCreateInput
  > = [];
  const pendingUpdates: Array<
    { id: string } & FinancialTransactionSyncCreateInput
  > = [];

  const refreshIdSet = new Set([...missingIds, ...staleIds]);
  for (const mutation of allMutations) {
    if (
      mutation.financialAccountId &&
      mutation.financialAccountId !== moneybirdFinancialAccountId
    ) {
      continue;
    }
    if (!refreshIdSet.has(mutation.id)) continue;
    const ledger = mapMoneybirdMutationToLedgerRow(mutation, account.type);
    const local = localByExternalId.get(mutation.id);
    const input: FinancialTransactionSyncCreateInput = {
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
    };
    if (local) {
      pendingUpdates.push({ id: local.id, ...input });
    } else {
      pendingInserts.push({ id: newId(), ...input });
    }
  }

  if (pendingInserts.length > 0) {
    inserted = await commitFinancialTransactionCreates(
      workspaceId,
      pendingInserts,
    );
    duplicates += pendingInserts.length - inserted;
  }
  if (pendingUpdates.length > 0) {
    updated = await commitFinancialTransactionLedgerRefreshes(
      workspaceId,
      pendingUpdates,
    );
  }

  duplicates += unchangedIds.length;

  // Align displayed balance to Moneybird's balance-sheet saldo when it differs
  // from the mutation sum (provider interest / opening differences).
  // Skip liability accounts — polarity / reporting differs from cash ledgers.
  try {
    if (account.type !== "credit_card") {
      const reported = await fetchMoneybirdReportedBalanceCents(
        client,
        moneybirdFinancialAccountId,
      );
      if (reported != null) {
        const mutationTotal = mutationSumCents(allMutations, account.type);
        const alignmentCents = reported - mutationTotal;
        const alignment = await upsertLedgerAlignmentRow({
          workspaceId,
          bankAccountId,
          moneybirdFinancialAccountId,
          alignmentCents,
          reportedBalanceCents: reported,
        });
        if (alignment === "inserted") inserted += 1;
        if (alignment === "updated") updated += 1;
        if (alignment === "removed") removed += 1;
      }
    }
  } catch (err) {
    console.warn(
      "[moneybird-sync] ledger balance alignment skipped:",
      err instanceof Error ? err.message : err,
    );
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
    updated,
    removed,
    duplicates,
    lastSyncedAt: lastSyncedAt.toISOString(),
  };
}
