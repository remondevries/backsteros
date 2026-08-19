import type { FinancialTransaction } from "@backsteros/contracts";

import { formatCents } from "./finance-format";

export type TransactionDateProp = {
  id: string;
  bookedOn: string;
};

export type TransactionWeekGroup<T extends TransactionDateProp> = {
  weekKey: string;
  label: string;
  weekStart: string;
  items: T[];
};

export type TransactionMonthGroup<T extends TransactionDateProp> = {
  monthKey: string;
  label: string;
  weeks: TransactionWeekGroup<T>[];
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function parseBookedOn(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

/** Monday-start local week containing `date`. */
export function startOfWeekMonday(date: Date): Date {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + diff);
  return start;
}

function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  const name = MONTH_NAMES[Number(m) - 1] ?? m;
  return `${name} ${y}`;
}

/** Desktop parity: `Week of Jul 20`. */
function weekLabel(weekStartIso: string): string {
  const [, month, day] = weekStartIso.split("-");
  const name = MONTH_NAMES_SHORT[Number(month) - 1] ?? month;
  return `Week of ${name} ${Number(day)}`;
}

/**
 * Group newest-first by calendar month, then Monday-start weeks within each month.
 * Mirrors desktop `groupTransactionsByMonthWeek` (contracts only — no shared UI).
 */
export function groupTransactionsByMonthWeek<T extends TransactionDateProp>(
  rows: T[],
): TransactionMonthGroup<T>[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.bookedOn === b.bookedOn) return b.id.localeCompare(a.id);
    return a.bookedOn < b.bookedOn ? 1 : -1;
  });

  const months = new Map<string, Map<string, TransactionWeekGroup<T>>>();

  for (const row of sorted) {
    const monthKey = row.bookedOn.slice(0, 7);
    const booked = parseBookedOn(row.bookedOn);
    const weekStart = startOfWeekMonday(booked);
    const weekKey = formatIsoDate(weekStart);

    let weekMap = months.get(monthKey);
    if (!weekMap) {
      weekMap = new Map();
      months.set(monthKey, weekMap);
    }
    let week = weekMap.get(weekKey);
    if (!week) {
      week = {
        weekKey,
        label: weekLabel(weekKey),
        weekStart: weekKey,
        items: [],
      };
      weekMap.set(weekKey, week);
    }
    week.items.push(row);
  }

  return [...months.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([monthKey, weekMap]) => ({
      monthKey,
      label: monthLabel(monthKey),
      weeks: [...weekMap.values()].sort((a, b) =>
        a.weekStart < b.weekStart ? 1 : -1,
      ),
    }));
}

export type MonthAmountTotals = {
  incomeCents: number;
  spendCents: number;
  balanceCents: number;
  currency: string;
};

/** Dominant-currency income / spend / balance for a month group (desktop parity). */
export function summarizeMonthAmounts(
  items: ReadonlyArray<Pick<FinancialTransaction, "amountCents" | "currency">>,
): MonthAmountTotals {
  const currencyCounts = new Map<string, number>();
  for (const tx of items) {
    currencyCounts.set(tx.currency, (currencyCounts.get(tx.currency) ?? 0) + 1);
  }
  let currency = "EUR";
  let bestCount = 0;
  for (const [code, count] of currencyCounts) {
    if (count > bestCount) {
      currency = code;
      bestCount = count;
    }
  }

  let incomeCents = 0;
  let spendCents = 0;
  for (const tx of items) {
    if (tx.currency !== currency) continue;
    if (tx.amountCents > 0) incomeCents += tx.amountCents;
    else if (tx.amountCents < 0) spendCents += tx.amountCents;
  }
  return {
    incomeCents,
    spendCents,
    balanceCents: incomeCents + spendCents,
    currency,
  };
}

export function formatMonthTotalsLabel(totals: MonthAmountTotals): string {
  return [
    formatCents(totals.incomeCents, totals.currency),
    formatCents(totals.spendCents, totals.currency),
    formatCents(totals.balanceCents, totals.currency),
  ].join("  ");
}

type AmountRow = TransactionDateProp &
  Pick<FinancialTransaction, "amountCents" | "currency">;

export type TransactionListEntry<T extends AmountRow> =
  | {
      kind: "month";
      key: string;
      monthKey: string;
      label: string;
      totals: MonthAmountTotals;
    }
  | {
      kind: "week";
      key: string;
      /** Monday ISO date — shared when a week straddles two months. */
      weekKey: string;
      monthKey: string;
      label: string;
    }
  | { kind: "transaction"; key: string; transaction: T };

/** Unique FlatList / collapse id — weeks can repeat across adjacent months. */
export function transactionWeekEntryKey(
  monthKey: string,
  weekKey: string,
): string {
  return `week:${monthKey}:${weekKey}`;
}

/**
 * Flatten month(/week) groups into a single FlatList data source.
 * - phone: month headers + rows (weeks collapsed away)
 * - iPad: month + week headers + rows (desktop parity)
 * Collapsed months/weeks keep their header but omit nested content.
 */
export function flattenTransactionGroups<T extends AmountRow>(
  groups: readonly TransactionMonthGroup<T>[],
  options: {
    includeWeeks: boolean;
    collapsedMonths?: ReadonlySet<string>;
    /** Keys from `transactionWeekEntryKey(monthKey, weekKey)`. */
    collapsedWeeks?: ReadonlySet<string>;
  },
): TransactionListEntry<T>[] {
  const collapsedMonths = options.collapsedMonths ?? new Set<string>();
  const collapsedWeeks = options.collapsedWeeks ?? new Set<string>();
  const entries: TransactionListEntry<T>[] = [];
  for (const month of groups) {
    const monthItems = month.weeks.flatMap((week) => week.items);
    entries.push({
      kind: "month",
      key: `month:${month.monthKey}`,
      monthKey: month.monthKey,
      label: month.label,
      totals: summarizeMonthAmounts(monthItems),
    });
    if (collapsedMonths.has(month.monthKey)) continue;
    if (options.includeWeeks) {
      for (const week of month.weeks) {
        const weekEntryKey = transactionWeekEntryKey(
          month.monthKey,
          week.weekKey,
        );
        entries.push({
          kind: "week",
          key: weekEntryKey,
          weekKey: week.weekKey,
          monthKey: month.monthKey,
          label: week.label,
        });
        if (collapsedWeeks.has(weekEntryKey)) continue;
        for (const tx of week.items) {
          entries.push({
            kind: "transaction",
            key: tx.id,
            transaction: tx,
          });
        }
      }
    } else {
      for (const tx of monthItems) {
        entries.push({
          kind: "transaction",
          key: tx.id,
          transaction: tx,
        });
      }
    }
  }
  return entries;
}
