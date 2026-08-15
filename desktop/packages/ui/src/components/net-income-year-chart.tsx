"use client";

import type { BankAccountCashflowMonth } from "@backsteros/contracts";
import {
  ResponsiveBar,
  type BarCustomLayerProps,
  type BarDatum,
  type BarTooltipProps,
} from "@nivo/bar";
import { useMemo } from "react";
import { TriangleDownIcon, TriangleUpIcon } from "@primer/octicons-react";

import {
  buildNetIncomeYearChartSeries,
  formatNetIncomeRangeLabel,
  netIncomeYearChartHasData,
  type NetIncomeYearBarPoint,
} from "../net-income-year-chart-series.js";
import {
  handleCashflowBarMonthClick,
  CashflowSelectedMonthBand,
  SelectableCashflowBar,
} from "./cashflow-chart-bars.js";
import {
  FinanceChartEmpty,
  FinanceChartFadeIn,
  FinanceChartLoading,
} from "./finance-chart-status.js";
import { FinanceChartTooltip } from "./finance-chart-tooltip.js";

export type NetIncomeYearChartProps = {
  year: number;
  asOf: string;
  months: BankAccountCashflowMonth[];
  ytdNetCents: number;
  priorYtdNetCents: number;
  loading?: boolean;
  className?: string;
  /** Called when the user clicks a past/present month bar. */
  onMonthSelect?: (month: string) => void;
};

const POSITIVE_COLOR = "#22c55e";
const NEGATIVE_COLOR = "#ef4444";
const CHART_MARGIN = { top: 28, right: 12, bottom: 28, left: 48 } as const;

function formatEuro(value: number, fractionDigits = 0): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: fractionDigits,
    }).format(value);
  } catch {
    return `€${value.toFixed(fractionDigits)}`;
  }
}

function formatEuroAxis(value: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "EUR",
      notation: Math.abs(value) >= 1000 ? "compact" : "standard",
      maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 0,
    }).format(value);
  } catch {
    return formatEuro(value);
  }
}

function formatPercent(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${value.toFixed(digits)}%`;
}

function readCssColor(variable: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  return value || fallback;
}

function parseAsOfDate(asOf: string): Date {
  const [y, m, d] = asOf.split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

function NetIncomeTooltip({
  indexValue,
  data,
  pointsByMonth,
}: Pick<BarTooltipProps<BarDatum>, "indexValue" | "data"> & {
  pointsByMonth: Map<string, NetIncomeYearBarPoint>;
}) {
  const point = pointsByMonth.get(String(indexValue));
  const net = Number(data.net ?? point?.net ?? 0);
  const color = net >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR;
  return (
    <FinanceChartTooltip className="finance-accounts-view__chart-tooltip">
      <div className="finance-accounts-view__chart-tooltip-title">
        {point?.tooltipLabel ?? String(indexValue)}
      </div>
      <div className="finance-accounts-view__chart-tooltip-row">
        <span
          className="finance-accounts-view__chart-tooltip-swatch"
          style={{ background: color, borderColor: color }}
        />
        <span>Net</span>
        <strong>{formatEuro(net, 2)}</strong>
      </div>
    </FinanceChartTooltip>
  );
}

function CumulativeLineLayer({
  bars,
  pointsByMonth,
  yScale,
}: BarCustomLayerProps<BarDatum> & {
  pointsByMonth: Map<string, NetIncomeYearBarPoint>;
}) {
  const activeBars = bars
    .map((bar) => {
      const point = pointsByMonth.get(String(bar.data.indexValue));
      if (!point || point.isFutureMonth) return null;
      return {
        x: bar.x + bar.width / 2,
        y: yScale(point.cumulative),
      };
    })
    .filter((entry): entry is { x: number; y: number } => entry != null);

  if (activeBars.length < 2) return null;
  const path = activeBars
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
  const stroke = readCssColor("--foreground", "#fff");

  return (
    <path
      d={path}
      fill="none"
      stroke={stroke}
      strokeOpacity={0.35}
      strokeWidth={1.25}
      strokeDasharray="3 4"
    />
  );
}

export function NetIncomeYearChart({
  year,
  asOf,
  months,
  ytdNetCents,
  priorYtdNetCents,
  loading = false,
  className,
  onMonthSelect,
}: NetIncomeYearChartProps) {
  const series = useMemo(
    () =>
      buildNetIncomeYearChartSeries({
        year,
        asOf,
        months,
        ytdNetCents,
        priorYtdNetCents,
      }),
    [asOf, months, priorYtdNetCents, year, ytdNetCents],
  );

  const pointsByMonth = useMemo(() => {
    const map = new Map<string, NetIncomeYearBarPoint>();
    for (const point of series.points) map.set(point.month, point);
    return map;
  }, [series.points]);

  const barData: BarDatum[] = useMemo(
    () =>
      series.points.map((point) => ({
        month: point.month,
        net: point.net,
        monthLabel: point.monthLabel,
        isCurrentMonth: point.isCurrentMonth ? 1 : 0,
        isFutureMonth: point.isFutureMonth ? 1 : 0,
      })),
    [series.points],
  );

  const paints = useMemo(() => {
    const muted = readCssColor("--muted", "#888");
    const foreground = readCssColor("--foreground", "#111");
    const background = readCssColor("--background", "#fff");
    return { muted, foreground, background };
  }, []);

  const theme = useMemo(
    () => ({
      background: "transparent",
      text: {
        fill: paints.muted,
        fontSize: 11,
      },
      axis: {
        ticks: {
          text: {
            fill: paints.muted,
            fontSize: 11,
          },
        },
        domain: {
          line: {
            stroke: "transparent",
          },
        },
      },
      grid: {
        line: {
          stroke: paints.muted,
          strokeOpacity: 0.22,
          strokeWidth: 1,
          strokeDasharray: "4 4",
        },
      },
      tooltip: {
        container: {
          background: "transparent",
          boxShadow: "none",
          padding: 0,
        },
      },
    }),
    [paints.muted],
  );

  const asOfDate = parseAsOfDate(asOf);
  const rangeStart = new Date(year, 0, 1);
  const rangeLabel = formatNetIncomeRangeLabel(rangeStart, asOfDate);
  const priorRangeLabel = formatNetIncomeRangeLabel(
    new Date(year - 1, 0, 1),
    new Date(year - 1, asOfDate.getMonth(), asOfDate.getDate()),
  );

  const ytdPositive = series.ytdNetEuros >= 0;
  const change = series.changePercent;
  const changePositive = change == null ? series.ytdNetEuros >= 0 : change >= 0;
  const hasData = netIncomeYearChartHasData(series);

  const sectionClass = [
    "finance-net-income-chart",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={sectionClass} aria-label="Net income">
      <header className="finance-net-income-chart__summary">
        <p className="finance-net-income-chart__range">{rangeLabel}</p>
        <p
          className={[
            "finance-net-income-chart__total",
            ytdPositive
              ? "finance-net-income-chart__total--positive"
              : "finance-net-income-chart__total--negative",
          ].join(" ")}
        >
          {loading ? "…" : formatEuro(series.ytdNetEuros, 2)}
        </p>
        <div className="finance-net-income-chart__compare">
          {change != null ? (
            <span
              className={[
                "finance-net-income-chart__delta",
                changePositive
                  ? "finance-net-income-chart__delta--positive"
                  : "finance-net-income-chart__delta--negative",
              ].join(" ")}
            >
              {changePositive ? (
                <TriangleUpIcon size={12} />
              ) : (
                <TriangleDownIcon size={12} />
              )}
              {formatPercent(Math.abs(change))}
            </span>
          ) : series.ytdNetEuros !== 0 ? (
            <span
              className={[
                "finance-net-income-chart__delta",
                ytdPositive
                  ? "finance-net-income-chart__delta--positive"
                  : "finance-net-income-chart__delta--negative",
              ].join(" ")}
            >
              New
            </span>
          ) : null}
          <span className="finance-net-income-chart__compare-text">
            vs {formatEuro(series.priorYtdNetEuros, 2)} in {priorRangeLabel}
          </span>
        </div>
      </header>

      <div className="finance-net-income-chart__plot">
        {loading ? (
          <FinanceChartLoading />
        ) : !hasData ? (
          <FinanceChartEmpty>
            No income or expense this year yet.
          </FinanceChartEmpty>
        ) : (
          <FinanceChartFadeIn>
          <ResponsiveBar
            data={barData}
            keys={["net"]}
            indexBy="month"
            margin={CHART_MARGIN}
            padding={0.32}
            valueScale={{ type: "linear", nice: true, min: "auto", max: "auto" }}
            indexScale={{ type: "band", round: true }}
            colors={(bar) =>
              Number(bar.data.net) >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR
            }
            borderRadius={4}
            enableLabel={false}
            enableGridX={false}
            enableGridY
            axisTop={null}
            axisRight={null}
            axisBottom={{
              tickSize: 0,
              tickPadding: 10,
              format: (value) =>
                pointsByMonth.get(String(value))?.monthLabel ?? String(value),
            }}
            axisLeft={{
              tickSize: 0,
              tickPadding: 8,
              tickValues: 5,
              format: (value) => formatEuroAxis(Number(value)),
            }}
            theme={theme}
            barComponent={SelectableCashflowBar}
            onClick={(datum, event) =>
              handleCashflowBarMonthClick(datum, event, onMonthSelect)
            }
            layers={[
              "grid",
              CashflowSelectedMonthBand,
              "axes",
              "bars",
              (props) => (
                <CumulativeLineLayer {...props} pointsByMonth={pointsByMonth} />
              ),
              "markers",
              "legends",
              "annotations",
            ]}
            tooltip={(props) => (
              <NetIncomeTooltip {...props} pointsByMonth={pointsByMonth} />
            )}
            role="application"
            ariaLabel="Monthly net income"
          />
          </FinanceChartFadeIn>
        )}
      </div>
    </section>
  );
}
