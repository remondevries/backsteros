"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "@primer/octicons-react";

export function formatMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function parseMonthKey(month: string | null | undefined): Date | null {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  if (!Number.isFinite(year) || monthIndex < 0 || monthIndex > 11) return null;
  return new Date(year, monthIndex, 1);
}

export function shiftMonthKey(month: string, delta: number): string {
  const date = parseMonthKey(month) ?? new Date();
  return formatMonthKey(
    new Date(date.getFullYear(), date.getMonth() + delta, 1),
  );
}

export function localMonthKey(asOf = new Date()): string {
  return formatMonthKey(asOf);
}

export function formatMonthLong(month: string | null | undefined): string {
  const date = parseMonthKey(month);
  if (!date) return "Month";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric",
    }).format(date);
  } catch {
    return month ?? "Month";
  }
}

/**
 * Reference date for chart series: today when `month` is the current month,
 * otherwise the last calendar day of that month.
 */
export function asOfForMonthKey(month: string, now = new Date()): Date {
  const parsed = parseMonthKey(month);
  if (!parsed) return now;
  if (
    now.getFullYear() === parsed.getFullYear() &&
    now.getMonth() === parsed.getMonth()
  ) {
    return now;
  }
  return new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0);
}

export type FinanceMonthNavigatorProps = {
  month: string | null;
  /** Furthest month the next-arrow may reach (usually the current local month). */
  latestMonth: string;
  onChange?: (month: string) => void;
  /** Accessible name for the control group. */
  "aria-label"?: string;
  className?: string;
};

export function FinanceMonthNavigator({
  month,
  latestMonth,
  onChange,
  "aria-label": ariaLabel = "Budget month",
  className,
}: FinanceMonthNavigatorProps) {
  const current = month && /^\d{4}-\d{2}$/.test(month) ? month : latestMonth;
  const canGoNext = current < latestMonth;
  const disabled = !onChange;

  return (
    <div
      className={["finance-categories-view__month-nav", className]
        .filter(Boolean)
        .join(" ")}
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="finance-categories-view__month-nav-btn"
        aria-label="Previous month"
        disabled={disabled}
        onClick={() => onChange?.(shiftMonthKey(current, -1))}
      >
        <ChevronLeftIcon size={16} />
      </button>
      <span className="finance-categories-view__month-nav-label">
        {formatMonthLong(current)}
      </span>
      <button
        type="button"
        className="finance-categories-view__month-nav-btn"
        aria-label="Next month"
        disabled={disabled || !canGoNext}
        onClick={() => {
          if (!canGoNext) return;
          onChange?.(shiftMonthKey(current, 1));
        }}
      >
        <ChevronRightIcon size={16} />
      </button>
    </div>
  );
}

export function localCalendarYear(asOf = new Date()): number {
  return asOf.getFullYear();
}

export type FinanceYearNavigatorProps = {
  year: number;
  /** Furthest year the next-arrow may reach (usually the current calendar year). */
  latestYear: number;
  /** Earliest year the previous-arrow may reach (defaults to 1970). */
  earliestYear?: number;
  onChange?: (year: number) => void;
  /** Accessible name for the control group. */
  "aria-label"?: string;
  className?: string;
};

/**
 * Same chrome as {@link FinanceMonthNavigator}, stepped by calendar year.
 */
export function FinanceYearNavigator({
  year,
  latestYear,
  earliestYear = 1970,
  onChange,
  "aria-label": ariaLabel = "Invoice year",
  className,
}: FinanceYearNavigatorProps) {
  const current = Number.isFinite(year) ? Math.trunc(year) : latestYear;
  const canGoPrev = current > earliestYear;
  const canGoNext = current < latestYear;
  const disabled = !onChange;

  return (
    <div
      className={["finance-categories-view__month-nav", className]
        .filter(Boolean)
        .join(" ")}
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="finance-categories-view__month-nav-btn"
        aria-label="Previous year"
        disabled={disabled || !canGoPrev}
        onClick={() => {
          if (!canGoPrev) return;
          onChange?.(current - 1);
        }}
      >
        <ChevronLeftIcon size={16} />
      </button>
      <span className="finance-categories-view__month-nav-label">{current}</span>
      <button
        type="button"
        className="finance-categories-view__month-nav-btn"
        aria-label="Next year"
        disabled={disabled || !canGoNext}
        onClick={() => {
          if (!canGoNext) return;
          onChange?.(current + 1);
        }}
      >
        <ChevronRightIcon size={16} />
      </button>
    </div>
  );
}
