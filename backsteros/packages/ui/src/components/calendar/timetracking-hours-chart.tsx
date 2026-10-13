"use client";

import { projectSpendCentsFromTrackedSeconds } from "@backsteros/contracts";
import { useAnimatedPath } from "@nivo/core";
import {
  ResponsiveLine,
  type DefaultSeries,
  type LineCustomSvgLayerProps,
} from "@nivo/line";
import { animated, useSpring } from "@react-spring/web";
import { useId, useMemo } from "react";

import {
  buildTimetrackingHoursChartSeries,
  formatTimetrackingChartHours,
  timetrackingHoursChartHasActivity,
} from "../../calendar/calendar-timetracking-hours-chart-series.js";
import type { TimetrackingEntry } from "../../calendar/calendar-timetracking-entries.js";
import type { TimetrackingPeriod } from "../../calendar/calendar-timetracking-days.js";
import { moneyCentsToInput } from "../../finance/money-input.js";
import { FinanceChartTooltip } from "../finance/finance-chart-tooltip.js";
import {
  FinanceChartEmpty,
  FinanceChartFadeIn,
} from "../finance/finance-chart-status.js";

export type TimetrackingHoursChartProps = {
  entries: readonly TimetrackingEntry[];
  period: TimetrackingPeriod | null;
  className?: string;
  emptyMessage?: string;
  /**
   * Period budget expressed in hours (budget € ÷ hourly rate).
   * Drawn as a dashed red horizontal reference; when set, the series is
   * cumulative so the ceiling shares the same Y units.
   */
  budgetHours?: number | null;
  /** Hourly rate in euro cents — when set, tooltips also show spend. */
  hourlyRateCents?: number | null;
};

function formatEuroCents(cents: number): string {
  return `€${moneyCentsToInput(cents, { alwaysFraction: true, allowZero: true })}`;
}

function spendCentsForChartHours(
  hours: number,
  hourlyRateCents: number | null | undefined,
): number | null {
  if (!Number.isFinite(hours) || hours < 0) return null;
  return projectSpendCentsFromTrackedSeconds(
    Math.round(hours * 3600),
    hourlyRateCents,
  );
}

/** Blue line/area — matches other desktop accent blues. */
const HOURS_COLOR = "#3b82f6";
/** Dashed budget ceiling — same red cue as overspend elsewhere. */
const BUDGET_LINE_COLOR = "#ef4444";
const SERIES_ID = "Hours";

const CHART_MOTION = {
  mass: 1,
  tension: 170,
  friction: 26,
  clamp: false,
} as const;

const CHART_MARGIN = { top: 12, right: 16, bottom: 28, left: 40 } as const;

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

function AnimatedLine({ path, color }: { path: string; color: string }) {
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

function HoursChartAreas({
  series,
  areaGenerator,
  gradientId,
}: LineCustomSvgLayerProps<DefaultSeries> & { gradientId: string }) {
  return (
    <g>
      {series.map((serie) => {
        const defined = serie.data.filter(
          (point) => point.data.y != null && Number.isFinite(Number(point.data.y)),
        );
        if (defined.length < 2) return null;
        const path = areaGenerator(
          defined.map((point) => ({
            x: point.position.x,
            y: point.position.y,
          })),
        );
        if (!path) return null;
        return (
          <g key={String(serie.id)}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={HOURS_COLOR} stopOpacity={0.28} />
                <stop offset="60%" stopColor={HOURS_COLOR} stopOpacity={0.06} />
                <stop offset="100%" stopColor={HOURS_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>
            <AnimatedArea path={path} gradientId={gradientId} />
          </g>
        );
      })}
    </g>
  );
}

function HoursChartLines({
  series,
  lineGenerator,
}: LineCustomSvgLayerProps<DefaultSeries>) {
  return (
    <g>
      {series.map((serie) => {
        const defined = serie.data.filter(
          (point) => point.data.y != null && Number.isFinite(Number(point.data.y)),
        );
        if (defined.length < 2) return null;
        const path = lineGenerator(
          defined.map((point) => ({
            x: point.position.x,
            y: point.position.y,
          })),
        );
        if (!path) return null;
        return (
          <AnimatedLine
            key={String(serie.id)}
            path={path}
            color={serie.color ?? HOURS_COLOR}
          />
        );
      })}
    </g>
  );
}

function HoursChartPoint({
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
        r={5}
        fill={background}
        stroke={color}
        strokeWidth={2}
      />
      <animated.circle cx={style.cx} cy={style.cy} r={2} fill={color} />
    </g>
  );
}

function HoursChartDayPoints({
  series,
}: LineCustomSvgLayerProps<DefaultSeries>) {
  return (
    <g>
      {series.map((serie) =>
        serie.data.map((point, index) => {
          if (point.data.y == null || !Number.isFinite(Number(point.data.y))) {
            return null;
          }
          return (
            <HoursChartPoint
              key={`${String(serie.id)}-${index}`}
              x={point.position.x}
              y={point.position.y}
              color={serie.color ?? HOURS_COLOR}
            />
          );
        }),
      )}
    </g>
  );
}

/**
 * Invoice-style daily hours line for the selected Timetracking period.
 * Day selection plots the containing ISO week so the line has shape.
 */
export function TimetrackingHoursChart({
  entries,
  period,
  className,
  emptyMessage,
  budgetHours = null,
  hourlyRateCents = null,
}: TimetrackingHoursChartProps) {
  const gradientId = `timetracking-hours-area-${useId().replace(/:/g, "")}`;

  const series = useMemo(
    () => buildTimetrackingHoursChartSeries({ entries, period }),
    [entries, period],
  );
  const hasActivity = timetrackingHoursChartHasActivity(series);

  const budgetHoursValue =
    budgetHours != null && Number.isFinite(budgetHours) && budgetHours > 0
      ? budgetHours
      : null;

  /** Period budget is a total — plot cumulative hours so the ceiling matches. */
  const plotSeries = useMemo(() => {
    if (!series || budgetHoursValue == null) return series;
    let running = 0;
    return {
      ...series,
      data: series.data.map((point) => {
        running += point.y;
        return { ...point, y: running };
      }),
    };
  }, [budgetHoursValue, series]);

  const yMax = useMemo(() => {
    if (!plotSeries) return undefined;
    let dataMax = 0;
    for (const point of plotSeries.data) {
      if (Number.isFinite(point.y) && point.y > dataMax) dataMax = point.y;
    }
    const peak = Math.max(dataMax, budgetHoursValue ?? 0);
    if (peak <= 0) return undefined;
    return peak * 1.08;
  }, [budgetHoursValue, plotSeries]);

  const markers = useMemo(() => {
    if (budgetHoursValue == null) return [];
    return [
      {
        axis: "y" as const,
        value: budgetHoursValue,
        legend: "Budget",
        legendPosition: "top-left" as const,
        legendOrientation: "horizontal" as const,
        lineStyle: {
          stroke: BUDGET_LINE_COLOR,
          strokeWidth: 1.5,
          strokeDasharray: "6 5",
          strokeOpacity: 0.95,
        },
        textStyle: {
          fill: BUDGET_LINE_COLOR,
          fontSize: 11,
          fontWeight: 500,
        },
      },
    ];
  }, [budgetHoursValue]);

  const paints = useMemo(() => {
    const muted = readCssColor("--muted", "#888");
    const foreground = readCssColor("--foreground", "#111");
    const background = readCssColor("--background", "#fff");
    return { muted, foreground, background, hours: HOURS_COLOR };
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

  const sectionClass = [
    "calendar-timetracking-hours-chart",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (!period || !series || !plotSeries) {
    return null;
  }

  if (!hasActivity) {
    return (
      <section
        className={sectionClass}
        aria-label="Tracked hours by day"
      >
        <FinanceChartEmpty className="calendar-timetracking-hours-chart__empty">
          {emptyMessage ?? "No tracked hours in this period yet."}
        </FinanceChartEmpty>
      </section>
    );
  }

  const labelByX = new Map(
    plotSeries.data.map((point) => [point.x, point.label] as const),
  );
  const tooltipLabelByX = new Map(
    plotSeries.data.map((point) => [point.x, point.tooltipLabel] as const),
  );

  const nivoData: DefaultSeries[] = [
    {
      id: SERIES_ID,
      data: plotSeries.data.map((point) => ({ x: point.x, y: point.y })),
    },
  ];

  const dense = plotSeries.data.length > 10;
  const tickValues = dense
    ? plotSeries.data
        .filter((_, index, all) => {
          const step = Math.ceil(all.length / 7);
          return index % step === 0 || index === all.length - 1;
        })
        .map((point) => point.x)
    : undefined;

  const chartAriaLabel =
    budgetHoursValue != null
      ? "Cumulative tracked hours with budget"
      : "Tracked hours by day";

  return (
    <section className={sectionClass} aria-label={chartAriaLabel}>
      <FinanceChartFadeIn className="calendar-timetracking-hours-chart__plot">
        <ResponsiveLine
          data={nivoData}
          margin={CHART_MARGIN}
          xScale={{ type: "point" }}
          yScale={{
            type: "linear",
            min: 0,
            max: yMax ?? "auto",
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
            format: (value) => formatTimetrackingChartHours(Number(value)),
            tickValues: 4,
          }}
          enableGridX={false}
          enableGridY
          enablePoints={false}
          enableArea={false}
          colors={[HOURS_COLOR]}
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
            (props) => (
              <HoursChartAreas {...props} gradientId={gradientId} />
            ),
            HoursChartLines,
            HoursChartDayPoints,
            "slices",
            "mesh",
          ]}
          theme={theme}
          sliceTooltip={({ slice }) => (
            <FinanceChartTooltip className="calendar-timetracking-hours-chart__tooltip">
              <div className="calendar-timetracking-hours-chart__tooltip-title">
                {tooltipLabelByX.get(String(slice.points[0]?.data.x ?? "")) ??
                  labelByX.get(String(slice.points[0]?.data.x ?? "")) ??
                  String(slice.points[0]?.data.x ?? "")}
              </div>
              {slice.points
                .filter(
                  (point) =>
                    point.data.y != null &&
                    Number.isFinite(Number(point.data.y)),
                )
                .map((point) => {
                  const hours = Number(point.data.y);
                  const spendCents = spendCentsForChartHours(
                    hours,
                    hourlyRateCents,
                  );
                  return (
                    <div key={point.id}>
                      <div className="calendar-timetracking-hours-chart__tooltip-row">
                        <span
                          className="calendar-timetracking-hours-chart__tooltip-swatch"
                          style={{
                            background: point.seriesColor,
                            borderColor: point.seriesColor,
                          }}
                        />
                        <span>
                          {budgetHoursValue != null ? "Cumulative" : "Tracked"}
                        </span>
                        <strong>{formatTimetrackingChartHours(hours)}</strong>
                      </div>
                      {spendCents != null ? (
                        <div className="calendar-timetracking-hours-chart__tooltip-row">
                          <span
                            className="calendar-timetracking-hours-chart__tooltip-swatch calendar-timetracking-hours-chart__tooltip-swatch--spacer"
                            aria-hidden="true"
                          />
                          <span>Spend</span>
                          <strong>{formatEuroCents(spendCents)}</strong>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
            </FinanceChartTooltip>
          )}
        />
      </FinanceChartFadeIn>
    </section>
  );
}
