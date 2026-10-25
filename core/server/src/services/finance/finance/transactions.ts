import {
  and,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type {
  FinancialAmountSign,
  FinancialImportResult,
  UpdateFinancialTransactionInput,
} from "@backsteros/contracts";

import { accountsConflict, type DbExecutor, getBankAccountById } from "./catalog.js";
import { db } from "../../../db/index.js";
import {
  type DbFinancialTransaction,
  financialImportBatches,
  financialTransactions,
} from "../../../db/schema.js";
import { parseBankCsv } from "../detect-dialect.js";
import { newId } from "../../../lib/crypto.js";
import { buildPrivateStorageKey, putObject } from "../../../lib/storage.js";
import { toCashflowAmountCents } from "../ledger-polarity.js";
export async function listImportBatches(workspaceId: string, bankAccountId: string) {
  const account = await getBankAccountById(workspaceId, bankAccountId);
  if (!account) return null;
  const rows = await db
    .select()
    .from(financialImportBatches)
    .where(
      and(
        eq(financialImportBatches.workspaceId, workspaceId),
        eq(financialImportBatches.bankAccountId, bankAccountId),
      ),
    )
    .orderBy(desc(financialImportBatches.createdAt))
    .limit(50);
  return rows;
}

export type ListTransactionsFilters = {
  q?: string;
  from?: string;
  to?: string;
  month?: string;
  organizationId?: string;
  projectId?: string;
  categoryId?: string;
  goalId?: string;
  recurringId?: string;
  /** Multi-select category filter (OR). */
  categoryIds?: string[];
  uncategorized?: boolean;
  unassignedOrg?: boolean;
  unassignedGoal?: boolean;
  unassignedRecurring?: boolean;
  amountSign?: FinancialAmountSign;
  limit?: number;
  cursor?: string;
  /** When true, also return the full matching row count (ignores cursor). */
  includeTotal?: boolean;
};

function decodeCursor(
  cursor: string | undefined,
): { bookedOn: string; id: string } | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { bookedOn?: string; id?: string };
    if (
      typeof parsed.bookedOn === "string" &&
      typeof parsed.id === "string"
    ) {
      return { bookedOn: parsed.bookedOn, id: parsed.id };
    }
  } catch {
    return null;
  }
  return null;
}

function encodeCursor(row: { bookedOn: string; id: string }): string {
  return Buffer.from(
    JSON.stringify({ bookedOn: row.bookedOn, id: row.id }),
    "utf8",
  ).toString("base64url");
}

function buildListTransactionFilterConditions(
  workspaceId: string,
  bankAccountId: string | null,
  filters: ListTransactionsFilters,
) {
  const conditions = [
    eq(financialTransactions.workspaceId, workspaceId),
    ...(bankAccountId
      ? [eq(financialTransactions.bankAccountId, bankAccountId)]
      : []),
  ];

  if (filters.month) {
    const [y, m] = filters.month.split("-");
    const start = `${y}-${m}-01`;
    const endMonth = Number(m);
    const endYear = Number(y) + (endMonth === 12 ? 1 : 0);
    const endM = endMonth === 12 ? 1 : endMonth + 1;
    const end = `${String(endYear).padStart(4, "0")}-${String(endM).padStart(2, "0")}-01`;
    conditions.push(gte(financialTransactions.bookedOn, start));
    conditions.push(lt(financialTransactions.bookedOn, end));
  }
  if (filters.from) {
    conditions.push(gte(financialTransactions.bookedOn, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(financialTransactions.bookedOn, filters.to));
  }
  if (filters.organizationId) {
    conditions.push(
      eq(financialTransactions.organizationId, filters.organizationId),
    );
  }
  if (filters.projectId) {
    conditions.push(eq(financialTransactions.projectId, filters.projectId));
  }
  if (filters.goalId) {
    conditions.push(eq(financialTransactions.goalId, filters.goalId));
  }
  if (filters.recurringId) {
    conditions.push(eq(financialTransactions.recurringId, filters.recurringId));
  }
  {
    const categoryIds = [
      ...new Set(
        [
          ...(filters.categoryIds ?? []),
          ...(filters.categoryId ? [filters.categoryId] : []),
        ].filter((id) => id.trim().length > 0),
      ),
    ];
    const categoryMatchers = [
      ...(categoryIds.length > 0
        ? [inArray(financialTransactions.categoryId, categoryIds)]
        : []),
      ...(filters.uncategorized
        ? [isNull(financialTransactions.categoryId)]
        : []),
    ];
    if (categoryMatchers.length === 1) {
      conditions.push(categoryMatchers[0]!);
    } else if (categoryMatchers.length > 1) {
      conditions.push(or(...categoryMatchers)!);
    }
  }
  if (filters.unassignedOrg) {
    conditions.push(isNull(financialTransactions.organizationId));
  }
  if (filters.unassignedGoal) {
    conditions.push(isNull(financialTransactions.goalId));
  }
  if (filters.unassignedRecurring) {
    conditions.push(isNull(financialTransactions.recurringId));
  }
  if (filters.amountSign === "debit") {
    conditions.push(lt(financialTransactions.amountCents, 0));
  } else if (filters.amountSign === "credit") {
    conditions.push(gt(financialTransactions.amountCents, 0));
  }
  if (filters.q?.trim()) {
    const pattern = `%${filters.q.trim()}%`;
    conditions.push(
      or(
        ilike(financialTransactions.payee, pattern),
        ilike(financialTransactions.counterparty, pattern),
        ilike(financialTransactions.memo, pattern),
        ilike(financialTransactions.notes, pattern),
        ilike(financialTransactions.displayName, pattern),
      )!,
    );
  }

  return conditions;
}

export async function listTransactions(
  workspaceId: string,
  bankAccountId: string | null,
  filters: ListTransactionsFilters = {},
): Promise<{
  transactions: DbFinancialTransaction[];
  nextCursor: string | null;
  total?: number;
} | null> {
  if (bankAccountId) {
    const account = await getBankAccountById(workspaceId, bankAccountId);
    if (!account) return null;
  }

  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const filterConditions = buildListTransactionFilterConditions(
    workspaceId,
    bankAccountId,
    filters,
  );
  const pageConditions = [...filterConditions];

  const cursor = decodeCursor(filters.cursor);
  if (cursor) {
    pageConditions.push(
      sql`(${financialTransactions.bookedOn}, ${financialTransactions.id}) < (${cursor.bookedOn}::date, ${cursor.id})`,
    );
  }

  const rowsPromise = db
    .select()
    .from(financialTransactions)
    .where(and(...pageConditions))
    .orderBy(
      desc(financialTransactions.bookedOn),
      desc(financialTransactions.id),
    )
    .limit(limit + 1);

  const totalPromise = filters.includeTotal
    ? db
        .select({
          value: sql<number>`count(*)::int`,
        })
        .from(financialTransactions)
        .where(and(...filterConditions))
        .then((rows) => Number(rows[0]?.value ?? 0))
    : Promise.resolve(undefined);

  const [rows, total] = await Promise.all([rowsPromise, totalPromise]);

  const page = rows.slice(0, limit);
  const next =
    rows.length > limit
      ? encodeCursor({
          bookedOn: page[page.length - 1]!.bookedOn,
          id: page[page.length - 1]!.id,
        })
      : null;

  return {
    transactions: page,
    nextCursor: next,
    ...(total !== undefined ? { total } : {}),
  };
}

export async function getTransactionById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.workspaceId, workspaceId),
        eq(financialTransactions.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type FinancialTransactionSyncCreateInput = {
  bankAccountId: string;
  bookedOn: string;
  amountCents: number;
  currency?: string;
  payee?: string;
  counterparty?: string | null;
  memo?: string | null;
  balanceAfterCents?: number | null;
  externalId?: string | null;
  fingerprint: string;
  sourceCode?: string | null;
  sourceType?: string | null;
  settlementState?: string | null;
  raw?: unknown;
  /** Always ignored on sync create — import batches are local-only. */
  importBatchId?: string | null;
};

function asSyncString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asSyncNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asSyncNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function asSyncNullableNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Insert a ledger row from sync / leader-first (idempotent on fingerprint). */
export async function insertTransactionFromSync(
  workspaceId: string,
  id: string,
  payload: Record<string, unknown>,
  executor: DbExecutor = db,
): Promise<DbFinancialTransaction | null> {
  const bankAccountId = asSyncString(payload.bankAccountId)?.trim();
  const bookedOn = asSyncString(payload.bookedOn)?.trim();
  const fingerprint = asSyncString(payload.fingerprint)?.trim();
  const amountCents = asSyncNumber(payload.amountCents);
  if (!bankAccountId || !bookedOn || !fingerprint || amountCents === undefined) {
    return null;
  }
  const account = await getBankAccountById(workspaceId, bankAccountId, executor);
  if (!account) return null;

  const currency = asSyncString(payload.currency)?.trim() || "EUR";
  const payee = asSyncString(payload.payee) ?? "";
  const counterparty = asSyncNullableString(payload.counterparty) ?? null;
  const memo = asSyncNullableString(payload.memo) ?? null;
  const balanceAfterCents =
    asSyncNullableNumber(payload.balanceAfterCents) ?? null;
  const externalId = asSyncNullableString(payload.externalId) ?? null;
  const sourceCode = asSyncNullableString(payload.sourceCode) ?? null;
  const sourceType = asSyncNullableString(payload.sourceType) ?? null;
  const settlementState = asSyncNullableString(payload.settlementState) ?? null;
  const raw =
    payload.raw && typeof payload.raw === "object" && !Array.isArray(payload.raw)
      ? payload.raw
      : {};

  try {
    const inserted = await executor
      .insert(financialTransactions)
      .values({
        id,
        workspaceId,
        bankAccountId,
        importBatchId: null,
        bookedOn,
        amountCents,
        currency,
        payee,
        counterparty,
        memo,
        balanceAfterCents,
        externalId,
        fingerprint,
        sourceCode,
        sourceType,
        settlementState,
        raw,
      })
      .onConflictDoNothing({
        target: [
          financialTransactions.bankAccountId,
          financialTransactions.fingerprint,
        ],
      })
      .returning();
    if (inserted[0]) return inserted[0];
  } catch {
    // external_id unique or PK replay — fall through to lookup
  }

  const byId = await getTransactionById(workspaceId, id, executor);
  if (byId) return byId;

  const [byFingerprint] = await executor
    .select()
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.workspaceId, workspaceId),
        eq(financialTransactions.bankAccountId, bankAccountId),
        eq(financialTransactions.fingerprint, fingerprint),
      ),
    )
    .limit(1);
  return byFingerprint ?? null;
}

export function financialTransactionCreateSyncPayload(
  id: string,
  input: FinancialTransactionSyncCreateInput,
): Record<string, unknown> {
  return {
    id,
    bank_account_id: input.bankAccountId,
    booked_on: input.bookedOn,
    amount_cents: input.amountCents,
    currency: input.currency ?? "EUR",
    payee: input.payee ?? "",
    counterparty: input.counterparty ?? null,
    memo: input.memo ?? null,
    balance_after_cents: input.balanceAfterCents ?? null,
    external_id: input.externalId ?? null,
    fingerprint: input.fingerprint,
    source_code: input.sourceCode ?? null,
    source_type: input.sourceType ?? null,
    settlement_state: input.settlementState ?? null,
    raw: input.raw ?? {},
    import_batch_id: null,
  };
}

const FINANCIAL_TX_LEADER_CHUNK = 40;

/**
 * Persist new ledger rows leader-first when hybrid; otherwise insert + sync_events.
 * Returns how many rows were newly inserted (best-effort when forwarding).
 */
export async function commitFinancialTransactionCreates(
  workspaceId: string,
  rows: Array<{ id: string } & FinancialTransactionSyncCreateInput>,
): Promise<number> {
  if (rows.length === 0) return 0;

  const { shouldForwardMutationsToLeader } = await import(
    "../../core-replication/leader-mutations.js"
  );
  if (shouldForwardMutationsToLeader()) {
    const { commitRestEntityWriteBatch } = await import(
      "../../rest-leader-write.js"
    );
    for (let i = 0; i < rows.length; i += FINANCIAL_TX_LEADER_CHUNK) {
      const chunk = rows.slice(i, i + FINANCIAL_TX_LEADER_CHUNK);
      await commitRestEntityWriteBatch({
        workspaceId,
        changes: chunk.map((row) => ({
          entity: "financial_transaction" as const,
          entityId: row.id,
          operation: "upsert" as const,
          payload: financialTransactionCreateSyncPayload(row.id, row),
        })),
      });
    }
    let inserted = 0;
    for (const row of rows) {
      const found = await getTransactionById(workspaceId, row.id);
      if (found) inserted += 1;
    }
    return inserted;
  }

  const { recordFinancialTransactionRestSyncEvent } = await import(
    "../../sync.js"
  );
  let inserted = 0;
  for (const row of rows) {
    const created = await insertTransactionFromSync(
      workspaceId,
      row.id,
      {
        bankAccountId: row.bankAccountId,
        bookedOn: row.bookedOn,
        amountCents: row.amountCents,
        currency: row.currency,
        payee: row.payee,
        counterparty: row.counterparty,
        memo: row.memo,
        balanceAfterCents: row.balanceAfterCents,
        externalId: row.externalId,
        fingerprint: row.fingerprint,
        sourceCode: row.sourceCode,
        sourceType: row.sourceType,
        settlementState: row.settlementState,
        raw: row.raw,
      },
    );
    if (created && created.id === row.id) {
      inserted += 1;
      await recordFinancialTransactionRestSyncEvent(
        workspaceId,
        created,
        "upsert",
      );
    }
  }
  return inserted;
}

/**
 * Refresh Moneybird-owned ledger columns on existing rows (amount / settlement /
 * payee / raw version). Preserves user classification fields.
 */
export async function refreshTransactionLedgerFromSync(
  workspaceId: string,
  id: string,
  payload: Record<string, unknown>,
  executor: DbExecutor = db,
): Promise<DbFinancialTransaction | null> {
  const bookedOn = asSyncString(payload.bookedOn)?.trim();
  const amountCents = asSyncNumber(payload.amountCents);
  if (!bookedOn || amountCents === undefined) return null;

  const currency = asSyncString(payload.currency)?.trim() || "EUR";
  const payee = asSyncString(payload.payee) ?? "";
  const counterparty = asSyncNullableString(payload.counterparty);
  const memo = asSyncNullableString(payload.memo);
  const sourceType = asSyncNullableString(payload.sourceType);
  const settlementState = asSyncNullableString(payload.settlementState);
  const raw =
    payload.raw && typeof payload.raw === "object" && !Array.isArray(payload.raw)
      ? payload.raw
      : undefined;

  const [row] = await executor
    .update(financialTransactions)
    .set({
      bookedOn,
      amountCents,
      currency,
      payee,
      ...(counterparty !== undefined ? { counterparty } : {}),
      ...(memo !== undefined ? { memo } : {}),
      ...(sourceType !== undefined ? { sourceType } : {}),
      ...(settlementState !== undefined ? { settlementState } : {}),
      ...(raw !== undefined ? { raw } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(financialTransactions.workspaceId, workspaceId),
        eq(financialTransactions.id, id),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Leader-first refresh of Moneybird ledger fields on existing transaction ids.
 */
export async function commitFinancialTransactionLedgerRefreshes(
  workspaceId: string,
  rows: Array<{ id: string } & FinancialTransactionSyncCreateInput>,
): Promise<number> {
  if (rows.length === 0) return 0;

  const { shouldForwardMutationsToLeader } = await import(
    "../../core-replication/leader-mutations.js"
  );
  if (shouldForwardMutationsToLeader()) {
    const { commitRestEntityWriteBatch } = await import(
      "../../rest-leader-write.js"
    );
    for (let i = 0; i < rows.length; i += FINANCIAL_TX_LEADER_CHUNK) {
      const chunk = rows.slice(i, i + FINANCIAL_TX_LEADER_CHUNK);
      await commitRestEntityWriteBatch({
        workspaceId,
        changes: chunk.map((row) => ({
          entity: "financial_transaction" as const,
          entityId: row.id,
          operation: "upsert" as const,
          payload: {
            ...financialTransactionCreateSyncPayload(row.id, row),
            moneybird_ledger_refresh: true,
          },
        })),
      });
    }
    let updated = 0;
    for (const row of rows) {
      const found = await getTransactionById(workspaceId, row.id);
      if (found) updated += 1;
    }
    return updated;
  }

  const { recordFinancialTransactionRestSyncEvent } = await import(
    "../../sync.js"
  );
  let updated = 0;
  for (const row of rows) {
    const refreshed = await refreshTransactionLedgerFromSync(workspaceId, row.id, {
      bookedOn: row.bookedOn,
      amountCents: row.amountCents,
      currency: row.currency,
      payee: row.payee,
      counterparty: row.counterparty,
      memo: row.memo,
      sourceType: row.sourceType,
      settlementState: row.settlementState,
      raw: row.raw,
    });
    if (refreshed) {
      updated += 1;
      await recordFinancialTransactionRestSyncEvent(
        workspaceId,
        refreshed,
        "upsert",
      );
    }
  }
  return updated;
}

/**
 * Leader-first hard-delete of ledger rows (Moneybird sync orphans).
 */
export async function commitFinancialTransactionDeletes(
  workspaceId: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;

  const { shouldForwardMutationsToLeader } = await import(
    "../../core-replication/leader-mutations.js"
  );
  if (shouldForwardMutationsToLeader()) {
    const existing = await Promise.all(
      ids.map((id) => getTransactionById(workspaceId, id)),
    );
    const toDelete = existing.filter(
      (row): row is DbFinancialTransaction => row != null,
    );
    if (toDelete.length === 0) return 0;
    const { commitRestEntityWriteBatch } = await import(
      "../../rest-leader-write.js"
    );
    for (let i = 0; i < toDelete.length; i += FINANCIAL_TX_LEADER_CHUNK) {
      const chunk = toDelete.slice(i, i + FINANCIAL_TX_LEADER_CHUNK);
      await commitRestEntityWriteBatch({
        workspaceId,
        changes: chunk.map((row) => ({
          entity: "financial_transaction" as const,
          entityId: row.id,
          operation: "delete" as const,
          payload: { id: row.id },
        })),
      });
    }
    return toDelete.length;
  }

  const { recordFinancialTransactionRestSyncEvent } = await import(
    "../../sync.js"
  );
  const before = await Promise.all(
    ids.map((id) => getTransactionById(workspaceId, id)),
  );
  const deleted = await batchDeleteTransactions(workspaceId, ids);
  for (const row of before) {
    if (row) {
      await recordFinancialTransactionRestSyncEvent(
        workspaceId,
        row,
        "delete",
      );
    }
  }
  return deleted;
}

async function resolveBankAccountPatch(
  workspaceId: string,
  bankAccountId: string | undefined,
  executor: DbExecutor = db,
): Promise<{ ok: true; bankAccountId?: string } | { ok: false }> {
  if (bankAccountId === undefined) return { ok: true };
  const account = await getBankAccountById(workspaceId, bankAccountId, executor);
  if (!account) return { ok: false };
  return { ok: true, bankAccountId: account.id };
}

export async function updateTransaction(
  workspaceId: string,
  id: string,
  patch: UpdateFinancialTransactionInput,
  executor: DbExecutor = db,
): Promise<DbFinancialTransaction | null | "account_not_found"> {
  const accountPatch = await resolveBankAccountPatch(
    workspaceId,
    patch.bankAccountId,
    executor,
  );
  if (!accountPatch.ok) return "account_not_found";

  const [row] = await executor
    .update(financialTransactions)
    .set({
      ...(accountPatch.bankAccountId !== undefined
        ? { bankAccountId: accountPatch.bankAccountId }
        : {}),
      ...(patch.organizationId !== undefined
        ? { organizationId: patch.organizationId }
        : {}),
      ...(patch.projectId !== undefined ? { projectId: patch.projectId } : {}),
      ...(patch.categoryId !== undefined
        ? { categoryId: patch.categoryId }
        : {}),
      ...(patch.goalId !== undefined ? { goalId: patch.goalId } : {}),
      ...(patch.recurringId !== undefined
        ? { recurringId: patch.recurringId }
        : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.displayName !== undefined
        ? { displayName: patch.displayName }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(financialTransactions.workspaceId, workspaceId),
        eq(financialTransactions.id, id),
      ),
    )
    .returning();
  return row ?? null;
}

export async function batchUpdateTransactions(
  workspaceId: string,
  ids: string[],
  patch: UpdateFinancialTransactionInput,
  executor: DbExecutor = db,
): Promise<DbFinancialTransaction[] | "account_not_found"> {
  if (ids.length === 0) return [];
  const accountPatch = await resolveBankAccountPatch(
    workspaceId,
    patch.bankAccountId,
    executor,
  );
  if (!accountPatch.ok) return "account_not_found";

  const rows = await executor
    .update(financialTransactions)
    .set({
      ...(accountPatch.bankAccountId !== undefined
        ? { bankAccountId: accountPatch.bankAccountId }
        : {}),
      ...(patch.organizationId !== undefined
        ? { organizationId: patch.organizationId }
        : {}),
      ...(patch.projectId !== undefined ? { projectId: patch.projectId } : {}),
      ...(patch.categoryId !== undefined
        ? { categoryId: patch.categoryId }
        : {}),
      ...(patch.goalId !== undefined ? { goalId: patch.goalId } : {}),
      ...(patch.recurringId !== undefined
        ? { recurringId: patch.recurringId }
        : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.displayName !== undefined
        ? { displayName: patch.displayName }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(financialTransactions.workspaceId, workspaceId),
        inArray(financialTransactions.id, ids),
      ),
    )
    .returning();
  return rows;
}

export async function batchDeleteTransactions(
  workspaceId: string,
  ids: string[],
  executor: DbExecutor = db,
): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await executor
    .delete(financialTransactions)
    .where(
      and(
        eq(financialTransactions.workspaceId, workspaceId),
        inArray(financialTransactions.id, ids),
      ),
    )
    .returning({ id: financialTransactions.id });
  return rows.length;
}

export async function importBankCsv(
  workspaceId: string,
  bankAccountId: string,
  bytes: Uint8Array,
  fileName: string,
): Promise<FinancialImportResult | null> {
  const account = await getBankAccountById(workspaceId, bankAccountId);
  if (!account) return null;

  const text = Buffer.from(bytes).toString("utf8");
  const parsed = parseBankCsv(text);
  const batchId = newId();
  const storageKey = buildPrivateStorageKey(
    workspaceId,
    "finance-imports",
    bankAccountId,
    `${batchId}-${fileName || "import.csv"}`,
  );
  await putObject(storageKey, bytes, "text/csv; charset=utf-8");

  let inserted = 0;
  let duplicates = 0;
  let errors = parsed.errors.length;
  let skippedAccountMismatch = 0;

  await db.insert(financialImportBatches).values({
    id: batchId,
    workspaceId,
    bankAccountId,
    originalFilename: fileName || "import.csv",
    storageKey,
    dialect: parsed.dialect,
    rowCount: parsed.rows.length,
    insertedCount: 0,
    duplicateCount: 0,
    errorCount: errors,
  });

  const pending: Array<
    { id: string } & FinancialTransactionSyncCreateInput
  > = [];

  const existingFingerprints = new Set(
    (
      await db
        .select({ fingerprint: financialTransactions.fingerprint })
        .from(financialTransactions)
        .where(
          and(
            eq(financialTransactions.workspaceId, workspaceId),
            eq(financialTransactions.bankAccountId, bankAccountId),
          ),
        )
    ).map((row) => row.fingerprint),
  );

  for (const row of parsed.rows) {
    if (accountsConflict(account.ibanOrMask, row.sourceAccount)) {
      skippedAccountMismatch++;
      continue;
    }
    try {
      if (existingFingerprints.has(row.fingerprint)) {
        duplicates++;
        continue;
      }
      const id = newId();
      // Fingerprint stays source-polarity (from the parser) so re-imports dedupe;
      // stored amount uses cashflow polarity for credit_card accounts.
      const amountCents = toCashflowAmountCents(row.amountCents, account.type);
      const balanceAfterCents =
        row.balanceAfterCents == null
          ? null
          : toCashflowAmountCents(row.balanceAfterCents, account.type);
      pending.push({
        id,
        bankAccountId,
        bookedOn: row.bookedOn,
        amountCents,
        currency: row.currency,
        payee: row.payee,
        counterparty: row.counterparty,
        memo: row.memo,
        balanceAfterCents,
        externalId: row.externalId,
        fingerprint: row.fingerprint,
        sourceCode: row.sourceCode,
        sourceType: row.sourceType,
        raw: row.raw,
      });
      existingFingerprints.add(row.fingerprint);
    } catch {
      errors++;
    }
  }

  try {
    inserted = await commitFinancialTransactionCreates(workspaceId, pending);
    duplicates += Math.max(0, pending.length - inserted);
  } catch {
    errors += pending.length;
    inserted = 0;
  }

  // Local-only: attach import batch after leader/apply created the rows.
  if (inserted > 0) {
    const ids = pending.map((row) => row.id);
    await db
      .update(financialTransactions)
      .set({ importBatchId: batchId })
      .where(
        and(
          eq(financialTransactions.workspaceId, workspaceId),
          inArray(financialTransactions.id, ids),
          isNull(financialTransactions.importBatchId),
        ),
      );
  }

  await db
    .update(financialImportBatches)
    .set({
      insertedCount: inserted,
      duplicateCount: duplicates,
      errorCount: errors + skippedAccountMismatch,
      rowCount: parsed.rows.length,
    })
    .where(eq(financialImportBatches.id, batchId));

  return {
    batchId,
    dialect: parsed.dialect,
    rowCount: parsed.rows.length,
    inserted,
    duplicates,
    errors,
    skippedAccountMismatch,
  };
}
