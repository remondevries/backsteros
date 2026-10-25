import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type {
  BankAccountInput,
  CashflowPlannerEntryInput,
  FinancialCategoryInput,
  FinancialGoalInput,
  FinancialRecurringInput,
} from "@backsteros/contracts";

import { db } from "../../../db/index.js";
import {
  bankAccounts,
  cashflowPlannerEntries,
  type DbFinancialCategory,
  financialCategories,
  financialGoals,
  financialRecurrings,
  financialTransactions,
} from "../../../db/schema.js";
import { newId } from "../../../lib/crypto.js";
import { balanceAffectingTransactionSql } from "../cashflow-exclusion.js";
import { advanceMonthlyNextDate } from "../recurring-next-date.js";
export type DbExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

function normalizeIbanOrMask(value: string | null | undefined): string | null {
  if (!value) return null;
  const compact = value.replace(/[\s-]/g, "").toUpperCase();
  return compact || null;
}

export function accountsConflict(
  accountMask: string | null | undefined,
  sourceAccount: string | null,
): boolean {
  const expected = normalizeIbanOrMask(accountMask);
  const actual = normalizeIbanOrMask(sourceAccount);
  if (!expected || !actual) return false;
  // AMEX rekening numbers are short masks; ING is full IBAN.
  if (expected.length >= 10 && actual.length >= 10) {
    return expected !== actual;
  }
  return !expected.endsWith(actual) && !actual.endsWith(expected);
}

export function listBankAccounts(workspaceId: string) {
  return db
    .select()
    .from(bankAccounts)
    .where(
      and(eq(bankAccounts.workspaceId, workspaceId), isNull(bankAccounts.deletedAt)),
    )
    .orderBy(asc(bankAccounts.sortOrder), asc(bankAccounts.name));
}

export async function getBankAccountById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.workspaceId, workspaceId),
        eq(bankAccounts.id, id),
        isNull(bankAccounts.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function createBankAccount(
  workspaceId: string,
  input: BankAccountInput,
  id = newId(),
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .insert(bankAccounts)
    .values({
      id,
      workspaceId,
      key: input.key,
      name: input.name,
      ibanOrMask: input.ibanOrMask ?? null,
      currency: input.currency ?? "EUR",
      type: input.type ?? "bank_account",
      color: input.color ?? null,
      moneybirdFinancialAccountId: input.moneybirdFinancialAccountId ?? null,
      sortOrder: input.sortOrder ?? Date.now(),
    })
    .returning();
  return row!;
}

export async function updateBankAccount(
  workspaceId: string,
  id: string,
  input: Partial<BankAccountInput>,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .update(bankAccounts)
    .set({
      ...(input.key !== undefined ? { key: input.key } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.ibanOrMask !== undefined ? { ibanOrMask: input.ibanOrMask } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.moneybirdFinancialAccountId !== undefined
        ? { moneybirdFinancialAccountId: input.moneybirdFinancialAccountId }
        : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.avatarStorageKey !== undefined
        ? { avatarStorageKey: input.avatarStorageKey }
        : {}),
      ...(input.avatarContentType !== undefined
        ? { avatarContentType: input.avatarContentType }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bankAccounts.workspaceId, workspaceId),
        eq(bankAccounts.id, id),
        isNull(bankAccounts.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function deleteBankAccount(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .update(bankAccounts)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(bankAccounts.workspaceId, workspaceId),
        eq(bankAccounts.id, id),
        isNull(bankAccounts.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export function listFinancialCategories(workspaceId: string) {
  return db
    .select()
    .from(financialCategories)
    .where(
      and(
        eq(financialCategories.workspaceId, workspaceId),
        isNull(financialCategories.deletedAt),
      ),
    )
    .orderBy(asc(financialCategories.sortOrder), asc(financialCategories.name));
}

export async function getFinancialCategoryById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(financialCategories)
    .where(
      and(
        eq(financialCategories.workspaceId, workspaceId),
        eq(financialCategories.id, id),
        isNull(financialCategories.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

function normalizeBudgetCents(
  value: number | null | undefined,
): number | null | undefined {
  if (value === undefined) return undefined;
  if (value == null || value === 0) return null;
  return value;
}

async function resolveCategoryParent(
  workspaceId: string,
  parentId: string | null | undefined,
  executor: DbExecutor,
): Promise<DbFinancialCategory | null> {
  if (!parentId) return null;
  const parent = await getFinancialCategoryById(workspaceId, parentId, executor);
  if (!parent) {
    throw new Error("CATEGORY_PARENT_NOT_FOUND");
  }
  if (parent.parentId != null) {
    throw new Error("CATEGORY_PARENT_TOO_DEEP");
  }
  return parent;
}

export async function createFinancialCategory(
  workspaceId: string,
  input: FinancialCategoryInput,
  id = newId(),
  executor: DbExecutor = db,
) {
  const parent = await resolveCategoryParent(
    workspaceId,
    input.parentId,
    executor,
  );
  const parentId = parent?.id ?? null;
  const kind = input.kind ?? parent?.kind ?? "expense";
  const listing =
    input.listing ??
    (parent?.listing === "excluded" ? "excluded" : "regular");
  const budgetCents = normalizeBudgetCents(input.budgetCents) ?? null;

  const [row] = await executor
    .insert(financialCategories)
    .values({
      id,
      workspaceId,
      name: input.name,
      parentId,
      kind,
      listing,
      icon: input.icon ?? null,
      budgetCents,
      sortOrder: input.sortOrder ?? Date.now(),
    })
    .returning();
  return row!;
}

export async function updateFinancialCategory(
  workspaceId: string,
  id: string,
  input: Partial<FinancialCategoryInput>,
  executor: DbExecutor = db,
) {
  if (input.parentId !== undefined) {
    if (input.parentId === id) {
      throw new Error("CATEGORY_INVALID_PARENT");
    }
    await resolveCategoryParent(workspaceId, input.parentId, executor);
    if (input.parentId != null) {
      const [child] = await executor
        .select({ id: financialCategories.id })
        .from(financialCategories)
        .where(
          and(
            eq(financialCategories.workspaceId, workspaceId),
            eq(financialCategories.parentId, id),
            isNull(financialCategories.deletedAt),
          ),
        )
        .limit(1);
      if (child) {
        throw new Error("CATEGORY_HAS_CHILDREN");
      }
    }
  }

  const budgetCents = normalizeBudgetCents(input.budgetCents);

  const [row] = await executor
    .update(financialCategories)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.listing !== undefined ? { listing: input.listing } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(budgetCents !== undefined ? { budgetCents } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(financialCategories.workspaceId, workspaceId),
        eq(financialCategories.id, id),
        isNull(financialCategories.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function deleteFinancialCategory(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const now = new Date();
  await executor
    .update(financialCategories)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(financialCategories.workspaceId, workspaceId),
        eq(financialCategories.parentId, id),
        isNull(financialCategories.deletedAt),
      ),
    );

  const [row] = await executor
    .update(financialCategories)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(financialCategories.workspaceId, workspaceId),
        eq(financialCategories.id, id),
        isNull(financialCategories.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

function normalizeGoalAmountCents(
  value: number | null | undefined,
): number | null | undefined {
  if (value === undefined) return undefined;
  if (value == null || value <= 0) return null;
  return value;
}

function normalizeGoalListing(
  value: string | null | undefined,
): "active" | "ready_to_spend" | "archive" {
  if (value === "ready_to_spend" || value === "archive") return value;
  return "active";
}

function normalizeSavingMode(
  value: string | null | undefined,
): "daily" | "weekly" | "monthly" | "yearly" {
  if (value === "daily" || value === "weekly" || value === "yearly") {
    return value;
  }
  return "monthly";
}

export function listFinancialGoals(workspaceId: string) {
  return db
    .select()
    .from(financialGoals)
    .where(
      and(
        eq(financialGoals.workspaceId, workspaceId),
        isNull(financialGoals.deletedAt),
      ),
    )
    .orderBy(asc(financialGoals.sortOrder), asc(financialGoals.name));
}

/** Actual tagged savings per goal (sum of linked transaction amounts). */
export async function sumSavedCentsByGoalId(
  workspaceId: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      goalId: financialTransactions.goalId,
      savedCents: sql<number>`coalesce(sum(${financialTransactions.amountCents}), 0)`,
    })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.workspaceId, workspaceId),
        isNotNull(financialTransactions.goalId),
        balanceAffectingTransactionSql(),
      ),
    )
    .groupBy(financialTransactions.goalId);

  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.goalId) continue;
    map.set(row.goalId, Number(row.savedCents) || 0);
  }
  return map;
}

export async function getGoalSavedCents(
  workspaceId: string,
  goalId: string,
): Promise<number> {
  const [row] = await db
    .select({
      savedCents: sql<number>`coalesce(sum(${financialTransactions.amountCents}), 0)`,
    })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.workspaceId, workspaceId),
        eq(financialTransactions.goalId, goalId),
        balanceAffectingTransactionSql(),
      ),
    );
  return Number(row?.savedCents) || 0;
}

export async function getFinancialGoalById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(financialGoals)
    .where(
      and(
        eq(financialGoals.workspaceId, workspaceId),
        eq(financialGoals.id, id),
        isNull(financialGoals.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function createFinancialGoal(
  workspaceId: string,
  input: FinancialGoalInput,
  id = newId(),
  executor: DbExecutor = db,
) {
  const goalAmountCents = normalizeGoalAmountCents(input.goalAmountCents) ?? null;
  const contributionCents =
    normalizeGoalAmountCents(input.contributionCents) ?? null;

  const [row] = await executor
    .insert(financialGoals)
    .values({
      id,
      workspaceId,
      name: input.name,
      listing: normalizeGoalListing(input.listing),
      icon: input.icon ?? null,
      goalAmountCents,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      contributionCents,
      savingMode: normalizeSavingMode(input.savingMode),
      sortOrder: input.sortOrder ?? Date.now(),
    })
    .returning();
  return row!;
}

export async function updateFinancialGoal(
  workspaceId: string,
  id: string,
  input: Partial<FinancialGoalInput>,
  executor: DbExecutor = db,
) {
  const goalAmountCents = normalizeGoalAmountCents(input.goalAmountCents);
  const contributionCents = normalizeGoalAmountCents(input.contributionCents);

  const [row] = await executor
    .update(financialGoals)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.listing !== undefined
        ? { listing: normalizeGoalListing(input.listing) }
        : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(goalAmountCents !== undefined ? { goalAmountCents } : {}),
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      ...(contributionCents !== undefined ? { contributionCents } : {}),
      ...(input.savingMode !== undefined
        ? { savingMode: normalizeSavingMode(input.savingMode) }
        : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(financialGoals.workspaceId, workspaceId),
        eq(financialGoals.id, id),
        isNull(financialGoals.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function deleteFinancialGoal(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const now = new Date();
  const [row] = await executor
    .update(financialGoals)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(financialGoals.workspaceId, workspaceId),
        eq(financialGoals.id, id),
        isNull(financialGoals.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

function normalizeAmountCents(
  value: number | null | undefined,
): number | null | undefined {
  if (value === undefined) return undefined;
  if (value == null || value <= 0) return null;
  return value;
}

export function listFinancialRecurrings(workspaceId: string) {
  return db
    .select()
    .from(financialRecurrings)
    .where(
      and(
        eq(financialRecurrings.workspaceId, workspaceId),
        isNull(financialRecurrings.deletedAt),
      ),
    )
    .orderBy(asc(financialRecurrings.sortOrder), asc(financialRecurrings.name));
}

export async function getFinancialRecurringById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(financialRecurrings)
    .where(
      and(
        eq(financialRecurrings.workspaceId, workspaceId),
        eq(financialRecurrings.id, id),
        isNull(financialRecurrings.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function createFinancialRecurring(
  workspaceId: string,
  input: FinancialRecurringInput,
  id = newId(),
  executor: DbExecutor = db,
) {
  const amountCents = normalizeAmountCents(input.amountCents) ?? null;
  const archived = Boolean(input.archived);
  const nextDate = archived
    ? (input.nextDate ?? null)
    : advanceMonthlyNextDate(input.nextDate ?? null);

  const [row] = await executor
    .insert(financialRecurrings)
    .values({
      id,
      workspaceId,
      name: input.name,
      icon: input.icon ?? null,
      categoryId: input.categoryId ?? null,
      amountCents,
      nextDate,
      archived,
      sortOrder: input.sortOrder ?? Date.now(),
    })
    .returning();
  return row!;
}

export async function updateFinancialRecurring(
  workspaceId: string,
  id: string,
  input: Partial<FinancialRecurringInput>,
  executor: DbExecutor = db,
) {
  const existing = await getFinancialRecurringById(workspaceId, id, executor);
  if (!existing) return null;

  const amountCents = normalizeAmountCents(input.amountCents);
  const archivedAfter =
    input.archived !== undefined
      ? Boolean(input.archived)
      : Boolean(existing.archived);
  const unarchiving = input.archived === false && Boolean(existing.archived);

  let nextDate: string | null | undefined;
  if (input.nextDate !== undefined) {
    nextDate = archivedAfter
      ? input.nextDate
      : advanceMonthlyNextDate(input.nextDate);
  } else if (unarchiving) {
    nextDate = advanceMonthlyNextDate(existing.nextDate);
  }

  const [row] = await executor
    .update(financialRecurrings)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.categoryId !== undefined
        ? { categoryId: input.categoryId }
        : {}),
      ...(amountCents !== undefined ? { amountCents } : {}),
      ...(nextDate !== undefined ? { nextDate } : {}),
      ...(input.archived !== undefined
        ? { archived: Boolean(input.archived) }
        : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(financialRecurrings.workspaceId, workspaceId),
        eq(financialRecurrings.id, id),
        isNull(financialRecurrings.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function deleteFinancialRecurring(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const now = new Date();
  const [row] = await executor
    .update(financialRecurrings)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(financialRecurrings.workspaceId, workspaceId),
        eq(financialRecurrings.id, id),
        isNull(financialRecurrings.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

function normalizeGroupLabel(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function listCashflowPlannerEntries(workspaceId: string) {
  return db
    .select()
    .from(cashflowPlannerEntries)
    .where(
      and(
        eq(cashflowPlannerEntries.workspaceId, workspaceId),
        isNull(cashflowPlannerEntries.deletedAt),
      ),
    )
    .orderBy(
      asc(cashflowPlannerEntries.dueDate),
      asc(cashflowPlannerEntries.sortOrder),
      asc(cashflowPlannerEntries.name),
    );
}

export async function getCashflowPlannerEntryById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(cashflowPlannerEntries)
    .where(
      and(
        eq(cashflowPlannerEntries.workspaceId, workspaceId),
        eq(cashflowPlannerEntries.id, id),
        isNull(cashflowPlannerEntries.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function createCashflowPlannerEntry(
  workspaceId: string,
  input: CashflowPlannerEntryInput,
  id = newId(),
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .insert(cashflowPlannerEntries)
    .values({
      id,
      workspaceId,
      entryType: input.entryType,
      name: input.name.trim(),
      amountCents: Math.max(0, Math.trunc(input.amountCents)),
      dueDate: input.dueDate,
      groupLabel: normalizeGroupLabel(input.groupLabel) ?? null,
      sortOrder: input.sortOrder ?? Date.now(),
    })
    .returning();
  return row!;
}

export async function updateCashflowPlannerEntry(
  workspaceId: string,
  id: string,
  input: Partial<CashflowPlannerEntryInput>,
  executor: DbExecutor = db,
) {
  const existing = await getCashflowPlannerEntryById(workspaceId, id, executor);
  if (!existing) return null;

  const groupLabel = normalizeGroupLabel(input.groupLabel);

  const [row] = await executor
    .update(cashflowPlannerEntries)
    .set({
      ...(input.entryType !== undefined ? { entryType: input.entryType } : {}),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.amountCents !== undefined
        ? { amountCents: Math.max(0, Math.trunc(input.amountCents)) }
        : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      ...(groupLabel !== undefined ? { groupLabel } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(cashflowPlannerEntries.workspaceId, workspaceId),
        eq(cashflowPlannerEntries.id, id),
        isNull(cashflowPlannerEntries.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function deleteCashflowPlannerEntry(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const now = new Date();
  const [row] = await executor
    .update(cashflowPlannerEntries)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(cashflowPlannerEntries.workspaceId, workspaceId),
        eq(cashflowPlannerEntries.id, id),
        isNull(cashflowPlannerEntries.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}
