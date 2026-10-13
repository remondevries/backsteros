import type { BankAccountCashflowMonth } from "@backsteros/contracts";

export type NetIncomeYearBarPoint = {
  /** `YYYY-MM` */
  month: string;
  /** Short axis label, e.g. `Jan` / `Jan 2026` for January. */
  monthLabel: string;
  /** Tooltip label, e.g. `January 2026`. */
  tooltipLabel: string;
  /** Signed net income in euros (income − expense). */
  net: number;
  /** Absolute euros for stacked bipolar rendering helpers. */
  positive: number;
  negative: number;
  /** Running YTD net in euros through this month (calendar months only). */
  cumulative: number;
  isCurrentMonth: boolean;
  isFutureMonth: boolean;
};

export type NetIncomeYearChartSeries = {
  year: number;
  asOf: string;
  points: NetIncomeYearBarPoint[];
  ytdNetEuros: number;
  priorYtdNetEuros: number;
  /** `((ytd - prior) / |prior|) * 100`, or null when prior is 0. */
  changePercent: number | null;
};

function parseAsOfParts(asOf: string): { year: number; month: number; day: number } {
  const [y, m, d] = asOf.split("-").map(Number);
  return {
    year: y || 0,
    month: m || 1,
    day: d || 1,
  };
}

/**
 * Last calendar month that may show real values for `year`.
 * Always at least the selected `asOf` month, and extends through today when
 * browsing an earlier month in the current year (so later months stay visible).
 */
export function resolveCashflowVisibleThroughMonth(
  year: number,
  asOf: string,
  now = new Date(),
): number {
  const asOfParts = parseAsOfParts(asOf);
  let through = asOfParts.year === year ? asOfParts.month : asOfParts.year < year ? 0 : 12;
  if (now.getFullYear() > year) {
    through = 12;
  } else if (now.getFullYear() === year) {
    through = Math.max(through, now.getMonth() + 1);
  }
  return Math.min(12, Math.max(0, through));
}

function monthShortLabel(year: number, monthIndex: number): string {
  const date = new Date(year, monthIndex, 1);
  const month = date.toLocaleDateString(undefined, { month: "short" });
  return monthIndex === 0 ? `${month} ${year}` : month;
}

function monthLongLabel(year: number, monthIndex: number): string {
  const date = new Date(year, monthIndex, 1);
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function formatNetIncomeRangeLabel(from: Date, to: Date): string {
  const sameYear = from.getFullYear() === to.getFullYear();
  const fromLabel = from.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const toLabel = to.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${fromLabel} – ${toLabel}`;
}

export function netIncomeChangePercent(
  ytdNetCents: number,
  priorYtdNetCents: number,
): number | null {
  if (priorYtdNetCents === 0) {
    if (ytdNetCents === 0) return 0;
    return null;
  }
  return ((ytdNetCents - priorYtdNetCents) / Math.abs(priorYtdNetCents)) * 100;
}

export function buildNetIncomeYearChartSeries(input: {
  year: number;
  asOf: string;
  months: BankAccountCashflowMonth[];
  ytdNetCents: number;
  priorYtdNetCents: number;
  /** Override “now” for tests / clock injection. */
  now?: Date;
}): NetIncomeYearChartSeries {
  const asOfParts = parseAsOfParts(input.asOf);
  const visibleThroughMonth = resolveCashflowVisibleThroughMonth(
    input.year,
    input.asOf,
    input.now,
  );
  const byMonth = new Map(input.months.map((row) => [row.month, row]));
  const points: NetIncomeYearBarPoint[] = [];
  let cumulative = 0;

  for (let index = 0; index < 12; index += 1) {
    const month = `${input.year}-${String(index + 1).padStart(2, "0")}`;
    const row = byMonth.get(month);
    const incomeCents = row?.incomeCents ?? 0;
    const expenseCents = row?.expenseCents ?? 0;
    const netCents = incomeCents - expenseCents;
    const net = netCents / 100;
    const isFutureMonth = index + 1 > visibleThroughMonth;
    const isCurrentMonth =
      asOfParts.year === input.year && index + 1 === asOfParts.month;

    if (!isFutureMonth) {
      cumulative += net;
    }

    points.push({
      month,
      monthLabel: monthShortLabel(input.year, index),
      tooltipLabel: monthLongLabel(input.year, index),
      net: isFutureMonth ? 0 : net,
      positive: !isFutureMonth && net > 0 ? net : 0,
      negative: !isFutureMonth && net < 0 ? net : 0,
      cumulative,
      isCurrentMonth,
      isFutureMonth,
    });
  }

  return {
    year: input.year,
    asOf: input.asOf,
    points,
    ytdNetEuros: input.ytdNetCents / 100,
    priorYtdNetEuros: input.priorYtdNetCents / 100,
    changePercent: netIncomeChangePercent(
      input.ytdNetCents,
      input.priorYtdNetCents,
    ),
  };
}

export function netIncomeYearChartHasData(series: NetIncomeYearChartSeries): boolean {
  return series.points.some((point) => point.net !== 0);
}
