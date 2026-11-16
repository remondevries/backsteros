/**
 * Pure helpers for spend-panel year averages.
 *
 * History bars and totals use the shared kind-based spending definition.
 * When the selected month is the current calendar month, it is excluded from
 * the average (numerator and denominator) so a partial month does not dilute
 * the completed-month mean.
 */

export type SpendPanelHistoryRow = {
  month: string;
  expenseCents: number;
};

export type SpendPanelYearMetric = {
  year: number;
  spendCents: number;
  avgMonthlyCents: number;
};

function calendarMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Build up to 3 year metrics from a trailing history window ending at
 * `selectedMonth` (YYYY-MM).
 */
export function buildSpendPanelYearMetrics(
  history: readonly SpendPanelHistoryRow[],
  selectedMonth: string,
  now: Date = new Date(),
): SpendPanelYearMetric[] {
  const match = /^(\d{4})-(\d{2})$/.exec(selectedMonth);
  if (!match) return [];
  const selectedYear = Number(match[1]);
  const currentMonthKey = calendarMonthKey(now);
  const excludeInProgress =
    selectedMonth === currentMonthKey ? selectedMonth : null;

  const yearSpend = new Map<number, number>();
  const yearMonths = new Map<number, number>();
  const yearSpendForAvg = new Map<number, number>();
  const yearMonthsForAvg = new Map<number, number>();

  for (const row of history) {
    const y = Number(row.month.slice(0, 4));
    if (!Number.isFinite(y)) continue;
    yearSpend.set(y, (yearSpend.get(y) ?? 0) + row.expenseCents);
    yearMonths.set(y, (yearMonths.get(y) ?? 0) + 1);
    if (excludeInProgress && row.month === excludeInProgress) continue;
    yearSpendForAvg.set(y, (yearSpendForAvg.get(y) ?? 0) + row.expenseCents);
    yearMonthsForAvg.set(y, (yearMonthsForAvg.get(y) ?? 0) + 1);
  }

  const metricYears = new Set<number>([selectedYear, selectedYear - 1]);
  for (const y of yearSpend.keys()) metricYears.add(y);

  return [...metricYears]
    .sort((a, b) => b - a)
    .filter(
      (y) =>
        (yearSpend.get(y) ?? 0) > 0 || y === selectedYear || y === selectedYear - 1,
    )
    .slice(0, 3)
    .map((y) => {
      const spendCents = yearSpend.get(y) ?? 0;
      const monthsInAvg = yearMonthsForAvg.get(y) ?? 0;
      const spendForAvg = yearSpendForAvg.get(y) ?? 0;
      const avgMonthlyCents =
        monthsInAvg > 0 ? Math.round(spendForAvg / monthsInAvg) : 0;
      return { year: y, spendCents, avgMonthlyCents };
    });
}
