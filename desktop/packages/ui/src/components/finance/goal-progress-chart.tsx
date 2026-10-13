"use client";

import type { FinancialGoal, FinancialTransaction } from "@backsteros/contracts";
import { useAnimatedPath } from "@nivo/core";
import {
  ResponsiveLine,
  type DefaultSeries,
  type LineCustomSvgLayerProps,
} from "@nivo/line";
import { animated, useSpring } from "@react-spring/web";
import { useId, useMemo } from "react";

import {
  buildGoalChartSeries,
  goalChartHasPlan,
} from "../../finance/goal-chart-series.js";
import {
  FinanceChartEmpty,
  FinanceChartFadeIn,
  FinanceChartLoading,
} from "./finance-chart-status.js";
import { FinanceChartTooltip } from "./finance-chart-tooltip.js";

export type GoalProgressChartProps = {
  goal: FinancialGoal;
  transactions: FinancialTransaction[];
  loading?: boolean;
  accent?: string;
};

const PROJECTED_ID = "Projected";
const ACTUAL_ID = "Actual";

const CHART_MOTION = {
  mass: 1,
  tension: 170,
  friction: 26,
  clamp: false,
} as const;

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

function formatChartTickLabel(
  value: string,
  savingMode: string | null | undefined,
  labelByX: Map<string, string>,
): string {
  const mapped = labelByX.get(value);
  if (savingMode !== "monthly") {
    return mapped ?? value;
  }
  // Monthly: never surface day/year from the raw ISO key (e.g. 2026-06-26).
  if (mapped && !/\d/.test(mapped)) {
    return mapped;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return mapped ?? value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short" }).format(date);
  } catch {
    return match[2]!;
  }
}

/** Read a CSS custom property from the document root. */
function readCssColor(variable: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  return value || fallback;
}

function isProjectedSeries(id: string | number): boolean {
  return String(id).toLowerCase() === "projected";
}

function isActualSeries(id: string | number): boolean {
  return String(id).toLowerCase() === "actual";
}

function GoalChartActualArea({
  series,
  areaGenerator,
  gradientId,
  color,
}: LineCustomSvgLayerProps<DefaultSeries> & {
  gradientId: string;
  color: string;
}) {
  const actual = series.find((serie) => isActualSeries(serie.id));
  if (!actual || actual.data.length < 2) return null;
  const path = areaGenerator(
    actual.data.map((point) => ({
      x: point.position.x,
      y: point.position.y,
    })),
  );
  if (!path) return null;
  return (
    <g>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.08} />
          <stop offset="55%" stopColor={color} stopOpacity={0.025} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <GoalChartAnimatedArea path={path} gradientId={gradientId} />
    </g>
  );
}

function GoalChartAnimatedArea({
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

function GoalChartAnimatedLine({
  path,
  color,
  projected,
}: {
  path: string;
  color: string;
  projected: boolean;
}) {
  const animatedPath = useAnimatedPath(path);
  return (
    <animated.path
      // Nivo's Interpolation type is compatible at runtime with react-spring's path `d`.
      d={animatedPath as unknown as string}
      fill="none"
      stroke={color}
      strokeWidth={projected ? 1.5 : 2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={projected ? "6 5" : undefined}
      strokeOpacity={projected ? 0.9 : 1}
    />
  );
}

function GoalChartLines({
  series,
  lineGenerator,
}: LineCustomSvgLayerProps<DefaultSeries>) {
  // Draw actual under projected so the dashed direction line stays visible.
  const ordered = [...series].sort((a, b) => {
    const aProjected = isProjectedSeries(a.id) ? 1 : 0;
    const bProjected = isProjectedSeries(b.id) ? 1 : 0;
    return aProjected - bProjected;
  });

  return (
    <g>
      {ordered.map((serie) => {
        const path = lineGenerator(
          serie.data.map((point) => ({
            x: point.position.x,
            y: point.position.y,
          })),
        );
        if (!path) return null;
        return (
          <GoalChartAnimatedLine
            key={String(serie.id)}
            path={path}
            color={serie.color ?? "#888"}
            projected={isProjectedSeries(serie.id)}
          />
        );
      })}
    </g>
  );
}

function GoalChartAnimatedPoint({
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

function GoalChartActualPoints({
  series,
}: LineCustomSvgLayerProps<DefaultSeries>) {
  const actual = series.find((serie) => isActualSeries(serie.id));
  if (!actual || actual.data.length > 16) return null;
  return (
    <g>
      {actual.data.map((point, index) => (
        <GoalChartAnimatedPoint
          key={`${String(actual.id)}-${index}-${String(point.data.x)}`}
          x={point.position.x}
          y={point.position.y}
          color={actual.color ?? "#888"}
        />
      ))}
    </g>
  );
}

export function GoalProgressChart({
  goal,
  transactions,
  loading = false,
}: GoalProgressChartProps) {
  const gradientId = `goal-actual-area-${useId().replace(/:/g, "")}`;
  const series = useMemo(
    () => buildGoalChartSeries({ goal, transactions }),
    [goal, transactions],
  );
  const hasPlan = goalChartHasPlan(goal);

  const paints = useMemo(() => {
    const muted = readCssColor("--muted", "#888");
    const foreground = readCssColor("--foreground", "#111");
    const background = readCssColor("--background", "#fff");
    // Hard green so progress reads clearly against muted projected / theme text.
    const actual = "#22c55e";
    // Plan / direction line stays neutral grey regardless of goal accent.
    const projected = muted;
    return { muted, foreground, background, actual, projected };
  }, []);

  const ActualAreaLayer = useMemo(
    () =>
      function ActualAreaLayerInner(
        props: LineCustomSvgLayerProps<DefaultSeries>,
      ) {
        return (
          <GoalChartActualArea
            {...props}
            gradientId={gradientId}
            color={paints.actual}
          />
        );
      },
    [gradientId, paints.actual],
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
          line: { stroke: "transparent", strokeWidth: 0 },
        },
        ticks: {
          line: { stroke: "transparent", strokeWidth: 0 },
          text: { fill: paints.muted, fontSize: 11 },
        },
        legend: {
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

  if (!hasPlan) {
    return (
      <section
        className="finance-goals-view__chart"
        aria-label="Goal progress chart"
      >
        <FinanceChartEmpty>
          Set a goal amount, start date, and contribution to see the plan.
        </FinanceChartEmpty>
      </section>
    );
  }

  if (loading && !series) {
    return (
      <section
        className="finance-goals-view__chart"
        aria-label="Goal progress chart"
      >
        <FinanceChartLoading />
      </section>
    );
  }

  if (!series) {
    return null;
  }

  const labelByX = new Map<string, string>();
  for (const line of series) {
    for (const point of line.data) {
      labelByX.set(point.x, point.label);
    }
  }

  // Actual first, projected last — matches color mapping and keeps the
  // dashed direction stroke painted on top in the custom lines layer.
  const actualLine = series.find((line) => line.id === "actual");
  const projectedLine = series.find((line) => line.id === "projected");
  const nivoData: DefaultSeries[] = [];
  if (actualLine) {
    nivoData.push({
      id: ACTUAL_ID,
      data: actualLine.data.map((point) => ({ x: point.x, y: point.y })),
    });
  }
  if (projectedLine) {
    nivoData.push({
      id: PROJECTED_ID,
      data: projectedLine.data.map((point) => ({ x: point.x, y: point.y })),
    });
  }

  const axisSeries = projectedLine ?? actualLine;
  const tickValues =
    axisSeries && axisSeries.data.length > 8
      ? axisSeries.data
          .filter((_, index, all) => {
            const step = Math.ceil(all.length / 6);
            return index % step === 0 || index === all.length - 1;
          })
          .map((point) => point.x)
          .filter((value): value is string => value != null)
      : undefined;

  return (
    <section
      className="finance-goals-view__chart"
      aria-label="Goal progress chart"
    >
      <FinanceChartFadeIn className="finance-goals-view__chart-plot">
        <ResponsiveLine
          data={nivoData}
          margin={{ top: 8, right: 12, bottom: 28, left: 48 }}
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
            format: (value) =>
              formatChartTickLabel(String(value), goal.savingMode, labelByX),
            tickValues,
          }}
          axisLeft={{
            tickSize: 0,
            tickPadding: 10,
            format: (value) => formatEuro(Number(value)),
            tickValues: 4,
          }}
          enableGridX={false}
          enableGridY
          enablePoints={false}
          enableArea={false}
          colors={[paints.actual, paints.projected]}
          curve="monotoneX"
          animate
          motionConfig={CHART_MOTION}
          useMesh
          enableSlices="x"
          layers={[
            "grid",
            "markers",
            "axes",
            ActualAreaLayer,
            "crosshair",
            GoalChartLines,
            GoalChartActualPoints,
            "slices",
            "mesh",
          ]}
          theme={theme}
          sliceTooltip={({ slice }) => (
            <FinanceChartTooltip className="finance-goals-view__chart-tooltip">
              <div className="finance-goals-view__chart-tooltip-title">
                {formatChartTickLabel(
                  String(slice.points[0]?.data.x ?? ""),
                  goal.savingMode,
                  labelByX,
                )}
              </div>
              {slice.points.map((point) => (
                <div
                  key={point.id}
                  className="finance-goals-view__chart-tooltip-row"
                >
                  <span
                    className={[
                      "finance-goals-view__chart-tooltip-swatch",
                      point.seriesId === PROJECTED_ID
                        ? "finance-goals-view__chart-tooltip-swatch--projected"
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{
                      background: point.seriesColor,
                      borderColor: point.seriesColor,
                    }}
                  />
                  <span>{point.seriesId}</span>
                  <strong>{formatEuro(Number(point.data.y))}</strong>
                </div>
              ))}
            </FinanceChartTooltip>
          )}
        />
      </FinanceChartFadeIn>
    </section>
  );
}
