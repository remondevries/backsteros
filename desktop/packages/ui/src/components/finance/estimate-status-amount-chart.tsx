"use client";

import { useAnimatedPath } from "@nivo/core";
import {
  ResponsiveLine,
  type DefaultSeries,
  type LineCustomSvgLayerProps,
} from "@nivo/line";
import { animated, useSpring } from "@react-spring/web";
import { useId, useMemo } from "react";

import {
  buildEstimateStatusAmountChartSeries,
  buildEstimateStatusMonthContributions,
  estimateStatusAmountChartHasData,
  type EstimateChartEstimate,
  type EstimateStatusChartContribution,
  type EstimateStatusChartSeries,
} from "../../finance/estimate-amount-chart-series.js";
import {
  CLIENT_ESTIMATE_STATUS_ORDER,
  type ClientEstimateStatus,
} from "../../finance/estimate-status.js";
import { FinanceChartTooltip } from "./finance-chart-tooltip.js";
import {
  FinanceChartEmpty,
  FinanceChartFadeIn,
  FinanceChartLoading,
} from "./finance-chart-status.js";

export type EstimateStatusAmountChartProps = {
  estimates: ReadonlyArray<EstimateChartEstimate>;
  year: number;
  asOf?: Date;
  loading?: boolean;
  className?: string;
  emptyMessage?: string;
  ariaLabel?: string;
};

const CHART_MOTION = {
  mass: 1,
  tension: 170,
  friction: 26,
  clamp: false,
} as const;

const CHART_MARGIN = { top: 12, right: 16, bottom: 32, left: 56 } as const;

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

function formatEuroCents(cents: number): string {
  return formatEuro(cents / 100);
}

function EstimateMonthSliceTooltip({
  monthKey,
  monthLabel,
  points,
  labelById,
  colorById,
  contributions,
}: {
  monthKey: string;
  monthLabel: string;
  points: ReadonlyArray<{
    id: string | number;
    seriesId: string | number;
    seriesColor: string;
    data: { y: unknown };
  }>;
  labelById: Map<string, string>;
  colorById: Map<string, string>;
  contributions: readonly EstimateStatusChartContribution[];
}) {
  const byStatus = new Map<ClientEstimateStatus, EstimateStatusChartContribution[]>();
  for (const row of contributions) {
    if (row.month !== monthKey) continue;
    const list = byStatus.get(row.status) ?? [];
    list.push(row);
    byStatus.set(row.status, list);
  }

  const statusOrder = new Map(
    CLIENT_ESTIMATE_STATUS_ORDER.map((status, index) => [status, index]),
  );

  const activePoints = points
    .filter(
      (point) =>
        point.data.y != null &&
        Number.isFinite(Number(point.data.y)) &&
        Number(point.data.y) > 0,
    )
    .sort((a, b) => {
      const aStatus = String(a.seriesId) as ClientEstimateStatus;
      const bStatus = String(b.seriesId) as ClientEstimateStatus;
      return (statusOrder.get(aStatus) ?? 99) - (statusOrder.get(bStatus) ?? 99);
    });

  return (
    <FinanceChartTooltip className="finance-accounts-view__chart-tooltip finance-estimates-view__chart-tooltip">
      <div className="finance-accounts-view__chart-tooltip-title">
        {monthLabel}
      </div>
      {activePoints.map((point) => {
        const id = String(point.seriesId);
        const status = id as ClientEstimateStatus;
        const items = byStatus.get(status) ?? [];
        const color = colorById.get(id) ?? point.seriesColor;
        return (
          <div
            key={point.id}
            className="finance-estimates-view__chart-tooltip-group"
          >
            <div className="finance-accounts-view__chart-tooltip-row">
              <span
                className="finance-accounts-view__chart-tooltip-swatch"
                style={{
                  background: color,
                  borderColor: color,
                }}
              />
              <span>{labelById.get(id) ?? id}</span>
              <strong>{formatEuro(Number(point.data.y))}</strong>
            </div>
            {items.map((item) => (
              <div
                key={item.id}
                className="finance-estimates-view__chart-tooltip-item"
              >
                <span className="finance-estimates-view__chart-tooltip-item-id">
                  {item.displayId}
                </span>
                <span
                  className="finance-estimates-view__chart-tooltip-item-title"
                  title={item.title}
                >
                  {item.title}
                </span>
                <strong>{formatEuroCents(item.amountCents)}</strong>
              </div>
            ))}
          </div>
        );
      })}
    </FinanceChartTooltip>
  );
}

function readCssColor(variable: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  return value || fallback;
}

function AnimatedArea({
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

function AnimatedLine({
  path,
  color,
  dashed = false,
}: {
  path: string;
  color: string;
  dashed?: boolean;
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
      strokeDasharray={dashed ? "6 5" : undefined}
    />
  );
}

function ChartAreas({
  series,
  areaGenerator,
  gradientIdBySeries,
}: LineCustomSvgLayerProps<DefaultSeries> & {
  gradientIdBySeries: ReadonlyMap<string, string>;
}) {
  return (
    <g>
      {series.map((serie) => {
        const defined = serie.data.filter(
          (point) =>
            point.data.y != null && Number.isFinite(Number(point.data.y)),
        );
        if (defined.length < 2) return null;
        const path = areaGenerator(
          defined.map((point) => ({
            x: point.position.x,
            y: point.position.y,
          })),
        );
        if (!path) return null;
        const id = String(serie.id);
        const color = serie.color ?? "#888";
        const gradientId =
          gradientIdBySeries.get(id) ?? `estimate-area-${id}`;
        return (
          <g key={`area-${id}`}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                <stop offset="60%" stopColor={color} stopOpacity={0.05} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <AnimatedArea path={path} gradientId={gradientId} />
          </g>
        );
      })}
    </g>
  );
}

function ChartLines({
  series,
  lineGenerator,
}: LineCustomSvgLayerProps<DefaultSeries>) {
  return (
    <g>
      {series.map((serie) => {
        const defined = serie.data.filter(
          (point) =>
            point.data.y != null && Number.isFinite(Number(point.data.y)),
        );
        if (defined.length < 2) return null;
        const path = lineGenerator(
          defined.map((point) => ({
            x: point.position.x,
            y: point.position.y,
          })),
        );
        if (!path) return null;
        const id = String(serie.id);
        // Concept (backlog-style) and declined use a dashed stroke.
        const dashed =
          id === "concept" || id === "declined" || id === "backlog";
        return (
          <AnimatedLine
            key={id}
            path={path}
            color={serie.color ?? "#888"}
            dashed={dashed}
          />
        );
      })}
    </g>
  );
}

function ChartPoint({
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
  const background = readCssColor("--background", "#111");
  return (
    <g>
      <animated.circle
        cx={style.cx}
        cy={style.cy}
        r={4}
        fill={background}
        stroke={color}
        strokeWidth={2}
      />
      <animated.circle cx={style.cx} cy={style.cy} r={1.75} fill={color} />
    </g>
  );
}

function ChartMonthPoints({
  series,
}: LineCustomSvgLayerProps<DefaultSeries>) {
  return (
    <g>
      {series.map((serie) =>
        serie.data.map((point, index) => {
          if (point.data.y == null || !Number.isFinite(Number(point.data.y))) {
            return null;
          }
          // Skip zero markers so sparse status lines stay readable.
          if (Number(point.data.y) === 0) return null;
          return (
            <ChartPoint
              key={`${String(serie.id)}-${index}`}
              x={point.position.x}
              y={point.position.y}
              color={serie.color ?? "#888"}
            />
          );
        }),
      )}
    </g>
  );
}

export function EstimateStatusAmountChart({
  estimates,
  year,
  asOf,
  loading = false,
  className,
  emptyMessage,
  ariaLabel = "Estimate totals by status",
}: EstimateStatusAmountChartProps) {
  const idBase = useId().replace(/:/g, "");
  const sectionClass = ["finance-accounts-view__chart", className]
    .filter(Boolean)
    .join(" ");

  const series = useMemo(
    () =>
      buildEstimateStatusAmountChartSeries({
        estimates,
        year,
        asOf,
        fullYear: true,
      }),
    [asOf, estimates, year],
  );

  const contributions = useMemo(
    () => buildEstimateStatusMonthContributions(estimates, year),
    [estimates, year],
  );

  const hasActivity = estimateStatusAmountChartHasData(series);
  const paints = useMemo(() => {
    const muted = readCssColor("--muted", "#888");
    const foreground = readCssColor("--foreground", "#111");
    const background = readCssColor("--background", "#fff");
    return { muted, foreground, background };
  }, []);

  const theme = useMemo(
    () => ({
      background: "transparent",
      text: { fill: paints.muted, fontSize: 11 },
      axis: {
        domain: { line: { stroke: "transparent", strokeWidth: 0 } },
        ticks: {
          line: { stroke: "transparent", strokeWidth: 0 },
          text: { fill: paints.muted, fontSize: 11 },
        },
        legend: { text: { fill: paints.muted, fontSize: 11 } },
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

  const labelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const line of series) map.set(line.id, line.label);
    return map;
  }, [series]);

  const colorById = useMemo(() => {
    const map = new Map<string, string>();
    for (const line of series) map.set(line.id, line.color);
    return map;
  }, [series]);

  const gradientIdBySeries = useMemo(() => {
    const map = new Map<string, string>();
    for (const line of series) {
      map.set(line.id, `estimate-area-${line.id}-${idBase}`);
    }
    return map;
  }, [idBase, series]);

  if (loading && estimates.length === 0) {
    return (
      <section className={sectionClass} aria-label={ariaLabel}>
        <FinanceChartLoading />
      </section>
    );
  }

  if (!hasActivity) {
    return (
      <section className={sectionClass} aria-label={ariaLabel}>
        <FinanceChartEmpty>
          {emptyMessage ?? `No dated estimate totals in ${year} yet.`}
        </FinanceChartEmpty>
      </section>
    );
  }

  const labelByX = new Map<string, string>();
  for (const line of series) {
    for (const point of line.data) {
      labelByX.set(point.x, point.label);
    }
  }

  const nivoData: DefaultSeries[] = series.map((line) => ({
    id: line.id,
    data: line.data.map((point) => ({ x: point.x, y: point.y })),
  }));

  const tickValues = series[0]?.data
    .map((point) => point.x)
    .filter((value): value is string => value != null);

  const seriesColors = series.map((line) => line.color);

  return (
    <section className={sectionClass} aria-label={ariaLabel}>
      <FinanceChartFadeIn className="finance-accounts-view__chart-plot">
        <ResponsiveLine
          data={nivoData}
          margin={CHART_MARGIN}
          xScale={{ type: "point" }}
          yScale={{
            type: "linear",
            min: 0,
            max: "auto",
            stacked: false,
            nice: true,
          }}
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
          colors={seriesColors}
          curve="monotoneX"
          animate
          motionConfig={CHART_MOTION}
          useMesh
          enableSlices="x"
          layers={[
            "grid",
            "markers",
            "axes",
            "crosshair",
            (props) => (
              <ChartAreas
                {...props}
                gradientIdBySeries={gradientIdBySeries}
              />
            ),
            ChartLines,
            ChartMonthPoints,
            "slices",
            "mesh",
          ]}
          theme={theme}
          sliceTooltip={({ slice }) => {
            const monthKey = String(slice.points[0]?.data.x ?? "");
            return (
              <EstimateMonthSliceTooltip
                monthKey={monthKey}
                monthLabel={labelByX.get(monthKey) ?? monthKey}
                points={slice.points}
                labelById={labelById}
                colorById={colorById}
                contributions={contributions}
              />
            );
          }}
        />
      </FinanceChartFadeIn>
    </section>
  );
}

export type { EstimateStatusChartSeries };
