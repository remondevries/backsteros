"use client";

import type { FinancialTransaction } from "@backsteros/contracts";
import { useAnimatedPath } from "@nivo/core";
import {
  ResponsiveLine,
  type DefaultSeries,
  type LineCustomSvgLayerProps,
} from "@nivo/line";
import { animated, useSpring } from "@react-spring/web";
import { useId, useMemo } from "react";

import {
  FinanceChartEmpty,
  FinanceChartFadeIn,
  FinanceChartLoading,
} from "./finance-chart-status.js";
import { FinanceChartTooltip } from "./finance-chart-tooltip.js";

const SERIES_ID = "Amount";

const CHART_MOTION = {
  mass: 1,
  tension: 170,
  friction: 26,
  clamp: false,
} as const;

const CHART_MARGIN = { top: 12, right: 16, bottom: 28, left: 56 } as const;

function readCssColor(variable: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  return value || fallback;
}

function formatEuro(value: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `€${value.toFixed(0)}`;
  }
}

function formatEuroAxis(value: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "EUR",
      notation: Math.abs(value) >= 1000 ? "compact" : "standard",
      maximumFractionDigits: Math.abs(value) >= 1000 ? 1 : 0,
    }).format(value);
  } catch {
    return formatEuro(value);
  }
}

function formatDayLabel(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
    }).format(date);
  } catch {
    return `${Number(match[3])}/${Number(match[2])}`;
  }
}

function formatTooltipLabel(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date);
  } catch {
    return formatDayLabel(iso);
  }
}

export type RecurringYearChartProps = {
  year?: number;
  transactions: FinancialTransaction[];
  /** Expected recurring amount in cents — drawn as a dashed horizontal target. */
  targetAmountCents?: number | null;
  loading?: boolean;
  className?: string;
};

type ChartPoint = {
  x: string;
  y: number;
  label: string;
  tooltipLabel: string;
};

function buildPoints(
  year: number,
  transactions: FinancialTransaction[],
): ChartPoint[] {
  return transactions
    .filter((tx) => tx.bookedOn.startsWith(String(year)))
    .slice()
    .sort((a, b) =>
      a.bookedOn < b.bookedOn ? -1 : a.bookedOn > b.bookedOn ? 1 : 0,
    )
    .map((tx) => ({
      x: tx.bookedOn,
      y: Math.abs(tx.amountCents) / 100,
      label: formatDayLabel(tx.bookedOn),
      tooltipLabel: formatTooltipLabel(tx.bookedOn),
    }));
}

function RecurringChartAnimatedArea({
  path,
  gradientId,
}: {
  path: string;
  gradientId: string;
}) {
  const animatedPath = useAnimatedPath(path);
  return (
    <animated.path
      d={animatedPath as unknown as string}
      fill={`url(#${gradientId})`}
      strokeWidth={0}
    />
  );
}

function RecurringChartArea({
  series,
  areaGenerator,
  gradientId,
  color,
}: LineCustomSvgLayerProps<DefaultSeries> & {
  gradientId: string;
  color: string;
}) {
  const line = series[0];
  if (!line || line.data.length < 2) return null;
  const path = areaGenerator(
    line.data.map((point) => ({
      x: point.position.x,
      y: point.position.y,
    })),
  );
  if (!path) return null;
  return (
    <g>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.14} />
          <stop offset="55%" stopColor={color} stopOpacity={0.04} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <RecurringChartAnimatedArea path={path} gradientId={gradientId} />
    </g>
  );
}

function RecurringChartAnimatedLine({
  path,
  color,
}: {
  path: string;
  color: string;
}) {
  const animatedPath = useAnimatedPath(path);
  return (
    <animated.path
      d={animatedPath as unknown as string}
      fill="none"
      stroke={color}
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function RecurringChartLines({
  series,
  lineGenerator,
}: LineCustomSvgLayerProps<DefaultSeries>) {
  return (
    <g>
      {series.map((serie) => {
        const path = lineGenerator(
          serie.data.map((point) => ({
            x: point.position.x,
            y: point.position.y,
          })),
        );
        if (!path) return null;
        return (
          <RecurringChartAnimatedLine
            key={String(serie.id)}
            path={path}
            color={serie.color ?? "#888"}
          />
        );
      })}
    </g>
  );
}

function RecurringChartAnimatedPoint({
  x,
  y,
  color,
}: {
  x: number;
  y: number;
  color: string;
}) {
  const style = useSpring({
    to: { cx: x, cy: y },
    config: CHART_MOTION,
  });
  return (
    <animated.circle
      cx={style.cx}
      cy={style.cy}
      r={3}
      fill={readCssColor("--background", "#fff")}
      stroke={color}
      strokeWidth={1.75}
    />
  );
}

function RecurringChartPoints({
  series,
}: LineCustomSvgLayerProps<DefaultSeries>) {
  return (
    <g>
      {series.flatMap((serie) =>
        serie.data.length > 24
          ? []
          : serie.data.map((point, index) => (
              <RecurringChartAnimatedPoint
                key={`${String(serie.id)}-${index}-${String(point.data.x)}`}
                x={point.position.x}
                y={point.position.y}
                color={serie.color ?? "#888"}
              />
            )),
      )}
    </g>
  );
}

export function RecurringYearChart({
  year = new Date().getFullYear(),
  transactions,
  targetAmountCents = null,
  loading = false,
  className,
}: RecurringYearChartProps) {
  const gradientId = `recurring-area-${useId().replace(/:/g, "")}`;
  const sectionClass = ["finance-recurrings-view__chart", className]
    .filter(Boolean)
    .join(" ");
  const points = useMemo(
    () => buildPoints(year, transactions),
    [transactions, year],
  );
  const targetEuro = useMemo(() => {
    if (targetAmountCents == null || targetAmountCents <= 0) return null;
    return targetAmountCents / 100;
  }, [targetAmountCents]);
  const yMax = useMemo(() => {
    const dataMax = points.reduce((max, point) => Math.max(max, point.y), 0);
    if (targetEuro == null) return dataMax > 0 ? dataMax : "auto";
    return Math.max(dataMax, targetEuro);
  }, [points, targetEuro]);
  const nivoData: DefaultSeries[] = useMemo(
    () =>
      points.length
        ? [
            {
              id: SERIES_ID,
              data: points.map((point) => ({ x: point.x, y: point.y })),
            },
          ]
        : [],
    [points],
  );
  const labelByX = useMemo(() => {
    const map = new Map<string, string>();
    for (const point of points) map.set(point.x, point.label);
    return map;
  }, [points]);
  const tooltipLabelByX = useMemo(() => {
    const map = new Map<string, string>();
    for (const point of points) map.set(point.x, point.tooltipLabel);
    return map;
  }, [points]);

  const paints = useMemo(() => {
    const muted = readCssColor("--muted", "#888");
    const foreground = readCssColor("--foreground", "#111");
    const background = readCssColor("--background", "#fff");
    return { muted, foreground, background, line: foreground };
  }, []);

  const markers = useMemo(() => {
    if (targetEuro == null) return [];
    return [
      {
        axis: "y" as const,
        value: targetEuro,
        legend: "Amount",
        legendPosition: "top-left" as const,
        legendOrientation: "horizontal" as const,
        lineStyle: {
          stroke: paints.muted,
          strokeWidth: 1.5,
          strokeDasharray: "6 5",
          strokeOpacity: 0.9,
        },
        textStyle: {
          fill: paints.muted,
          fontSize: 11,
          fontWeight: 500,
        },
      },
    ];
  }, [paints.muted, targetEuro]);

  const AreaLayer = useMemo(
    () =>
      function AreaLayerInner(props: LineCustomSvgLayerProps<DefaultSeries>) {
        return (
          <RecurringChartArea
            {...props}
            gradientId={gradientId}
            color={paints.line}
          />
        );
      },
    [gradientId, paints.line],
  );

  const theme = useMemo(
    () => ({
      background: "transparent",
      text: {
        fill: paints.muted,
        fontSize: 11,
      },
      axis: {
        domain: {
          line: { stroke: "transparent" },
        },
        ticks: {
          line: { stroke: "transparent" },
          text: { fill: paints.muted, fontSize: 11 },
        },
      },
      grid: {
        line: {
          stroke: paints.muted,
          strokeOpacity: 0.1,
          strokeWidth: 1,
        },
      },
      crosshair: {
        line: {
          stroke: readCssColor("--keyboard-nav-highlight-color", "#ee7a47"),
          strokeWidth: 1.5,
          strokeOpacity: 0.95,
          strokeDasharray: "3 4",
        },
      },
      tooltip: {
        container: {
          background: paints.background,
          color: paints.foreground,
          fontSize: 12,
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
          padding: "8px 10px",
          border: `1px solid color-mix(in srgb, ${paints.foreground} 10%, transparent)`,
        },
      },
    }),
    [paints],
  );

  if (loading) {
    return (
      <section className={sectionClass} aria-label="Recurring year chart">
        <FinanceChartLoading />
      </section>
    );
  }

  if (nivoData.length === 0) {
    return (
      <section className={sectionClass} aria-label="Recurring year chart">
        <FinanceChartEmpty>
          No linked transactions in {year} yet.
        </FinanceChartEmpty>
      </section>
    );
  }

  const tickValues =
    points.length > 8
      ? points
          .filter((_, index, all) => {
            const step = Math.ceil(all.length / 6);
            return index % step === 0 || index === all.length - 1;
          })
          .map((point) => point.x)
      : undefined;

  return (
    <section className={sectionClass} aria-label="Recurring year chart">
      <FinanceChartFadeIn className="finance-recurrings-view__chart-plot">
        <ResponsiveLine
          data={nivoData}
          margin={CHART_MARGIN}
          xScale={{ type: "point" }}
          yScale={{
            type: "linear",
            min: 0,
            max: yMax,
            stacked: false,
            nice: true,
          }}
          axisTop={null}
          axisRight={null}
          axisBottom={{
            tickSize: 0,
            tickPadding: 10,
            format: (value) => labelByX.get(String(value)) ?? String(value),
            tickValues,
          }}
          axisLeft={{
            tickSize: 0,
            tickPadding: 8,
            format: (value) => formatEuroAxis(Number(value)),
            tickValues: 4,
          }}
          enableGridX={false}
          enableGridY
          enablePoints={false}
          enableArea={false}
          colors={[paints.line]}
          curve="monotoneX"
          animate
          motionConfig={CHART_MOTION}
          useMesh
          enableSlices="x"
          markers={markers}
          layers={[
            "grid",
            "markers",
            "axes",
            "crosshair",
            AreaLayer,
            RecurringChartLines,
            RecurringChartPoints,
            "slices",
            "mesh",
          ]}
          theme={theme}
          sliceTooltip={({ slice }) => (
            <FinanceChartTooltip className="finance-accounts-view__chart-tooltip">
              <div className="finance-accounts-view__chart-tooltip-title">
                {tooltipLabelByX.get(String(slice.points[0]?.data.x ?? "")) ??
                  labelByX.get(String(slice.points[0]?.data.x ?? "")) ??
                  String(slice.points[0]?.data.x ?? "")}
              </div>
              {slice.points.map((point) => (
                <div
                  key={point.id}
                  className="finance-accounts-view__chart-tooltip-row"
                >
                  <span
                    className="finance-accounts-view__chart-tooltip-swatch"
                    style={{
                      background: point.seriesColor,
                      borderColor: point.seriesColor,
                    }}
                  />
                  <span>{point.seriesId}</span>
                  <strong>{formatEuro(Number(point.data.y))}</strong>
                </div>
              ))}
              {targetEuro != null ? (
                <div className="finance-accounts-view__chart-tooltip-row">
                  <span
                    className="finance-accounts-view__chart-tooltip-swatch finance-accounts-view__chart-tooltip-swatch--dashed"
                    style={{
                      background: "transparent",
                      borderColor: paints.muted,
                    }}
                  />
                  <span>Amount</span>
                  <strong>{formatEuro(targetEuro)}</strong>
                </div>
              ) : null}
            </FinanceChartTooltip>
          )}
        />
      </FinanceChartFadeIn>
    </section>
  );
}
