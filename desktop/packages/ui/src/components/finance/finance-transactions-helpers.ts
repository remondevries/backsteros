import type { FinancialTransaction } from "@backsteros/contracts";

import {
  DROPDOWN_NO_GOAL_VALUE,
  DROPDOWN_NO_PROJECT_VALUE,
  DROPDOWN_NO_RECURRING_VALUE,
  resolveDropdownNone,
} from "../dropdowns/dropdown-options.js";

export function formatAmount(cents: number, currency: string): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function parseBookedDate(isoDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
}

export function formatTxDate(isoDate: string): string {
  const date = parseBookedDate(isoDate);
  if (!date) return isoDate;
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
    }).format(date);
  } catch {
    return isoDate;
  }
}

export function formatFullTxDate(isoDate: string): string {
  const date = parseBookedDate(isoDate);
  if (!date) return isoDate;
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  } catch {
    return isoDate;
  }
}

export function txDescription(tx: FinancialTransaction): string {
  return (
    tx.displayName?.trim() ||
    tx.payee.trim() ||
    tx.memo?.trim() ||
    tx.counterparty?.trim() ||
    "Untitled transaction"
  );
}

export function txOriginalDescription(tx: FinancialTransaction): string {
  return (
    tx.payee.trim() ||
    tx.memo?.trim() ||
    tx.counterparty?.trim() ||
    "Untitled transaction"
  );
}

export function formatAmountCents(cents: number | null, currency: string): string {
  if (cents == null) return "—";
  return formatAmount(cents, currency);
}

export const resolveOrg = (value: string): string | null =>
  resolveDropdownNone(value);
export const resolveProject = (value: string): string | null =>
  value === DROPDOWN_NO_PROJECT_VALUE ? null : value;
export const resolveGoal = (value: string): string | null =>
  value === DROPDOWN_NO_GOAL_VALUE ? null : value;
export const resolveRecurring = (value: string): string | null =>
  value === DROPDOWN_NO_RECURRING_VALUE ? null : value;
export const resolveCategory = (value: string): string | null =>
  resolveDropdownNone(value);
