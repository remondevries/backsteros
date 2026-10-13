"use client";

import { ResponsivePie } from "@nivo/pie";
import { useMemo } from "react";

import { FinanceChartTooltip } from "./finance-chart-tooltip.js";

export type FinanceOverviewPieSlice = {
  id: string;
  label: string;
  value: number;
  color: string;
  /** 0–1 solid fill within the faded allocation arc. */
  progress?: number;
};

export type FinanceOverviewPieProps = {
  slices: FinanceOverviewPieSlice[];
  /** Muted fill when the pie has no positive values. */
  emptyColor?: string;
  className?: string;
};

const CHART_MOTION = {
  mass: 1,
  tension: 170,
  friction: 26,
  clamp: false,
} as const;

const DEFAULT_EMPTY = "color-mix(in srgb, var(--foreground) 12%, transparent)";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function withAlpha(color: string, alpha: number): string {
  const trimmed = color.trim();
  if (trimmed.startsWith("color-mix(") || trimmed.startsWith("var(")) {
    return trimmed;
  }
  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(trimmed);
  if (hex) {
    let raw = hex[1]!;
    if (raw.length === 3) {
      raw = raw
        .split("")
        .map((ch) => `${ch}${ch}`)
        .join("");
    }
    const a = Math.round(clamp01(alpha) * 255)
      .toString(16)
      .padStart(2, "0");
    return `#${raw}${a}`;
  }
  return `color-mix(in srgb, ${trimmed} ${Math.round(clamp01(alpha) * 100)}%, transparent)`;
}

type PieDatum = {
  id: string;
  label: string;
  value: number;
  color: string;
};

function formatEuroCents(cents: number): string {
  const value = cents / 100;
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

function pieTheme() {
  return {
    background: "transparent",
    text: { fill: "transparent" },
    // Card chrome lives on the custom tooltip markup (same as bar/line charts).
    tooltip: {
      container: {
        background: "transparent",
        boxShadow: "none",
        padding: 0,
      },
    },
  } as const;
}

function OverviewPieTooltip({
  label,
  color,
  valueCents,
  percent,
}: {
  label: string;
  color: string;
  valueCents: number;
  percent: number;
}) {
  return (
    <FinanceChartTooltip className="finance-overview-pie__tooltip">
      <div className="finance-overview-pie__tooltip-title">{label}</div>
      <div className="finance-overview-pie__tooltip-row">
        <span
          className="finance-overview-pie__tooltip-swatch"
          style={{ background: color }}
        />
        <span>{percent}%</span>
        <strong>{formatEuroCents(valueCents)}</strong>
      </div>
    </FinanceChartTooltip>
  );
}

function OverviewPieLayer({
  data,
  interactive,
}: {
  data: PieDatum[];
  interactive: boolean;
}) {
  return (
    <ResponsivePie
      data={data}
      margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
      innerRadius={0.42}
      padAngle={0.6}
      cornerRadius={2}
      activeOuterRadiusOffset={0}
      enableArcLabels={false}
      enableArcLinkLabels={false}
      isInteractive={interactive}
      animate
      motionConfig={CHART_MOTION}
      colors={(datum) => {
        const color = (datum.data as PieDatum | undefined)?.color;
        return typeof color === "string" && color.trim()
          ? color
          : DEFAULT_EMPTY;
      }}
      borderWidth={0}
      theme={pieTheme()}
      tooltip={({ datum }) => {
        if (
          datum.color === "transparent" ||
          datum.id.toString().endsWith("__gap")
        ) {
          return null;
        }
        const pct = Math.round((datum.arc.angleDeg / 360) * 100);
        const rawColor = (datum.data as PieDatum | undefined)?.color;
        const swatch =
          typeof rawColor === "string" && rawColor.trim()
            ? rawColor
            : datum.color;
        return (
          <OverviewPieTooltip
            label={String(datum.label)}
            color={swatch}
            valueCents={Number(datum.value)}
            percent={pct}
          />
        );
      }}
    />
  );
}

/**
 * Shared finance overview donut (Nivo). Optional per-slice `progress` draws a
 * faded allocation arc with a solid progress fill on top.
 */
export function FinanceOverviewPie({
  slices,
  emptyColor = DEFAULT_EMPTY,
  className,
}: FinanceOverviewPieProps) {
  const { faded, solid, hasProgress } = useMemo(() => {
    const positive = slices.filter((slice) => slice.value > 0);
    if (positive.length === 0) {
      const empty: PieDatum[] = [
        {
          id: "__empty",
          label: "Empty",
          value: 1,
          color: emptyColor,
        },
      ];
      return { faded: empty, solid: empty, hasProgress: false };
    }

    const anyProgress = positive.some(
      (slice) => slice.progress != null && Number.isFinite(slice.progress),
    );

    const fadedData: PieDatum[] = positive.map((slice) => ({
      id: slice.id,
      label: slice.label,
      value: slice.value,
      color: anyProgress ? withAlpha(slice.color, 0.32) : slice.color,
    }));

    const solidData: PieDatum[] = positive.map((slice) => {
      const progress =
        slice.progress == null ? 1 : clamp01(slice.progress);
      return {
        id: `${slice.id}__progress`,
        label: slice.label,
        value: Math.max(slice.value * progress, 0),
        color: slice.color,
      };
    });

    // Keep arc angles aligned with the faded layer when progress is partial:
    // pad zero-progress slices with transparent remainder so Nivo still lays
    // out the same angular spans as the faded pie underneath.
    if (anyProgress) {
      const padded: PieDatum[] = [];
      for (const slice of positive) {
        const progress =
          slice.progress == null ? 1 : clamp01(slice.progress);
        const filled = slice.value * progress;
        const rest = slice.value - filled;
        if (filled > 0) {
          padded.push({
            id: `${slice.id}__progress`,
            label: slice.label,
            value: filled,
            color: slice.color,
          });
        }
        if (rest > 0) {
          padded.push({
            id: `${slice.id}__gap`,
            label: slice.label,
            value: rest,
            color: "transparent",
          });
        }
      }
      return { faded: fadedData, solid: padded, hasProgress: true };
    }

    return { faded: fadedData, solid: solidData, hasProgress: false };
  }, [emptyColor, slices]);

  return (
    <div
      className={["finance-overview-pie", className].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      <div className="finance-overview-pie__layer">
        <OverviewPieLayer data={faded} interactive={!hasProgress} />
      </div>
      {hasProgress ? (
        <div className="finance-overview-pie__layer finance-overview-pie__layer--solid">
          <OverviewPieLayer data={solid} interactive />
        </div>
      ) : null}
    </div>
  );
}
