"use client";

import type {
  FinancialGoalSavingMode,
  FinancialTransaction,
} from "@backsteros/contracts";
import { useMemo } from "react";

import { FinanceDetailSectionTitle } from "./finance-detail-section-title.js";
import {
  formatMoney,
  parseCalendarDate,
  startOfLocalDay,
} from "./finance-goals-shared.js";

type GoalYearMetric = {
  year: number;
  /** Contributions booked in this calendar year only. */
  savedInYearCents: number;
};

function buildGoalYearMetrics(
  transactions: FinancialTransaction[],
): GoalYearMetric[] {
  const yearTotals = new Map<number, number>();
  for (const tx of transactions) {
    if (!tx.bookedOn || tx.bookedOn.length < 4) continue;
    const year = Number(tx.bookedOn.slice(0, 4));
    if (!Number.isFinite(year)) continue;
    yearTotals.set(year, (yearTotals.get(year) ?? 0) + tx.amountCents);
  }
  return [...yearTotals.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, cents]) => ({
      year,
      savedInYearCents: Math.max(0, cents),
    }));
}

/** 0-based index of the last contribution on or before `asOf` (−1 if none). */
function goalPeriodIndexOnOrBefore(
  start: Date,
  asOf: Date,
  mode: FinancialGoalSavingMode,
): number {
  const startDay = startOfLocalDay(start);
  const day = startOfLocalDay(asOf);
  if (day < startDay) return -1;
  if (mode === "daily") {
    return Math.floor((day.getTime() - startDay.getTime()) / 86_400_000);
  }
  if (mode === "weekly") {
    return Math.floor(
      (day.getTime() - startDay.getTime()) / (7 * 86_400_000),
    );
  }
  if (mode === "yearly") {
    let periods = day.getFullYear() - startDay.getFullYear();
    const anniversary = new Date(
      day.getFullYear(),
      startDay.getMonth(),
      startDay.getDate(),
    );
    if (day < anniversary) periods -= 1;
    return Math.max(0, periods);
  }
  return (
    (day.getFullYear() - startDay.getFullYear()) * 12 +
    (day.getMonth() - startDay.getMonth())
  );
}

function plannedContributionCentsForYear(
  year: number,
  contributionCents: number | null | undefined,
  savingMode: FinancialGoalSavingMode,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  asOf: Date = new Date(),
): number | null {
  if (contributionCents == null || contributionCents <= 0) return null;
  const start = parseCalendarDate(startDate);
  if (!start) return null;

  const end = parseCalendarDate(endDate);
  let rangeEnd = new Date(year, 11, 31);
  if (end && end < rangeEnd) rangeEnd = end;
  if (year === asOf.getFullYear()) {
    const today = startOfLocalDay(asOf);
    if (today < rangeEnd) rangeEnd = today;
  } else if (year > asOf.getFullYear()) {
    return null;
  }

  const dayBeforeYear = new Date(year, 0, 0); // 31 Dec of previous year
  const throughEnd = goalPeriodIndexOnOrBefore(start, rangeEnd, savingMode);
  const throughBefore = goalPeriodIndexOnOrBefore(
    start,
    dayBeforeYear,
    savingMode,
  );
  const countThroughEnd = throughEnd >= 0 ? throughEnd + 1 : 0;
  const countThroughBefore = throughBefore >= 0 ? throughBefore + 1 : 0;
  const periods = Math.max(0, countThroughEnd - countThroughBefore);
  return periods * contributionCents;
}

export function GoalKeyMetrics({
  transactions,
  contributionCents,
  savingMode,
  startDate,
  endDate,
  loading,
  savedCents,
  goalAmountCents,
}: {
  transactions: FinancialTransaction[];
  contributionCents: number | null | undefined;
  savingMode: FinancialGoalSavingMode;
  startDate: string | null | undefined;
  endDate: string | null | undefined;
  loading: boolean;
  savedCents: number;
  goalAmountCents: number | null | undefined;
}) {
  const rows = useMemo(() => {
    const asOf = new Date();
    const yearTotals = buildGoalYearMetrics(transactions);
    const years = new Set(yearTotals.map((entry) => entry.year));
    const start = parseCalendarDate(startDate);
    if (start) {
      const lastYear = Math.min(
        asOf.getFullYear(),
        parseCalendarDate(endDate)?.getFullYear() ?? asOf.getFullYear(),
      );
      for (let year = start.getFullYear(); year <= lastYear; year += 1) {
        years.add(year);
      }
    } else if (
      years.size === 0 &&
      contributionCents != null &&
      contributionCents > 0
    ) {
      years.add(asOf.getFullYear());
    }

    const savedInYear = new Map(
      yearTotals.map((entry) => [entry.year, entry.savedInYearCents] as const),
    );
    const ascending = [...years].sort((a, b) => a - b);
    let savedSoFar = 0;
    const cumulative = ascending.map((year) => {
      savedSoFar += savedInYear.get(year) ?? 0;
      return {
        year,
        savedSoFarCents: savedSoFar,
        contributionCents: plannedContributionCentsForYear(
          year,
          contributionCents,
          savingMode,
          startDate,
          endDate,
          asOf,
        ),
      };
    });
    return cumulative.sort((a, b) => b.year - a.year);
  }, [
    contributionCents,
    endDate,
    savingMode,
    startDate,
    transactions,
  ]);

  const hasGoal = goalAmountCents != null && goalAmountCents > 0;
  const ratio = hasGoal
    ? Math.min(1, Math.max(0, savedCents / goalAmountCents))
    : 0;

  return (
    <section className="finance-categories-view__metrics finance-goals-view__metrics">
      <div
        className={[
          "finance-goals-view__progress-divider",
          !hasGoal ? "is-empty" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={hasGoal ? Math.round(ratio * 100) : 0}
        aria-label={
          hasGoal
            ? `${Math.round(ratio * 100)}% of goal saved`
            : "No goal amount"
        }
      >
        <span
          className="finance-goals-view__progress-divider-fill"
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
      <FinanceDetailSectionTitle>Key metrics</FinanceDetailSectionTitle>
      <div className="finance-categories-view__metrics-head">
        <span className="finance-categories-view__metrics-col finance-categories-view__metrics-col--start">
          Year
        </span>
        <span className="finance-categories-view__metrics-col">
          Saved so far
        </span>
        <span className="finance-categories-view__metrics-col">
          Contribution
        </span>
      </div>
      {rows.length ? (
        rows.map((entry) => (
          <div
            key={entry.year}
            className="finance-categories-view__metrics-row"
          >
            <span className="finance-categories-view__metrics-year">
              {entry.year}
            </span>
            <span className="finance-categories-view__metrics-value">
              {formatMoney(entry.savedSoFarCents)}
            </span>
            <span className="finance-categories-view__metrics-value">
              {entry.contributionCents != null
                ? formatMoney(entry.contributionCents)
                : "—"}
            </span>
          </div>
        ))
      ) : (
        <div className="finance-categories-view__metrics-empty">
          {loading ? "Loading metrics…" : "No savings recorded yet."}
        </div>
      )}
    </section>
  );
}
