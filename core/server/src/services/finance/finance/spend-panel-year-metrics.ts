/**
 * Pure helpers for spend-panel year averages.
 *
 * History bars and totals use one basis (gross expense-kind debits). The
 * average denominator counts only months included in the numerator for that
 * year (selected/in-progress month is included when it appears in history).
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

/**
 * Build up to 3 year metrics from a trailing history window ending at
 * `selectedMonth` (YYYY-MM). Denominator = number of history months in that
 * year (same months that contribute to spendCents).
 */
export function buildSpendPanelYearMetrics(
  history: readonly SpendPanelHistoryRow[],
  selectedMonth: string,
): SpendPanelYearMetric[] {
  const match = /^(\d{4})-(\d{2})$/.exec(selectedMonth);
  if (!match) return [];
  const selectedYear = Number(match[1]);

  const yearSpend = new Map<number, number>();
  const yearMonths = new Map<number, number>();
  for (const row of history) {
    const y = Number(row.month.slice(0, 4));
    if (!Number.isFinite(y)) continue;
    yearSpend.set(y, (yearSpend.get(y) ?? 0) + row.expenseCents);
    yearMonths.set(y, (yearMonths.get(y) ?? 0) + 1);
  }

  const metricYears = new Set<number>([selectedYear, selectedYear - 1]);
  for (const y of yearSpend.keys()) metricYears.add(y);

  return [...metricYears]
    .sort((a, b) => b - a)
    .filter(
      (y) => (yearSpend.get(y) ?? 0) > 0 || y === selectedYear || y === selectedYear - 1,
    )
    .slice(0, 3)
    .map((y) => {
      const spendCents = yearSpend.get(y) ?? 0;
      const monthsInNumerator = yearMonths.get(y) ?? 0;
      const avgMonthlyCents =
        monthsInNumerator > 0
          ? Math.round(spendCents / monthsInNumerator)
          : 0;
      return { year: y, spendCents, avgMonthlyCents };
    });
}
