import { and, eq, gte, lt, ne, sql } from "drizzle-orm";

import { getBankAccountById, listBankAccounts } from "./catalog.js";
import { db } from "../../../db/index.js";
import { financialCategories, financialTransactions } from "../../../db/schema.js";
import {
  balanceAffectingTransactionSql,
  cashflowCategoryLeftJoinOn,
  cashflowTransactionSql,
} from "../cashflow-exclusion.js";
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
