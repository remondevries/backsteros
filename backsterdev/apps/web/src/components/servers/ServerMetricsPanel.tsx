import { useCallback, useEffect, useMemo, useState } from "react";

import { cn } from "../../lib/utils";
import { fetchServerMetrics, type MetricRange, type ServerMetricSeries } from "./hetznerApi";

const RANGE_OPTIONS: readonly { readonly id: MetricRange; readonly label: string }[] = [
  { id: "1h", label: "1 hour" },
  { id: "6h", label: "6 hours" },
  { id: "24h", label: "24 hours" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "1 month" },
];

function formatCurrent(series: ServerMetricSeries): string {
  if (series.current == null || !Number.isFinite(series.current)) return "—";
  if (series.unit === "percent") {
    // Docker Mem%/CPU% is often << 1; rounding to int makes charts look "empty".
    if (Math.abs(series.current) > 0 && Math.abs(series.current) < 1) {
      return `${series.current.toFixed(2)}%`;
    }
    if (Math.abs(series.current) < 10) return `${series.current.toFixed(1)}%`;
    return `${Math.round(series.current)}%`;
  }
  if (series.current < 0.1) return `${series.current.toFixed(2)} Mbps`;
  if (series.current < 10) return `${series.current.toFixed(1)} Mbps`;
  return `${Math.round(series.current)} Mbps`;
}

function formatAxisValue(value: number, unit: ServerMetricSeries["unit"]): string {
  if (unit === "percent") {
    if (Math.abs(value) >= 10) return `${Math.round(value)}%`;
    if (Math.abs(value) >= 1) return `${value.toFixed(1)}%`;
    return `${value.toFixed(2)}%`;
  }
  if (value < 0.1) return `${value.toFixed(2)}`;
  if (value < 10) return `${value.toFixed(1)}`;
  return `${Math.round(value)}`;
}

function formatAxisTime(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function niceMax(
  rawMax: number,
  unit: ServerMetricSeries["unit"],
  source: ServerMetricSeries["source"],
): number {
  if (!Number.isFinite(rawMax) || rawMax <= 0) {
    return unit === "percent" ? (source === "docker" ? 1 : 100) : 1;
  }
  if (unit === "percent") {
    // Container stats are often tiny vs host gauges — zoom the axis so the line is visible.
    if (source === "docker") {
      if (rawMax <= 1) return 1;
      if (rawMax <= 2) return 2;
      if (rawMax <= 5) return 5;
      if (rawMax <= 10) return 10;
      if (rawMax <= 25) return 25;
      if (rawMax <= 50) return 50;
      return 100;
    }
    if (rawMax <= 100) return 100;
    return Math.ceil(rawMax / 20) * 20;
  }
  const padded = rawMax * 1.15;
  const magnitude = 10 ** Math.floor(Math.log10(padded));
  const normalized = padded / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function niceMin(rawMin: number, rawMax: number, unit: ServerMetricSeries["unit"]): number {
  if (unit === "percent" && rawMax <= 100 && rawMin >= 0) {
    // Zoom into the used band when values stay away from 0, like Hetzner.
    if (rawMin > 40) return Math.max(0, Math.floor((rawMin - 5) / 5) * 5);
    return 0;
  }
  if (rawMin <= 0) return 0;
  const span = Math.max(rawMax - rawMin, rawMax * 0.05, 0.01);
  return Math.max(0, rawMin - span * 0.15);
}

function buildPath(
  points: readonly { readonly t: number; readonly v: number }[],
  width: number,
  height: number,
  minV: number,
  maxV: number,
  minT: number,
  maxT: number,
  stepped: boolean,
): string {
  if (points.length === 0) return "";
  const spanT = Math.max(maxT - minT, 1);
  const spanV = Math.max(maxV - minV, 0.0001);

  const coords = points.map((point) => {
    const x = ((point.t - minT) / spanT) * width;
    const y = height - ((point.v - minV) / spanV) * height;
    return { x, y };
  });

  if (!stepped) {
    return coords
      .map(
        (point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
      )
      .join(" ");
  }

  const parts: string[] = [];
  for (let index = 0; index < coords.length; index += 1) {
    const point = coords[index]!;
    if (index === 0) {
      parts.push(`M${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
      continue;
    }
    const prev = coords[index - 1]!;
    parts.push(`L${point.x.toFixed(2)} ${prev.y.toFixed(2)}`);
    parts.push(`L${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
  }
  return parts.join(" ");
}

function MetricChart({
  series,
  rangeStart,
  rangeEnd,
}: {
  readonly series: ServerMetricSeries;
  readonly rangeStart: number;
  readonly rangeEnd: number;
}) {
  const width = 720;
  const height = 168;
  const padLeft = 44;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const chart = useMemo(() => {
    // A single sample can't draw a line — extend one minute back so the chart shows something.
    const points =
      series.points.length === 1
        ? [{ t: series.points[0]!.t - 60_000, v: series.points[0]!.v }, series.points[0]!]
        : series.points;
    const values = points.map((point) => point.v);
    const rawMin = values.length ? Math.min(...values) : 0;
    const rawMax = values.length ? Math.max(...values) : series.unit === "percent" ? 100 : 1;
    const minV = niceMin(rawMin, rawMax, series.unit);
    const maxV = niceMax(Math.max(rawMax, minV + 0.01), series.unit, series.source);
    const minT = Number.isFinite(rangeStart) ? rangeStart : (points[0]?.t ?? Date.now());
    const maxT = Number.isFinite(rangeEnd)
      ? rangeEnd
      : (points[points.length - 1]?.t ?? Date.now());
    const ticks = 5;
    const yTicks = Array.from({ length: ticks }, (_, index) => {
      const ratio = index / (ticks - 1);
      return maxV - (maxV - minV) * ratio;
    });
    const path = buildPath(points, plotW, plotH, minV, maxV, minT, maxT, series.id === "disk");
    const markers = points.map((point) => {
      const spanT = Math.max(maxT - minT, 1);
      const spanV = Math.max(maxV - minV, 0.0001);
      return {
        x: padLeft + ((point.t - minT) / spanT) * plotW,
        y: padTop + (1 - (point.v - minV) / spanV) * plotH,
      };
    });
    return { minV, maxV, minT, maxT, yTicks, path, markers };
  }, [plotH, plotW, rangeEnd, rangeStart, series]);

  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
      <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-1 sm:px-6">
        <h3 className="text-sm font-medium text-foreground">{series.label}</h3>
        <div className="text-sm font-medium tabular-nums text-foreground">
          {formatCurrent(series)}
        </div>
      </div>
      <div className="px-2 pb-3 sm:px-3">
        {series.points.length === 0 ? (
          <div className="flex h-[168px] items-center justify-center px-4 text-sm text-muted-foreground">
            {series.source === "guest" || series.source === "docker"
              ? "Collecting samples… reopen this tab later for a fuller history."
              : "No metric samples in this range."}
          </div>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} className="h-[180px] w-full" role="img">
            <title>{`${series.label} ${formatCurrent(series)}`}</title>
            {chart.yTicks.map((tick) => {
              const y =
                padTop + ((chart.maxV - tick) / Math.max(chart.maxV - chart.minV, 0.0001)) * plotH;
              return (
                <g key={`tick-${tick}`}>
                  <line
                    x1={padLeft}
                    x2={width - padRight}
                    y1={y}
                    y2={y}
                    stroke="currentColor"
                    className="text-border/40"
                    strokeWidth={1}
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-muted-foreground text-[10px]"
                  >
                    {formatAxisValue(tick, series.unit)}
                  </text>
                </g>
              );
            })}
            <path
              d={chart.path}
              transform={`translate(${padLeft} ${padTop})`}
              fill="none"
              stroke={series.color}
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {chart.markers.length <= 24
              ? chart.markers.map((marker, index) => (
                  <circle
                    key={`pt-${index}`}
                    cx={marker.x}
                    cy={marker.y}
                    r={2.5}
                    fill={series.color}
                  />
                ))
              : null}
            <text x={padLeft} y={height - 8} className="fill-muted-foreground text-[10px]">
              {formatAxisTime(chart.minT)}
            </text>
            <text
              x={width - padRight}
              y={height - 8}
              textAnchor="end"
              className="fill-muted-foreground text-[10px]"
            >
              {formatAxisTime(chart.maxT)}
            </text>
          </svg>
        )}
      </div>
    </section>
  );
}

export function ServerMetricsPanel({
  serverId,
  service = null,
}: {
  readonly serverId: string;
  readonly service?: string | null;
}) {
  const [range, setRange] = useState<MetricRange>("24h");
  const [series, setSeries] = useState<readonly ServerMetricSeries[]>([]);
  const [rangeStart, setRangeStart] = useState<number>(() => Date.now() - 24 * 60 * 60 * 1000);
  const [rangeEnd, setRangeEnd] = useState<number>(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (options?: { readonly silent?: boolean }) => {
      if (!options?.silent) setLoading(true);
      setError(null);
      try {
        const data = await fetchServerMetrics(serverId, range, service ? { service } : undefined);
        if (!data.ok && data.error) {
          setError(data.error);
          setSeries([]);
          return;
        }
        setSeries(data.series ?? []);
        const start = data.start ? Date.parse(data.start) : Number.NaN;
        const end = data.end ? Date.parse(data.end) : Number.NaN;
        setRangeStart(Number.isFinite(start) ? start : Date.now() - 24 * 60 * 60 * 1000);
        setRangeEnd(Number.isFinite(end) ? end : Date.now());
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Failed to load metrics");
        setSeries([]);
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [range, serverId, service],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // App container metrics only persist when visited — poll while this tab is open.
  useEffect(() => {
    if (!service) return;
    const timer = window.setInterval(() => {
      void refresh({ silent: true });
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [refresh, service]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border/70 bg-card/50 p-1">
          {RANGE_OPTIONS.map((option) => {
            const active = option.id === range;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setRange(option.id)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs transition-colors sm:text-sm",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
                aria-pressed={active}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading && series.length === 0 ? (
        <div className="rounded-xl border border-border/70 bg-card/40 px-6 py-10 text-sm text-muted-foreground">
          Loading metrics…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-border/70 bg-card/40 px-6 py-10 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {series.map((entry) => (
            <MetricChart
              key={entry.id}
              series={entry}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
            />
          ))}
        </div>
      )}
    </div>
  );
}
