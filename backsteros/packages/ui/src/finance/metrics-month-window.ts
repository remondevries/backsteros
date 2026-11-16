/**
 * Continuous calendar-month helpers for category/recurring charts and averages.
 */

/** Last `count` calendar months ending at `endMonth` (YYYY-MM), inclusive. */
export function continuousMonthWindow(
  endMonth: string,
  count = 12,
): string[] {
  const match = /^(\d{4})-(\d{2})$/.exec(endMonth.trim());
  if (!match) return [];
  let year = Number(match[1]);
  let month = Number(match[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return [];
  const keys: string[] = [];
  for (let i = 0; i < count; i += 1) {
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
  }
  return keys.reverse();
}

/**
 * Average-monthly denominator for a calendar year of activity.
 *
 * Denominator is calendar months in `year` within the period **account (or
 * workspace) data covers** — not the category/recurring's own first/last sparse
 * months. When `coverageMonthKeys` is omitted, past years use the full year
 * (12) and the current year uses Jan → last completed month.
 */
export function averageMonthlyDenominator(options: {
  year: number;
  /** Months with category/recurring activity (year needs ≥1 to be non-zero). */
  monthKeysWithData: readonly string[];
  /**
   * Months the parent account / workspace has any booked activity. When set,
   * first→last of these keys in `year` (clamped for the current year) is the
   * denominator.
   */
  coverageMonthKeys?: readonly string[];
  now?: Date;
}): number {
  const now = options.now ?? new Date();
  const hasActivity = options.monthKeysWithData.some((key) =>
    key.startsWith(`${options.year}-`),
  );
  if (!hasActivity) return 0;

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (options.year > currentYear) return 0;

  const coverageSource = options.coverageMonthKeys ?? null;
  const coverageMonths = (coverageSource ?? [])
    .filter((key) => key.startsWith(`${options.year}-`))
    .map((key) => Number(key.slice(5)))
    .filter((month) => month >= 1 && month <= 12)
    .sort((a, b) => a - b);

  let first: number;
  let last: number;

  if (coverageMonths.length > 0) {
    first = coverageMonths[0]!;
    last = coverageMonths[coverageMonths.length - 1]!;
  } else if (coverageSource != null) {
    // Explicit empty coverage → no months to average over.
    return 0;
  } else if (options.year < currentYear) {
    // No account coverage provided: assume the account spans the full year.
    first = 1;
    last = 12;
  } else {
    first = 1;
    last = Math.max(1, currentMonth - 1) || 1;
  }

  if (options.year === currentYear) {
    const completed = Math.max(0, currentMonth - 1);
    if (completed === 0) {
      // Still in January — keep a 1-month denominator.
      last = Math.max(first, 1);
    } else {
      last = Math.min(last, completed);
    }
    if (last < first) return 0;
  }

  return Math.max(1, last - first + 1);
}

/** Zero-fill a continuous window from sparse month→cents totals. */
export function zeroFillMonthSpend(
  endMonth: string,
  sparse: ReadonlyMap<string, number>,
  count = 12,
): Array<{ month: string; spentCents: number }> {
  return continuousMonthWindow(endMonth, count).map((month) => ({
    month,
    spentCents: sparse.get(month) ?? 0,
  }));
}
