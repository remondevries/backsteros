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
 * Uses the inclusive span from the first month with data to:
 * - past years: last month with data in that year
 * - current year: last completed month (excludes partial current month), or
 *   the first month when still in the opening month
 */
export function averageMonthlyDenominator(options: {
  year: number;
  monthKeysWithData: readonly string[];
  now?: Date;
}): number {
  const now = options.now ?? new Date();
  const inYear = options.monthKeysWithData
    .filter((key) => key.startsWith(`${options.year}-`))
    .map((key) => Number(key.slice(5)))
    .filter((month) => month >= 1 && month <= 12)
    .sort((a, b) => a - b);
  if (inYear.length === 0) return 0;

  const first = inYear[0]!;
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  let last: number;
  if (options.year < currentYear) {
    last = inYear[inYear.length - 1]!;
  } else if (options.year > currentYear) {
    return 0;
  } else {
    // Exclude the in-progress month when possible.
    const completed = Math.max(0, currentMonth - 1);
    last = Math.max(first, Math.min(inYear[inYear.length - 1]!, completed || first));
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
