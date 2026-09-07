import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";

import type {
  BankAccountInput,
  CashflowPlannerEntryInput,
  FinancialAmountSign,
  FinancialCategoryInput,
  FinancialGoalInput,
  FinancialImportResult,
  FinancialRecurringInput,
  UpdateFinancialTransactionInput,
} from "@backsteros/contracts";

import { db } from "../../db/index.js";
import {
  bankAccounts,
  cashflowPlannerEntries,
  financialCategories,
  financialGoals,
  financialRecurrings,
  financialImportBatches,
  financialTransactions,
  type DbBankAccount,
  type DbFinancialCategory,
  type DbFinancialGoal,
  type DbFinancialImportBatch,
  type DbFinancialTransaction,
} from "../../db/schema.js";
import { advanceMonthlyNextDate } from "./recurring-next-date.js";
import { newId } from "../../lib/crypto.js";
import {
  buildPrivateStorageKey,
  putObject,
} from "../../lib/storage.js";
import {
  balanceAffectingTransactionSql,
  cashflowCategoryLeftJoinOn,
  cashflowTransactionSql,
} from "./cashflow-exclusion.js";
import { parseBankCsv } from "./detect-dialect.js";
import { toCashflowAmountCents } from "./ledger-polarity.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

function normalizeIbanOrMask(value: string | null | undefined): string | null {
  if (!value) return null;
  const compact = value.replace(/[\s-]/g, "").toUpperCase();
  return compact || null;
}

function accountsConflict(
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

/**
 * Running balance per account via SQL SUM — avoids bootstrapping Tier C rows.
 */
export async function listBankAccountBalances(workspaceId: string) {
  const accounts = await listBankAccounts(workspaceId);
  if (accounts.length === 0) return [] as Array<{
    bankAccountId: string;
    balanceCents: number;
  }>;

  const rows = await db
    .select({
      bankAccountId: financialTransactions.bankAccountId,
      balanceCents: sql<number>`coalesce(sum(${financialTransactions.amountCents}), 0)::int`,
    })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.workspaceId, workspaceId),
        balanceAffectingTransactionSql(),
      ),
    )
    .groupBy(financialTransactions.bankAccountId);

  const byId = new Map(
    rows.map((row) => [row.bankAccountId, Number(row.balanceCents) || 0]),
  );
  return accounts.map((account) => ({
    bankAccountId: account.id,
    balanceCents: byId.get(account.id) ?? 0,
  }));
}

type AssetsDebtAccount = {
  id: string;
  type: string;
};

function classifyAssetsDebtCents(
  accounts: AssetsDebtAccount[],
  balanceById: Map<string, number>,
): { assetsCents: number; debtCents: number } {
  let assetsCents = 0;
  let debtCents = 0;
  for (const account of accounts) {
    const balance = balanceById.get(account.id) ?? 0;
    if (account.type === "credit_card") {
      debtCents += Math.max(0, -balance);
      assetsCents += Math.max(0, balance);
    } else {
      assetsCents += Math.max(0, balance);
      debtCents += Math.max(0, -balance);
    }
  }
  return { assetsCents, debtCents };
}

function addCalendarDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y || 1970, (m || 1) - 1, (d || 1) + days);
  return formatCalendarDate(date);
}

function resolveAssetsDebtRangeStart(
  range: "1W" | "1M" | "3M" | "YTD" | "1Y" | "ALL",
  asOf: string,
  earliest: string | null,
): string {
  const [y, m, d] = asOf.split("-").map(Number);
  const asOfDate = new Date(y || 1970, (m || 1) - 1, d || 1);
  let start: Date;
  switch (range) {
    case "1W":
      start = new Date(asOfDate);
      start.setDate(start.getDate() - 6);
      break;
    case "1M":
      start = new Date(asOfDate);
      start.setMonth(start.getMonth() - 1);
      break;
    case "3M":
      start = new Date(asOfDate);
      start.setMonth(start.getMonth() - 3);
      break;
    case "YTD":
      start = new Date(asOfDate.getFullYear(), 0, 1);
      break;
    case "1Y":
      start = new Date(asOfDate);
      start.setFullYear(start.getFullYear() - 1);
      break;
    case "ALL":
    default:
      start = earliest
        ? (() => {
            const [ey, em, ed] = earliest.split("-").map(Number);
            return new Date(ey || 1970, (em || 1) - 1, ed || 1);
          })()
        : asOfDate;
      break;
  }
  const startIso = formatCalendarDate(start);
  if (earliest && startIso < earliest) return earliest;
  return startIso;
}

function downsamplePoints<T>(points: T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return points;
  const result: T[] = [];
  const lastIndex = points.length - 1;
  for (let i = 0; i < maxPoints; i += 1) {
    const index =
      i === maxPoints - 1
        ? lastIndex
        : Math.round((i * lastIndex) / (maxPoints - 1));
    const point = points[index];
    if (point != null) result.push(point);
  }
  return result;
}

/**
 * Reconstruct daily assets/debt from current balances + transaction deltas.
 */
export async function getFinanceAssetsDebt(
  workspaceId: string,
  range: "1W" | "1M" | "3M" | "YTD" | "1Y" | "ALL" = "1M",
): Promise<{
  range: "1W" | "1M" | "3M" | "YTD" | "1Y" | "ALL";
  asOf: string;
  assetsCents: number;
  debtCents: number;
  startAssetsCents: number;
  startDebtCents: number;
  points: Array<{ date: string; assetsCents: number; debtCents: number }>;
}> {
  const asOf = formatCalendarDate(new Date());
  const accounts = await listBankAccounts(workspaceId);
  const accountMeta: AssetsDebtAccount[] = accounts.map((row) => ({
    id: row.id,
    type: row.type,
  }));

  const balances = await listBankAccountBalances(workspaceId);
  const balanceById = new Map(
    balances.map((row) => [row.bankAccountId, row.balanceCents]),
  );

  const [earliestRow] = await db
    .select({
      earliest: sql<string | null>`min(${financialTransactions.bookedOn})`,
    })
    .from(financialTransactions)
    .where(eq(financialTransactions.workspaceId, workspaceId));
  const earliestRaw = earliestRow?.earliest ?? null;
  const earliest =
    earliestRaw && /^\d{4}-\d{2}-\d{2}/.test(earliestRaw)
      ? earliestRaw.slice(0, 10)
      : null;

  const startIso = resolveAssetsDebtRangeStart(range, asOf, earliest);
  const endExclusive = addCalendarDays(asOf, 1);

  const deltaRows = await db
    .select({
      day: sql<string>`to_char(${financialTransactions.bookedOn}, 'YYYY-MM-DD')`,
      bankAccountId: financialTransactions.bankAccountId,
      deltaCents: sql<number>`coalesce(sum(${financialTransactions.amountCents}), 0)::int`,
    })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.workspaceId, workspaceId),
        gte(financialTransactions.bookedOn, startIso),
        lt(financialTransactions.bookedOn, endExclusive),
        balanceAffectingTransactionSql(),
      ),
    )
    .groupBy(
      sql`to_char(${financialTransactions.bookedOn}, 'YYYY-MM-DD')`,
      financialTransactions.bankAccountId,
    );

  const deltasByDay = new Map<string, Map<string, number>>();
  for (const row of deltaRows) {
    const day = row.day.slice(0, 10);
    if (!deltasByDay.has(day)) deltasByDay.set(day, new Map());
    deltasByDay
      .get(day)!
      .set(row.bankAccountId, Number(row.deltaCents) || 0);
  }

  // Walk backwards from asOf → start, snapshotting end-of-day balances.
  const working = new Map(balanceById);
  const reversePoints: Array<{
    date: string;
    assetsCents: number;
    debtCents: number;
  }> = [];

  let cursor = asOf;
  while (cursor >= startIso) {
    const classified = classifyAssetsDebtCents(accountMeta, working);
    reversePoints.push({
      date: cursor,
      assetsCents: classified.assetsCents,
      debtCents: classified.debtCents,
    });
    const dayDeltas = deltasByDay.get(cursor);
    if (dayDeltas) {
      for (const [accountId, delta] of dayDeltas) {
        working.set(accountId, (working.get(accountId) ?? 0) - delta);
      }
    }
    if (cursor === startIso) break;
    cursor = addCalendarDays(cursor, -1);
  }

  const points = downsamplePoints(reversePoints.reverse(), 90);
  const current = classifyAssetsDebtCents(accountMeta, balanceById);
  const startPoint = points[0];

  return {
    range,
    asOf,
    assetsCents: current.assetsCents,
    debtCents: current.debtCents,
    startAssetsCents: startPoint?.assetsCents ?? current.assetsCents,
    startDebtCents: startPoint?.debtCents ?? current.debtCents,
    points,
  };
}

/**
 * Sum of credit transactions across all accounts for a calendar month (`YYYY-MM`).
 */
export async function getBankAccountsMonthIncome(
  workspaceId: string,
  month: string,
): Promise<{ month: string; incomeCents: number }> {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(monthIndex) ||
    monthIndex < 1 ||
    monthIndex > 12
  ) {
    return { month, incomeCents: 0 };
  }
  const start = `${yearStr}-${monthStr}-01`;
  const nextMonth =
    monthIndex === 12
      ? `${year + 1}-01-01`
      : `${yearStr}-${String(monthIndex + 1).padStart(2, "0")}-01`;

  const [row] = await db
    .select({
      incomeCents: sql<number>`coalesce(sum(case when ${financialTransactions.amountCents} > 0 then ${financialTransactions.amountCents} else 0 end), 0)::int`,
    })
    .from(financialTransactions)
    .leftJoin(financialCategories, cashflowCategoryLeftJoinOn())
    .where(
      and(
        eq(financialTransactions.workspaceId, workspaceId),
        gte(financialTransactions.bookedOn, start),
        lt(financialTransactions.bookedOn, nextMonth),
        cashflowTransactionSql(),
      ),
    );

  return {
    month,
    incomeCents: Number(row?.incomeCents) || 0,
  };
}

/**
 * Monthly income (credits) and expense (absolute debits) for a calendar year.
 */
export async function getBankAccountCashflow(
  workspaceId: string,
  bankAccountId: string,
  year: number,
): Promise<{
  bankAccountId: string;
  year: number;
  months: Array<{
    month: string;
    incomeCents: number;
    expenseCents: number;
  }>;
} | null> {
  const account = await getBankAccountById(workspaceId, bankAccountId);
  if (!account) return null;

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year + 1}-01-01`;
  const rows = await db
    .select({
      month: sql<string>`to_char(${financialTransactions.bookedOn}, 'YYYY-MM')`,
      incomeCents: sql<number>`coalesce(sum(case when ${financialTransactions.amountCents} > 0 then ${financialTransactions.amountCents} else 0 end), 0)::int`,
      expenseCents: sql<number>`coalesce(sum(case when ${financialTransactions.amountCents} < 0 then -${financialTransactions.amountCents} else 0 end), 0)::int`,
    })
    .from(financialTransactions)
    .leftJoin(financialCategories, cashflowCategoryLeftJoinOn())
    .where(
      and(
        eq(financialTransactions.workspaceId, workspaceId),
        eq(financialTransactions.bankAccountId, bankAccountId),
        gte(financialTransactions.bookedOn, yearStart),
        lt(financialTransactions.bookedOn, yearEnd),
        cashflowTransactionSql(),
      ),
    )
    .groupBy(sql`to_char(${financialTransactions.bookedOn}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${financialTransactions.bookedOn}, 'YYYY-MM')`);

  return {
    bankAccountId,
    year,
    months: rows.map((row) => ({
      month: row.month,
      incomeCents: Number(row.incomeCents) || 0,
      expenseCents: Number(row.expenseCents) || 0,
    })),
  };
}

function formatCalendarDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseCalendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

async function sumIncomeExpenseInRange(
  workspaceId: string,
  fromInclusive: string,
  toExclusive: string,
): Promise<{ incomeCents: number; expenseCents: number; netCents: number }> {
  const [row] = await db
    .select({
      incomeCents: sql<number>`coalesce(sum(case when ${financialTransactions.amountCents} > 0 then ${financialTransactions.amountCents} else 0 end), 0)::int`,
      expenseCents: sql<number>`coalesce(sum(case when ${financialTransactions.amountCents} < 0 then -${financialTransactions.amountCents} else 0 end), 0)::int`,
    })
    .from(financialTransactions)
    .leftJoin(financialCategories, cashflowCategoryLeftJoinOn())
    .where(
      and(
        eq(financialTransactions.workspaceId, workspaceId),
        gte(financialTransactions.bookedOn, fromInclusive),
        lt(financialTransactions.bookedOn, toExclusive),
        cashflowTransactionSql(),
      ),
    );
  const incomeCents = Number(row?.incomeCents) || 0;
  const expenseCents = Number(row?.expenseCents) || 0;
  return {
    incomeCents,
    expenseCents,
    netCents: incomeCents - expenseCents,
  };
}

/**
 * Workspace-wide monthly income/expense for a calendar year, plus YTD net
 * income through `asOf` and the matching prior-year span for YoY comparison.
 */
export async function getWorkspaceCashflow(
  workspaceId: string,
  year: number,
  asOfInput?: string,
): Promise<{
  year: number;
  asOf: string;
  months: Array<{
    month: string;
    incomeCents: number;
    expenseCents: number;
  }>;
  ytdNetCents: number;
  priorYtdNetCents: number;
  ytdIncomeCents: number;
  priorYtdIncomeCents: number;
  ytdExpenseCents: number;
  priorYtdExpenseCents: number;
  categoryMonths: Array<{
    month: string;
    categoryId: string | null;
    expenseCents: number;
  }>;
}> {
  const today = new Date();
  const parsedAsOf = asOfInput ? parseCalendarDate(asOfInput) : null;
  let asOfDate = parsedAsOf ?? today;
  // Clamp asOf into the requested year (future years → Dec 31; past → year end or today).
  if (asOfDate.getFullYear() > year) {
    asOfDate = new Date(year, 11, 31);
  } else if (asOfDate.getFullYear() < year) {
    asOfDate = new Date(year, 11, 31);
  }
  const asOf = formatCalendarDate(asOfDate);
  const asOfExclusive = formatCalendarDate(
    new Date(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate() + 1),
  );

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year + 1}-01-01`;
  const rows = await db
    .select({
      month: sql<string>`to_char(${financialTransactions.bookedOn}, 'YYYY-MM')`,
      incomeCents: sql<number>`coalesce(sum(case when ${financialTransactions.amountCents} > 0 then ${financialTransactions.amountCents} else 0 end), 0)::int`,
      expenseCents: sql<number>`coalesce(sum(case when ${financialTransactions.amountCents} < 0 then -${financialTransactions.amountCents} else 0 end), 0)::int`,
    })
    .from(financialTransactions)
    .leftJoin(financialCategories, cashflowCategoryLeftJoinOn())
    .where(
      and(
        eq(financialTransactions.workspaceId, workspaceId),
        gte(financialTransactions.bookedOn, yearStart),
        lt(financialTransactions.bookedOn, yearEnd),
        cashflowTransactionSql(),
      ),
    )
    .groupBy(sql`to_char(${financialTransactions.bookedOn}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${financialTransactions.bookedOn}, 'YYYY-MM')`);

  const byMonth = new Map(
    rows.map((row) => [
      row.month,
      {
        month: row.month,
        incomeCents: Number(row.incomeCents) || 0,
        expenseCents: Number(row.expenseCents) || 0,
      },
    ]),
  );

  const months = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    return (
      byMonth.get(month) ?? {
        month,
        incomeCents: 0,
        expenseCents: 0,
      }
    );
  });

  // Per-category net spend (credits reduce): dinner + reimbursement → lower total.
  const categoryRows = await db
    .select({
      month: sql<string>`to_char(${financialTransactions.bookedOn}, 'YYYY-MM')`,
      categoryId: financialTransactions.categoryId,
      expenseCents: sql<number>`coalesce(sum(-${financialTransactions.amountCents}), 0)::int`,
    })
    .from(financialTransactions)
    .leftJoin(financialCategories, cashflowCategoryLeftJoinOn())
    .where(
      and(
        eq(financialTransactions.workspaceId, workspaceId),
        gte(financialTransactions.bookedOn, yearStart),
        lt(financialTransactions.bookedOn, yearEnd),
        ne(financialTransactions.amountCents, 0),
        cashflowTransactionSql(),
      ),
    )
    .groupBy(
      sql`to_char(${financialTransactions.bookedOn}, 'YYYY-MM')`,
      financialTransactions.categoryId,
    )
    .orderBy(sql`to_char(${financialTransactions.bookedOn}, 'YYYY-MM')`);

  const ytd = await sumIncomeExpenseInRange(
    workspaceId,
    yearStart,
    asOfExclusive,
  );

  const priorYear = year - 1;
  const priorStart = `${priorYear}-01-01`;
  const priorAsOfExclusive = formatCalendarDate(
    new Date(priorYear, asOfDate.getMonth(), asOfDate.getDate() + 1),
  );
  const priorYtd = await sumIncomeExpenseInRange(
    workspaceId,
    priorStart,
    priorAsOfExclusive,
  );

  return {
    year,
    asOf,
    months,
    ytdNetCents: ytd.netCents,
    priorYtdNetCents: priorYtd.netCents,
    ytdIncomeCents: ytd.incomeCents,
    priorYtdIncomeCents: priorYtd.incomeCents,
    ytdExpenseCents: ytd.expenseCents,
    priorYtdExpenseCents: priorYtd.expenseCents,
    categoryMonths: categoryRows.map((row) => ({
      month: row.month,
      categoryId: row.categoryId ?? null,
      expenseCents: Number(row.expenseCents) || 0,
    })),
  };
}

function shiftMonth(year: number, monthIndex0: number, delta: number): {
  year: number;
  monthIndex0: number;
} {
  const absolute = year * 12 + monthIndex0 + delta;
  return {
    year: Math.floor(absolute / 12),
    monthIndex0: ((absolute % 12) + 12) % 12,
  };
}

function monthKey(year: number, monthIndex0: number): string {
  return `${year}-${String(monthIndex0 + 1).padStart(2, "0")}`;
}

/**
 * Spend side panel payload: trailing monthly history, year metrics, and
 * category breakdown for the selected calendar month.
 */
export async function getFinanceSpendPanel(
  workspaceId: string,
  monthInput?: string,
  historyMonthCount = 36,
): Promise<{
  month: string;
  monthExpenseCents: number;
  history: Array<{ month: string; expenseCents: number }>;
  yearMetrics: Array<{
    year: number;
    spendCents: number;
    avgMonthlyCents: number;
  }>;
  categories: Array<{ categoryId: string | null; expenseCents: number }>;
}> {
  const today = new Date();
  const fallbackMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const month = monthInput && /^\d{4}-\d{2}$/.test(monthInput) ? monthInput : fallbackMonth;
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIndex0 = Number(monthStr) - 1;

  const historyStart = shiftMonth(year, monthIndex0, -(historyMonthCount - 1));
  const historyStartKey = monthKey(historyStart.year, historyStart.monthIndex0);
  const monthEndExclusive = formatCalendarDate(
    new Date(year, monthIndex0 + 1, 1),
  );

  const historyRows = await db
    .select({
      month: sql<string>`to_char(${financialTransactions.bookedOn}, 'YYYY-MM')`,
      expenseCents: sql<number>`coalesce(sum(-${financialTransactions.amountCents}), 0)::int`,
    })
    .from(financialTransactions)
    .leftJoin(financialCategories, cashflowCategoryLeftJoinOn())
    .where(
      and(
        eq(financialTransactions.workspaceId, workspaceId),
        gte(financialTransactions.bookedOn, `${historyStartKey}-01`),
        lt(financialTransactions.bookedOn, monthEndExclusive),
        lt(financialTransactions.amountCents, 0),
        cashflowTransactionSql(),
      ),
    )
    .groupBy(sql`to_char(${financialTransactions.bookedOn}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${financialTransactions.bookedOn}, 'YYYY-MM')`);

  const byMonth = new Map(
    historyRows.map((row) => [row.month, Number(row.expenseCents) || 0]),
  );

  const history: Array<{ month: string; expenseCents: number }> = [];
  for (let i = 0; i < historyMonthCount; i += 1) {
    const cursor = shiftMonth(historyStart.year, historyStart.monthIndex0, i);
    const key = monthKey(cursor.year, cursor.monthIndex0);
    history.push({
      month: key,
      expenseCents: byMonth.get(key) ?? 0,
    });
  }

  const monthExpenseCents = byMonth.get(month) ?? 0;

  // Per-category net spend (credits reduce the category total).
  const categoryRows = await db
    .select({
      categoryId: financialTransactions.categoryId,
      expenseCents: sql<number>`coalesce(sum(-${financialTransactions.amountCents}), 0)::int`,
    })
    .from(financialTransactions)
    .leftJoin(financialCategories, cashflowCategoryLeftJoinOn())
    .where(
      and(
        eq(financialTransactions.workspaceId, workspaceId),
        gte(financialTransactions.bookedOn, `${month}-01`),
        lt(financialTransactions.bookedOn, monthEndExclusive),
        ne(financialTransactions.amountCents, 0),
        cashflowTransactionSql(),
      ),
    )
    .groupBy(financialTransactions.categoryId);

  const yearSpend = new Map<number, number>();
  for (const row of history) {
    const y = Number(row.month.slice(0, 4));
    yearSpend.set(y, (yearSpend.get(y) ?? 0) + row.expenseCents);
  }

  // Prefer selected year + prior year first; include any other years with spend.
  const metricYears = new Set<number>([year, year - 1]);
  for (const y of yearSpend.keys()) metricYears.add(y);
  const yearMetrics = [...metricYears]
    .sort((a, b) => b - a)
    .filter((y) => (yearSpend.get(y) ?? 0) > 0 || y === year || y === year - 1)
    .slice(0, 3)
    .map((y) => {
      const spendCents = yearSpend.get(y) ?? 0;
      const monthsElapsed =
        y < year ? 12 : y > year ? 0 : Math.max(1, monthIndex0 + 1);
      const avgMonthlyCents =
        monthsElapsed > 0 ? Math.round(spendCents / monthsElapsed) : 0;
      return { year: y, spendCents, avgMonthlyCents };
    });

  return {
    month,
    monthExpenseCents,
    history,
    yearMetrics,
    categories: categoryRows.map((row) => ({
      categoryId: row.categoryId ?? null,
      expenseCents: Number(row.expenseCents) || 0,
    })),
  };
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
    "../core-replication/leader-mutations.js"
  );
  if (shouldForwardMutationsToLeader()) {
    const { commitRestEntityWriteBatch } = await import(
      "../rest-leader-write.js"
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
    "../sync.js"
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

export type {
  DbBankAccount,
  DbFinancialCategory,
  DbFinancialGoal,
  DbFinancialImportBatch,
  DbFinancialTransaction,
};
