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
  buildTimetrackingHoursChartSeries,
  formatTimetrackingChartHours,
  timetrackingHoursChartHasActivity,
} from "../../calendar/calendar-timetracking-hours-chart-series.js";
import type { TimetrackingEntry } from "../../calendar/calendar-timetracking-entries.js";
import type { TimetrackingPeriod } from "../../calendar/calendar-timetracking-days.js";
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
};

/** Blue line/area — matches other desktop accent blues. */
const HOURS_COLOR = "#3b82f6";
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

function HoursChartEndPoint({
  series,
}: LineCustomSvgLayerProps<DefaultSeries>) {
  return (
    <g>
      {series.map((serie) => {
        const last = [...serie.data]
          .reverse()
          .find(
            (point) =>
              point.data.y != null && Number.isFinite(Number(point.data.y)),
          );
        if (!last) return null;
        return (
          <HoursChartPoint
            key={String(serie.id)}
            x={last.position.x}
            y={last.position.y}
            color={serie.color ?? HOURS_COLOR}
          />
        );
      })}
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
}: TimetrackingHoursChartProps) {
  const gradientId = `timetracking-hours-area-${useId().replace(/:/g, "")}`;

  const series = useMemo(
    () => buildTimetrackingHoursChartSeries({ entries, period }),
    [entries, period],
  );
  const hasActivity = timetrackingHoursChartHasActivity(series);

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

  if (!period || !series) {
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
    series.data.map((point) => [point.x, point.label] as const),
  );
  const tooltipLabelByX = new Map(
    series.data.map((point) => [point.x, point.tooltipLabel] as const),
  );

  const nivoData: DefaultSeries[] = [
    {
      id: SERIES_ID,
      data: series.data.map((point) => ({ x: point.x, y: point.y })),
    },
  ];

  const dense = series.data.length > 10;
  const tickValues = dense
    ? series.data
        .filter((_, index, all) => {
          const step = Math.ceil(all.length / 7);
          return index % step === 0 || index === all.length - 1;
        })
        .map((point) => point.x)
    : undefined;

  const showAllPoints = series.data.length <= 14;

  return (
    <section className={sectionClass} aria-label="Tracked hours by day">
      <FinanceChartFadeIn className="calendar-timetracking-hours-chart__plot">
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
          layers={[
            "grid",
            "markers",
            "axes",
            "crosshair",
            (props) => (
              <HoursChartAreas {...props} gradientId={gradientId} />
            ),
            HoursChartLines,
            showAllPoints ? HoursChartDayPoints : HoursChartEndPoint,
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
                .map((point) => (
                  <div
                    key={point.id}
                    className="calendar-timetracking-hours-chart__tooltip-row"
                  >
                    <span
                      className="calendar-timetracking-hours-chart__tooltip-swatch"
                      style={{
                        background: point.seriesColor,
                        borderColor: point.seriesColor,
                      }}
                    />
                    <span>Tracked</span>
                    <strong>
                      {formatTimetrackingChartHours(Number(point.data.y))}
                    </strong>
                  </div>
                ))}
            </FinanceChartTooltip>
          )}
        />
      </FinanceChartFadeIn>
    </section>
  );
}
