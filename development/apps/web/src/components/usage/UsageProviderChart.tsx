import type { UsageProviderKind } from "@t3tools/contracts";
import { useMemo } from "react";

import type { DailyTotals, HourlyTotals } from "@t3tools/shared/usageMerge";
import {
  formatDayShort,
  formatHourShort,
  formatRelativeHourShort,
  formatTokens,
  formatUsd,
} from "@t3tools/shared/usageFormat";
import { PROVIDER_ORDER, PROVIDER_PRESENTATION } from "./usageProviders";
import { niceScale, UsageSeriesChart, type UsageSeriesColumn } from "./UsageSeriesChart";

export type UsageChartMetric = "tokens" | "cost";

// Re-export for existing chart tests / callers.
export { niceScale };

interface UsageProviderChartProps {
  readonly providers: readonly UsageProviderKind[];
  readonly days: readonly string[];
  readonly daily: readonly DailyTotals[];
  readonly hours: readonly string[];
  readonly hourly: readonly HourlyTotals[];
  readonly metric: UsageChartMetric;
  readonly referenceTime: string | undefined;
  readonly resolution: "day" | "hour";
  readonly timeZone: string;
}

/** One day's per-provider values, shared by the paths and the hover readout. */
export interface DayColumn {
  readonly bands: readonly {
    readonly provider: UsageProviderKind;
    readonly value: number;
  }[];
  readonly total: number;
}

function valueFor(
  totals: DailyTotals | HourlyTotals | undefined,
  provider: UsageProviderKind,
  metric: UsageChartMetric,
): number {
  const entry = totals?.byProvider.get(provider);
  if (entry === undefined) return 0;
  return metric === "tokens" ? entry.totalTokens : entry.costUsd;
}

function buildPeriodColumns(
  periods: readonly string[],
  byPeriod: ReadonlyMap<string, DailyTotals | HourlyTotals>,
  metric: UsageChartMetric,
): readonly DayColumn[] {
  return periods.map((period) => {
    const entry = byPeriod.get(period);
    const bands = PROVIDER_ORDER.map((provider) => ({
      provider,
      value: valueFor(entry, provider, metric),
    }));
    return { bands, total: bands.reduce((sum, band) => sum + band.value, 0) };
  });
}

/**
 * Turns the merged daily totals into one column per day.
 *
 * Values are absolute, not cumulative: each provider is drawn from the same
 * zero baseline so the chart never implies that one provider is always larger.
 */
export function buildDayColumns(
  days: readonly string[],
  byDay: ReadonlyMap<string, DailyTotals>,
  metric: UsageChartMetric,
): readonly DayColumn[] {
  return buildPeriodColumns(days, byDay, metric);
}

export function UsageProviderChart({
  providers,
  days,
  daily,
  hours,
  hourly,
  metric,
  referenceTime,
  resolution,
  timeZone,
}: UsageProviderChartProps) {
  const periods = resolution === "hour" ? hours : days;
  const byPeriod = useMemo(
    () =>
      resolution === "hour"
        ? new Map(hourly.map((entry) => [entry.hourStart, entry]))
        : new Map(daily.map((entry) => [entry.day, entry])),
    [daily, hourly, resolution],
  );

  const columns = useMemo((): readonly UsageSeriesColumn[] => {
    return buildPeriodColumns(periods, byPeriod, metric).map((column) => ({
      total: column.total,
      bands: column.bands.map((band) => ({ id: band.provider, value: band.value })),
    }));
  }, [byPeriod, metric, periods]);

  const series = useMemo(
    () =>
      providers.map((provider) => ({
        id: provider,
        label: PROVIDER_PRESENTATION[provider].label,
        color: PROVIDER_PRESENTATION[provider].color,
        mark: PROVIDER_PRESENTATION[provider].mark,
      })),
    [providers],
  );

  const format = metric === "tokens" ? formatTokens : formatUsd;
  const formatPeriod = (period: string) =>
    resolution === "hour" ? formatHourShort(period, timeZone) : formatDayShort(period);
  const formatTooltipPeriod = (period: string) =>
    resolution === "hour" && referenceTime !== undefined
      ? formatRelativeHourShort(period, referenceTime, timeZone)
      : formatPeriod(period);

  return (
    <UsageSeriesChart
      periods={periods}
      series={series}
      columns={columns}
      formatValue={format}
      formatPeriod={formatPeriod}
      formatTooltipPeriod={formatTooltipPeriod}
      ariaLabel={`${resolution === "hour" ? "Hourly" : "Daily"} ${metric === "tokens" ? "processed tokens" : "cost"} by provider`}
    />
  );
}
