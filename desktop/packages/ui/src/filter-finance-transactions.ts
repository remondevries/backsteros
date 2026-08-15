import type { FinancialTransaction } from "@backsteros/contracts";

import {
  DROPDOWN_NONE_VALUE,
  DROPDOWN_NO_GOAL_VALUE,
  DROPDOWN_NO_RECURRING_VALUE,
} from "./components/dropdown-options.js";

export type FinanceTransactionListFilters = {
  search: string;
  /**
   * Inclusive lower bound in cents. `null` = unbounded (same as full domain).
   */
  amountMinCents: number | null;
  /**
   * Inclusive upper bound in cents. `null` = unbounded (same as full domain).
   */
  amountMaxCents: number | null;
  /** Empty = all. May include {@link DROPDOWN_NONE_VALUE} for uncategorized. */
  categoryIds: string[];
  /**
   * `null` = all organizations.
   * {@link DROPDOWN_NONE_VALUE} = unassigned organization.
   * Otherwise an organization id.
   */
  organizationId: string | null;
  /**
   * `null` = all goals.
   * {@link DROPDOWN_NO_GOAL_VALUE} = unassigned goal.
   * Otherwise a goal id.
   */
  goalId: string | null;
  /**
   * `null` = all recurrings.
   * {@link DROPDOWN_NO_RECURRING_VALUE} = unassigned recurring.
   * Otherwise a recurring id.
   */
  recurringId: string | null;
};

/** Default half-extent (€1,000) when there are no amount samples. */
export const DEFAULT_AMOUNT_RANGE_EXTENT_CENTS = 100_000;

export type AmountRangeDomain = {
  /** Symmetric half-width; domain is `[-extentCents, +extentCents]`. */
  extentCents: number;
  minCents: number;
  maxCents: number;
};

export type AmountHistogramBin = {
  /** Inclusive bin start (cents). */
  startCents: number;
  /** Exclusive bin end (cents), except the last bin which is inclusive of max. */
  endCents: number;
  count: number;
};

function matchesSearch(tx: FinancialTransaction, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    tx.displayName,
    tx.payee,
    tx.counterparty,
    tx.memo,
    tx.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function matchesAmountRange(
  tx: FinancialTransaction,
  amountMinCents: number | null,
  amountMaxCents: number | null,
): boolean {
  if (amountMinCents != null && tx.amountCents < amountMinCents) return false;
  if (amountMaxCents != null && tx.amountCents > amountMaxCents) return false;
  return true;
}

function matchesCategoryIds(
  tx: FinancialTransaction,
  categoryIds: string[],
): boolean {
  if (categoryIds.length === 0) return true;
  const wantsUncategorized = categoryIds.includes(DROPDOWN_NONE_VALUE);
  const concreteIds = categoryIds.filter((id) => id !== DROPDOWN_NONE_VALUE);
  if (tx.categoryId == null) return wantsUncategorized;
  return concreteIds.includes(tx.categoryId);
}

function matchesOrganization(
  tx: FinancialTransaction,
  organizationId: string | null,
): boolean {
  if (organizationId == null) return true;
  if (organizationId === DROPDOWN_NONE_VALUE) return tx.organizationId == null;
  return tx.organizationId === organizationId;
}

function matchesGoal(
  tx: FinancialTransaction,
  goalId: string | null,
): boolean {
  if (goalId == null) return true;
  if (goalId === DROPDOWN_NO_GOAL_VALUE) return tx.goalId == null;
  return tx.goalId === goalId;
}

function matchesRecurring(
  tx: FinancialTransaction,
  recurringId: string | null,
): boolean {
  if (recurringId == null) return true;
  if (recurringId === DROPDOWN_NO_RECURRING_VALUE) return tx.recurringId == null;
  return tx.recurringId === recurringId;
}

/** Client-side filter for already-loaded transaction lists (detail panels). */
export function filterFinanceTransactions(
  rows: readonly FinancialTransaction[],
  filters: FinanceTransactionListFilters,
): FinancialTransaction[] {
  return rows.filter(
    (tx) =>
      matchesSearch(tx, filters.search) &&
      matchesAmountRange(tx, filters.amountMinCents, filters.amountMaxCents) &&
      matchesCategoryIds(tx, filters.categoryIds) &&
      matchesOrganization(tx, filters.organizationId) &&
      matchesGoal(tx, filters.goalId) &&
      matchesRecurring(tx, filters.recurringId),
  );
}

/**
 * Symmetric 0-centered domain from amount samples.
 * Always includes at least {@link DEFAULT_AMOUNT_RANGE_EXTENT_CENTS}.
 */
export function computeAmountRangeDomain(
  amountCentsSamples: readonly number[],
): AmountRangeDomain {
  let peak = 0;
  for (const cents of amountCentsSamples) {
    const abs = Math.abs(cents);
    if (abs > peak) peak = abs;
  }
  const extentCents = Math.max(peak, DEFAULT_AMOUNT_RANGE_EXTENT_CENTS);
  return {
    extentCents,
    minCents: -extentCents,
    maxCents: extentCents,
  };
}

/** True when the selection covers the full domain (amount filter inactive). */
export function isFullAmountRange(
  minCents: number | null,
  maxCents: number | null,
  domain: AmountRangeDomain,
): boolean {
  const lo = minCents ?? domain.minCents;
  const hi = maxCents ?? domain.maxCents;
  return lo <= domain.minCents && hi >= domain.maxCents;
}

/**
 * Build equal-width histogram bins over a 0-centered domain.
 * `binCount` should be odd so one bin straddles zero when possible.
 */
export function buildAmountHistogramBins(
  amountCentsSamples: readonly number[],
  domain: AmountRangeDomain,
  binCount = 41,
): AmountHistogramBin[] {
  const count = Math.max(3, binCount);
  const span = domain.maxCents - domain.minCents;
  if (span <= 0) {
    return [
      {
        startCents: domain.minCents,
        endCents: domain.maxCents,
        count: amountCentsSamples.length,
      },
    ];
  }

  const width = span / count;
  const bins: AmountHistogramBin[] = Array.from({ length: count }, (_, i) => {
    const startCents = domain.minCents + i * width;
    const endCents =
      i === count - 1 ? domain.maxCents : domain.minCents + (i + 1) * width;
    return { startCents, endCents, count: 0 };
  });

  for (const cents of amountCentsSamples) {
    if (cents < domain.minCents || cents > domain.maxCents) continue;
    let index = Math.floor((cents - domain.minCents) / width);
    if (index >= count) index = count - 1;
    if (index < 0) index = 0;
    bins[index]!.count += 1;
  }

  return bins;
}
