import type { ClientEstimate } from "@backsteros/contracts";

import {
  formatDueDateInputValue,
  parseDueDateInputValue,
} from "../tasks/task-due-date.js";
import {
  CLIENT_ESTIMATE_STATUS_LABELS,
  CLIENT_ESTIMATE_STATUS_ORDER,
  formatEstimateDisplayId,
  migrateClientEstimateStatus,
  type ClientEstimateStatus,
} from "./estimate-status.js";

export type EstimateChartEstimate = Pick<
  ClientEstimate,
  "documentDate" | "totalAmountCents" | "status"
> &
  Partial<Pick<ClientEstimate, "id" | "number" | "title">>;

/** One estimate contributing to a month/status chart bucket. */
export type EstimateStatusChartContribution = {
  id: string;
  displayId: string;
  title: string;
  status: ClientEstimateStatus;
  /** Calendar month key `YYYY-MM`. */
  month: string;
  amountCents: number;
};

/**
 * Prefer ISO / YYYY-MM-DD. Free-text labels (e.g. "oktober 2026") return null
 * so they are not loosely parsed by `Date` into wrong months.
 */
export function parseEstimateDocumentDate(
  value: string | null | undefined,
): Date | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    return parseDueDateInputValue(isoMatch[1]!);
  }
  // Allow values that already normalize to a strict YMD via the due-date helper
  // only when the input itself looks date-like (digits / separators).
  if (!/^\d/.test(trimmed)) return null;
  const ymd = formatDueDateInputValue(trimmed);
  return ymd ? parseDueDateInputValue(ymd) : null;
}

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function monthLabel(year: number, monthIndex: number): string {
  const date = new Date(year, monthIndex, 1);
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short" }).format(date);
  } catch {
    return String(monthIndex + 1);
  }
}

function centsToEuros(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Chart line colors aligned with task-status palette:
 * concept → white (ready_to_start), in review → green, approved → completed,
 * declined → red (dashed like backlog).
 */
export const ESTIMATE_STATUS_CHART_COLORS: Record<
  ClientEstimateStatus,
  string
> = {
  concept: "#ffffff",
  in_review: "#52a450",
  approved: "#606acc",
  declined: "#ef4444",
};

export type EstimateStatusChartPoint = {
  x: string;
  label: string;
  /** Euro total for the month; `null` for future months on a full-year axis. */
  y: number | null;
};

export type EstimateStatusChartSeries = {
  id: ClientEstimateStatus;
  label: string;
  color: string;
  data: EstimateStatusChartPoint[];
};

function contributionFallbackKey(
  estimate: EstimateChartEstimate,
  monthIndex: number,
): string {
  return [
    estimate.documentDate ?? "",
    estimate.status,
    estimate.totalAmountCents ?? 0,
    monthIndex,
  ].join(":");
}

/**
 * Estimates that land in `year`, ready for chart tooltip breakdowns.
 * Sorted by amount descending within the year.
 */
export function buildEstimateStatusMonthContributions(
  estimates: ReadonlyArray<EstimateChartEstimate>,
  year: number,
): EstimateStatusChartContribution[] {
  const rows: EstimateStatusChartContribution[] = [];
  for (const estimate of estimates) {
    const cents = estimate.totalAmountCents;
    if (cents == null || !Number.isFinite(cents) || cents <= 0) continue;
    const date = parseEstimateDocumentDate(estimate.documentDate);
    if (!date || date.getFullYear() !== year) continue;
    const monthIndex = date.getMonth();
    if (monthIndex < 0 || monthIndex > 11) continue;
    rows.push({
      id: estimate.id ?? `${contributionFallbackKey(estimate, monthIndex)}`,
      displayId: formatEstimateDisplayId(estimate.number),
      title: estimate.title?.trim() || "Untitled",
      status: migrateClientEstimateStatus(estimate.status),
      month: monthKey(year, monthIndex),
      amountCents: Math.round(cents),
    });
  }
  return rows.sort((a, b) => b.amountCents - a.amountCents);
}

/**
 * One line per estimate status: monthly total amounts for `year`.
 * Past/current months without amounts are `0`; future months are `null`.
 */
export function buildEstimateStatusAmountChartSeries(input: {
  estimates: ReadonlyArray<EstimateChartEstimate>;
  year: number;
  asOf?: Date;
  fullYear?: boolean;
}): EstimateStatusChartSeries[] {
  const { estimates, year, asOf = new Date(), fullYear = true } = input;
  const dataLastMonthIndex =
    asOf.getFullYear() === year
      ? asOf.getMonth()
      : year < asOf.getFullYear()
        ? 11
        : 0;
  const axisLastMonthIndex = fullYear ? 11 : dataLastMonthIndex;

  const totals = new Map<ClientEstimateStatus, number[]>();
  for (const status of CLIENT_ESTIMATE_STATUS_ORDER) {
    totals.set(status, new Array<number>(12).fill(0));
  }

  for (const contribution of buildEstimateStatusMonthContributions(
    estimates,
    year,
  )) {
    const monthIndex = Number(contribution.month.slice(5, 7)) - 1;
    if (monthIndex < 0 || monthIndex > 11) continue;
    const bucket = totals.get(contribution.status);
    if (!bucket) continue;
    bucket[monthIndex] =
      (bucket[monthIndex] ?? 0) + contribution.amountCents;
  }

  return CLIENT_ESTIMATE_STATUS_ORDER.map((status) => {
    const bucket = totals.get(status) ?? new Array<number>(12).fill(0);
    const data: EstimateStatusChartPoint[] = [];
    for (let monthIndex = 0; monthIndex <= axisLastMonthIndex; monthIndex++) {
      const hasData = monthIndex <= dataLastMonthIndex;
      data.push({
        x: monthKey(year, monthIndex),
        label: monthLabel(year, monthIndex),
        y: hasData ? centsToEuros(bucket[monthIndex] ?? 0) : null,
      });
    }
    return {
      id: status,
      label: CLIENT_ESTIMATE_STATUS_LABELS[status],
      color: ESTIMATE_STATUS_CHART_COLORS[status],
      data,
    };
  });
}

export function estimateStatusAmountChartHasData(
  series: readonly EstimateStatusChartSeries[],
): boolean {
  return series.some((line) =>
    line.data.some((point) => point.y != null && point.y > 0),
  );
}

/** Years that have at least one estimate with a parseable date. */
export function estimateChartYears(
  estimates: ReadonlyArray<Pick<ClientEstimate, "documentDate">>,
  asOf = new Date(),
): { earliestYear: number; latestYear: number } {
  const currentYear = asOf.getFullYear();
  let earliest = currentYear;
  let latest = currentYear;
  for (const estimate of estimates) {
    const date = parseEstimateDocumentDate(estimate.documentDate);
    if (!date) continue;
    const year = date.getFullYear();
    if (year < earliest) earliest = year;
    if (year > latest) latest = year;
  }
  if (latest < currentYear) latest = currentYear;
  return { earliestYear: earliest, latestYear: latest };
}
