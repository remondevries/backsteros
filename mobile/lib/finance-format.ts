import type { FinancialTransaction } from "@backsteros/contracts";

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

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
};

/**
 * Format integer cents as a currency amount.
 * Hermes Intl support varies per build — hand-rolled to stay deterministic.
 */
export function formatCents(cents: number, currency = "EUR"): string {
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()] ?? `${currency} `;
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  const wholeGrouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${symbol}${wholeGrouped},${fraction}`;
}

/** Like `formatCents` but prefixes credits with `+`. */
export function formatSignedCents(cents: number, currency = "EUR"): string {
  const formatted = formatCents(cents, currency);
  return cents > 0 ? `+${formatted}` : formatted;
}

/** `YYYY-MM` for a Date (local calendar). */
export function monthKeyForDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function currentMonthKey(): string {
  return monthKeyForDate(new Date());
}

/**
 * Reference date for chart series: today when `monthKey` is the current month,
 * otherwise the last calendar day of that month (desktop `asOfForMonthKey`).
 */
export function asOfForMonthKey(monthKey: string, now = new Date()): Date {
  const [yearRaw, monthRaw] = monthKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    month < 1 ||
    month > 12
  ) {
    return now;
  }
  if (now.getFullYear() === year && now.getMonth() + 1 === month) {
    return now;
  }
  return new Date(year, month, 0);
}

/** Shift a `YYYY-MM` key by whole months (negative = past). */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const [yearRaw, monthRaw] = monthKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const index = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

/** Last `count` month keys ending at `endKey` inclusive, oldest first. */
export function trailingMonthKeys(endKey: string, count: number): string[] {
  const keys: string[] = [];
  for (let offset = count - 1; offset >= 0; offset--) {
    keys.push(shiftMonthKey(endKey, -offset));
  }
  return keys;
}

/** "August 2026" for a `YYYY-MM` key. */
export function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const name = MONTH_NAMES[Number(month) - 1] ?? month;
  return `${name} ${year}`;
}

/** "Aug" for a `YYYY-MM` key (chart axis). */
export function formatMonthShort(monthKey: string): string {
  const month = monthKey.split("-")[1];
  return MONTH_NAMES_SHORT[Number(month) - 1] ?? String(month);
}

/** "15 Aug 2026" for a `YYYY-MM-DD` booked-on date. */
export function formatCalendarDate(calendarDate: string): string {
  const [year, month, day] = calendarDate.split("-");
  const name = MONTH_NAMES_SHORT[Number(month) - 1] ?? month;
  return `${Number(day)} ${name} ${year}`;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** "Saturday, Aug 15, 2026" — desktop transaction detail hero date. */
export function formatFullTxDate(calendarDate: string): string {
  const [yearRaw, monthRaw, dayRaw] = calendarDate.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return calendarDate;
  }
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return calendarDate;
  }
  const weekday = WEEKDAY_NAMES[date.getDay()];
  const monthName = MONTH_NAMES_SHORT[month - 1] ?? monthRaw;
  return `${weekday}, ${monthName} ${day}, ${year}`;
}

/** "15 Aug" — desktop finance transaction row date (no year). */
export function formatTxDateShort(calendarDate: string): string {
  const [, month, day] = calendarDate.split("-");
  const name = MONTH_NAMES_SHORT[Number(month) - 1] ?? month;
  return `${Number(day)} ${name}`;
}

/** Display title fallback chain: displayName → payee → memo → counterparty. */
export function transactionDisplayTitle(
  transaction: Pick<
    FinancialTransaction,
    "displayName" | "payee" | "memo" | "counterparty"
  >,
): string {
  return (
    transaction.displayName?.trim() ||
    transaction.payee?.trim() ||
    transaction.memo?.trim() ||
    transaction.counterparty?.trim() ||
    "Transaction"
  );
}
