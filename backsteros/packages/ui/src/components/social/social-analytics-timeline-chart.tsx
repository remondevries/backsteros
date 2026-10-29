"use client";

import { ResponsiveLine } from "@nivo/line";
import { useMemo } from "react";

import type { SocialMockAnalyticsPoint } from "../../social/social-mock-data.js";

export type SocialAnalyticsTimelineChartProps = {
  series: readonly SocialMockAnalyticsPoint[];
  valueFormat?: "count" | "percent";
  accent?: string;
  className?: string;
  /** Rail peeks stay compact; the Analytics page uses a taller plot. */
  size?: "rail" | "page";
};

function readCssColor(variable: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  return value || fallback;
}

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}K`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    value,
  );
}

function formatValue(value: number, valueFormat: "count" | "percent"): string {
  if (valueFormat === "percent") {
    return `${value.toFixed(1)}%`;
  }
  return formatCount(value);
}

export function SocialAnalyticsTimelineChart({
  series,
  valueFormat = "count",
  accent,
  className,
  size = "rail",
}: SocialAnalyticsTimelineChartProps) {
  const page = size === "page";
  const paints = useMemo(() => {
    const muted = readCssColor("--muted", "#888");
    const line =
      accent?.trim() ||
      readCssColor("--accent", readCssColor("--primary", "#5b8def"));
    return { muted, line };
  }, [accent]);

  const theme = useMemo(
    () => ({
      background: "transparent",
      text: { fill: paints.muted, fontSize: 10 },
      axis: {
        ticks: { text: { fill: paints.muted, fontSize: 10 } },
        domain: { line: { stroke: "transparent" } },
      },
      grid: {
        line: {
          stroke: paints.muted,
          strokeOpacity: 0.2,
          strokeWidth: 1,
          strokeDasharray: "3 3",
        },
      },
      crosshair: {
        line: {
          stroke: paints.muted,
          strokeWidth: 1,
          strokeOpacity: 0.45,
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

  const data = useMemo(
    () => [
      {
        id: "metric",
        data: series.map((point) => ({
          x: point.date,
          y: point.value,
        })),
      },
    ],
    [series],
  );

  const labelByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const point of series) {
      map.set(point.date, point.label);
    }
    return map;
  }, [series]);

  const values = series.map((point) => point.value);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 1;
  const pad = Math.max((max - min) * 0.12, valueFormat === "percent" ? 0.05 : 1);

  return (
    <div
      className={[
        "social-analytics-timeline",
        page ? "social-analytics-timeline--page" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="img"
      aria-label="Analytics timeline"
    >
      <ResponsiveLine
        data={data}
        margin={
          page
            ? { top: 12, right: 16, bottom: 28, left: 44 }
            : { top: 8, right: 8, bottom: 22, left: 36 }
        }
        xScale={{ type: "point" }}
        yScale={{
          type: "linear",
          min: Math.max(0, min - pad),
          max: max + pad,
          nice: true,
        }}
        curve="monotoneX"
        enableArea
        areaOpacity={0.14}
        colors={[paints.line]}
        lineWidth={page ? 2.5 : 2}
        enablePoints
        pointSize={page ? 7 : 6}
        pointColor={paints.line}
        pointBorderWidth={2}
        pointBorderColor="var(--background)"
        enableGridX={false}
        enableGridY
        axisTop={null}
        axisRight={null}
        axisBottom={{
          tickSize: 0,
          tickPadding: page ? 10 : 8,
          tickValues: page && series.length > 14
            ? series
                .filter((_, index) => index % 3 === 0 || index === series.length - 1)
                .map((point) => point.date)
            : undefined,
          format: (value) => labelByDate.get(String(value)) ?? String(value),
        }}
        axisLeft={{
          tickSize: 0,
          tickPadding: page ? 8 : 6,
          tickValues: page ? 4 : 3,
          format: (value) => formatValue(Number(value), valueFormat),
        }}
        theme={theme}
        enableSlices="x"
        sliceTooltip={({ slice }) => {
          const point = slice.points[0];
          if (!point) return null;
          const x = String(point.data.x);
          return (
            <div className="social-analytics-timeline__tooltip">
              <span className="social-analytics-timeline__tooltip-label">
                {labelByDate.get(x) ?? x}
              </span>
              <span className="social-analytics-timeline__tooltip-value">
                {formatValue(Number(point.data.y), valueFormat)}
              </span>
            </div>
          );
        }}
        animate
        motionConfig="gentle"
        role="application"
        ariaLabel="Analytics timeline chart"
      />
    </div>
  );
}
