import type { FinancialTransaction } from "@backsteros/contracts";

import { isCashflowTransaction } from "./cashflow-exclusion.js";

export type NetThisMonthPeriod = {
  /** Inclusive start `YYYY-MM-DD`. */
  from: string;
  /** Inclusive end `YYYY-MM-DD`. */
  to: string;
};

export type NetThisMonthStats = {
  month: string;
  period: NetThisMonthPeriod;
  priorPeriod: NetThisMonthPeriod;
  incomeCents: number;
  spendCents: number;
  netCents: number;
  priorNetCents: number;
  /** `((net - priorNet) / |priorNet|) * 100`, or null when prior is 0. */
  changePercent: number | null;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function parseMonthKey(month: string): { year: number; monthIndex: number } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return { year: y!, monthIndex: m! - 1 };
}

export function previousMonthKey(month: string): string | null {
  const parsed = parseMonthKey(month);
  if (!parsed) return null;
  const date = new Date(parsed.year, parsed.monthIndex - 1, 1);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

/**
 * Resolve the inclusive MTD end day for a chart month.
 * Current month → today; past/future months → last day of that month.
 */
export function resolveNetThisMonthAsOfDay(
  month: string,
  now = new Date(),
): number {
  const parsed = parseMonthKey(month);
  if (!parsed) return 1;
  const lastDay = daysInMonth(parsed.year, parsed.monthIndex);
  const isCurrentMonth =
    now.getFullYear() === parsed.year &&
    now.getMonth() === parsed.monthIndex;
  if (isCurrentMonth) {
    return Math.min(Math.max(1, now.getDate()), lastDay);
  }
  return lastDay;
}

export function buildNetThisMonthPeriods(
  month: string,
  now = new Date(),
): { period: NetThisMonthPeriod; priorPeriod: NetThisMonthPeriod } | null {
  const parsed = parseMonthKey(month);
  const priorKey = previousMonthKey(month);
  const priorParsed = priorKey ? parseMonthKey(priorKey) : null;
  if (!parsed || !priorKey || !priorParsed) return null;

  const asOfDay = resolveNetThisMonthAsOfDay(month, now);
  const priorLastDay = daysInMonth(priorParsed.year, priorParsed.monthIndex);
  const priorDay = Math.min(asOfDay, priorLastDay);

  return {
    period: {
      from: `${month}-01`,
      to: `${month}-${pad2(asOfDay)}`,
    },
    priorPeriod: {
      from: `${priorKey}-01`,
      to: `${priorKey}-${pad2(priorDay)}`,
    },
  };
}

function sumIncomeSpend(
  transactions: ReadonlyArray<
    Pick<FinancialTransaction, "bookedOn" | "amountCents" | "categoryId">
  >,
  period: NetThisMonthPeriod,
  nonCashflowCategoryIds: ReadonlySet<string>,
): { incomeCents: number; spendCents: number; netCents: number } {
  let incomeCents = 0;
  let spendCents = 0;
  for (const tx of transactions) {
    if (!tx.bookedOn || tx.bookedOn < period.from || tx.bookedOn > period.to) {
      continue;
    }
    if (!isCashflowTransaction(tx, nonCashflowCategoryIds)) continue;
    if (tx.amountCents > 0) incomeCents += tx.amountCents;
    else if (tx.amountCents < 0) spendCents += -tx.amountCents;
  }
  return {
    incomeCents,
    spendCents,
    netCents: incomeCents - spendCents,
  };
}

export function computeNetThisMonthStats(input: {
  month: string;
  transactions: ReadonlyArray<
    Pick<FinancialTransaction, "bookedOn" | "amountCents" | "categoryId">
  >;
  priorTransactions: ReadonlyArray<
    Pick<FinancialTransaction, "bookedOn" | "amountCents" | "categoryId">
  >;
  /** Category ids with kind transfer or listing excluded. */
  nonCashflowCategoryIds?: ReadonlySet<string>;
  now?: Date;
}): NetThisMonthStats | null {
  const periods = buildNetThisMonthPeriods(input.month, input.now);
  if (!periods) return null;

  const nonCashflowCategoryIds = input.nonCashflowCategoryIds ?? new Set();
  const current = sumIncomeSpend(
    input.transactions,
    periods.period,
    nonCashflowCategoryIds,
  );
  const prior = sumIncomeSpend(
    input.priorTransactions,
    periods.priorPeriod,
    nonCashflowCategoryIds,
  );
  const changePercent =
    prior.netCents === 0
      ? null
      : ((current.netCents - prior.netCents) / Math.abs(prior.netCents)) * 100;

  return {
    month: input.month,
    period: periods.period,
    priorPeriod: periods.priorPeriod,
    incomeCents: current.incomeCents,
    spendCents: current.spendCents,
    netCents: current.netCents,
    priorNetCents: prior.netCents,
    changePercent,
  };
}

export function formatNetThisMonthRangeLabel(period: NetThisMonthPeriod): string {
  const from = new Date(
    Number(period.from.slice(0, 4)),
    Number(period.from.slice(5, 7)) - 1,
    Number(period.from.slice(8, 10)),
  );
  const to = new Date(
    Number(period.to.slice(0, 4)),
    Number(period.to.slice(5, 7)) - 1,
    Number(period.to.slice(8, 10)),
  );
  const sameYear = from.getFullYear() === to.getFullYear();
  const fromLabel = from.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const toLabel = to.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${fromLabel} - ${toLabel}`;
}
