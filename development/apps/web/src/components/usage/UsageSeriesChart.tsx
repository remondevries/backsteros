import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent,
} from "react";

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 260;
const TICK_COUNT = 4;
const PLOT_TOP = 8;

/**
 * Builds a scale whose maximum is a readable 1/2/5 x 10^n step at or above the
 * peak.
 */
export function niceScale(peak: number, count: number): { max: number; ticks: readonly number[] } {
  if (peak <= 0) return { max: 0, ticks: [0] };

  const rawStep = peak / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = (normalized > 5 ? 10 : normalized > 2 ? 5 : normalized > 1 ? 2 : 1) * magnitude;

  const max = Math.ceil(peak / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step * 1e-6; value += step) ticks.push(value);
  return { max, ticks };
}

export type UsageSeriesDefinition = {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  /** Optional custom mark; falls back to a colored dot. */
  readonly mark?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
};

export type UsageSeriesColumn = {
  readonly bands: readonly { readonly id: string; readonly value: number }[];
  readonly total: number;
};

type Point = { readonly x: number; readonly y: number };

/** Shape-preserving cubic tangents that cannot overshoot spiky usage data. */
function monotoneTangents(points: readonly Point[]): readonly number[] {
  const count = points.length;
  if (count < 2) return [0];

  const slopes: number[] = [];
  for (let index = 0; index < count - 1; index += 1) {
    const dx = (points[index + 1]?.x ?? 0) - (points[index]?.x ?? 0);
    const dy = (points[index + 1]?.y ?? 0) - (points[index]?.y ?? 0);
    slopes.push(dx === 0 ? 0 : dy / dx);
  }

  const tangents: number[] = Array.from({ length: count }, () => 0);
  tangents[0] = slopes[0] ?? 0;
  tangents[count - 1] = slopes[count - 2] ?? 0;
  for (let index = 1; index < count - 1; index += 1) {
    const previous = slopes[index - 1] ?? 0;
    const next = slopes[index] ?? 0;
    tangents[index] = previous * next <= 0 ? 0 : (previous + next) / 2;
  }

  for (let index = 0; index < count - 1; index += 1) {
    const slope = slopes[index] ?? 0;
    if (slope === 0) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      continue;
    }
    const a = (tangents[index] ?? 0) / slope;
    const b = (tangents[index + 1] ?? 0) / slope;
    const magnitude = a * a + b * b;
    if (magnitude > 9) {
      const scale = 3 / Math.sqrt(magnitude);
      tangents[index] = scale * a * slope;
      tangents[index + 1] = scale * b * slope;
    }
  }

  return tangents;
}

interface CurveSegment {
  readonly from: Point;
  readonly c1: Point;
  readonly c2: Point;
  readonly to: Point;
}

function smoothCurve(points: readonly Point[]): readonly CurveSegment[] {
  if (points.length < 2) return [];
  const tangents = monotoneTangents(points);
  const segments: CurveSegment[] = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (from === undefined || to === undefined) continue;
    const dx = to.x - from.x;
    segments.push({
      from,
      c1: { x: from.x + dx / 3, y: from.y + ((tangents[index] ?? 0) * dx) / 3 },
      c2: { x: to.x - dx / 3, y: to.y - ((tangents[index + 1] ?? 0) * dx) / 3 },
      to,
    });
  }
  return segments;
}

function curvePath(segments: readonly CurveSegment[]): string {
  const first = segments[0];
  if (first === undefined) return "";
  let path = `M${first.from.x.toFixed(2)},${first.from.y.toFixed(2)}`;
  for (const segment of segments) {
    path += ` C${segment.c1.x.toFixed(2)},${segment.c1.y.toFixed(2)} ${segment.c2.x.toFixed(2)},${segment.c2.y.toFixed(2)} ${segment.to.x.toFixed(2)},${segment.to.y.toFixed(2)}`;
  }
  return path;
}

function SeriesDot({
  color,
  className,
  ...rest
}: {
  readonly color: string;
  readonly className?: string;
  readonly "aria-hidden"?: boolean;
}) {
  return (
    <span
      {...rest}
      className={className}
      style={{
        display: "inline-block",
        width: "0.75rem",
        height: "0.75rem",
        borderRadius: 9999,
        backgroundColor: color,
      }}
    />
  );
}

/**
 * Shared usage timeline chart (Premium + Prepaid): overlapping area series,
 * axis labels, and glass hover tooltip.
 */
export function UsageSeriesChart({
  periods,
  series,
  columns,
  formatValue,
  formatPeriod,
  formatTooltipPeriod,
  ariaLabel,
}: {
  readonly periods: readonly string[];
  readonly series: readonly UsageSeriesDefinition[];
  readonly columns: readonly UsageSeriesColumn[];
  readonly formatValue: (value: number) => string;
  readonly formatPeriod: (period: string) => string;
  readonly formatTooltipPeriod?: (period: string) => string;
  readonly ariaLabel: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const hoverPositionRef = useRef<{ x: number; y: number } | null>(null);
  const tooltipPeriod = formatTooltipPeriod ?? formatPeriod;

  const { paths, ticks, stepX, toY } = useMemo(() => {
    if (periods.length === 0 || columns.length === 0) {
      return {
        paths: [] as readonly {
          readonly id: string;
          readonly color: string;
          readonly total: number;
          readonly area: string;
          readonly line: string;
        }[],
        stepX: 0,
        ticks: [0] as readonly number[],
        toY: () => VIEW_HEIGHT,
      };
    }

    const peak = columns.reduce(
      (max, column) => column.bands.reduce((inner, band) => Math.max(inner, band.value), max),
      0,
    );
    const { max, ticks: tickValues } = niceScale(peak, TICK_COUNT);
    const step = periods.length === 1 ? 0 : VIEW_WIDTH / (periods.length - 1);
    const toY = (value: number) =>
      max === 0 ? VIEW_HEIGHT : VIEW_HEIGHT - (value / max) * (VIEW_HEIGHT - PLOT_TOP);

    const built = series.map((entry) => {
      const line = curvePath(
        smoothCurve(
          columns.map((column, periodIndex) => ({
            x: periodIndex * step,
            y: toY(column.bands.find((band) => band.id === entry.id)?.value ?? 0),
          })),
        ),
      );
      return {
        id: entry.id,
        color: entry.color,
        total: columns.reduce(
          (sum, column) => sum + (column.bands.find((band) => band.id === entry.id)?.value ?? 0),
          0,
        ),
        area: line === "" ? "" : `${line} L${VIEW_WIDTH},${VIEW_HEIGHT} L0,${VIEW_HEIGHT} Z`,
        line,
      };
    });

    return {
      paths: built.toSorted((a, b) => b.total - a.total),
      stepX: step,
      ticks: tickValues,
      toY,
    };
  }, [columns, periods.length, series]);

  const positionTooltip = useCallback(() => {
    const plot = plotRef.current;
    const tooltip = tooltipRef.current;
    const hoverPosition = hoverPositionRef.current;
    if (plot === null || tooltip === null || hoverPosition === null) return;

    const gap = 12;
    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;
    const plotWidth = plot.clientWidth;
    const plotHeight = plot.clientHeight;
    const preferredLeft =
      hoverPosition.x + gap + tooltipWidth <= plotWidth
        ? hoverPosition.x + gap
        : hoverPosition.x - gap - tooltipWidth;
    const preferredTop =
      hoverPosition.y + gap + tooltipHeight <= plotHeight
        ? hoverPosition.y + gap
        : hoverPosition.y - gap - tooltipHeight;
    const left = Math.min(Math.max(0, preferredLeft), Math.max(0, plotWidth - tooltipWidth));
    const top = Math.min(Math.max(0, preferredTop), Math.max(0, plotHeight - tooltipHeight));
    plot.style.setProperty("--usage-tooltip-left", `${left}px`);
    plot.style.setProperty("--usage-tooltip-top", `${top}px`);
  }, []);

  useLayoutEffect(() => {
    if (hoverIndex === null) return;
    positionTooltip();

    const plot = plotRef.current;
    const tooltip = tooltipRef.current;
    if (plot === null || tooltip === null || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(positionTooltip);
    observer.observe(plot);
    observer.observe(tooltip);
    return () => observer.disconnect();
  }, [hoverIndex, positionTooltip]);

  const handleMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const plot = plotRef.current;
      if (plot === null || periods.length === 0) return;
      const bounds = plot.getBoundingClientRect();
      if (bounds.width === 0) return;
      const localX = Math.min(bounds.width, Math.max(0, event.clientX - bounds.left));
      const localY = Math.min(bounds.height, Math.max(0, event.clientY - bounds.top));
      const fraction = localX / bounds.width;
      const index = Math.round(fraction * (periods.length - 1));
      hoverPositionRef.current = { x: localX, y: localY };
      positionTooltip();
      setHoverIndex(Math.min(periods.length - 1, Math.max(0, index)));
    },
    [periods.length, positionTooltip],
  );

  const hoveredPeriod = hoverIndex === null ? undefined : periods[hoverIndex];
  const hoveredColumn = hoverIndex === null ? undefined : columns[hoverIndex];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <div className="relative h-56 w-14 shrink-0">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums"
              style={{ top: `${(toY(tick) / VIEW_HEIGHT) * 100}%` }}
            >
              {tick === 0 ? "0" : formatValue(tick)}
            </span>
          ))}
        </div>

        <div
          ref={plotRef}
          className="relative h-56 flex-1"
          onMouseMove={handleMove}
          onMouseLeave={() => {
            hoverPositionRef.current = null;
            setHoverIndex(null);
          }}
        >
          <svg
            className="h-full w-full"
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={ariaLabel}
          >
            {ticks.map((tick) => {
              const y = toY(tick);
              return (
                <line
                  key={tick}
                  x1={0}
                  x2={VIEW_WIDTH}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth={1}
                  className="text-border"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}

            {paths.map(({ id, color, area }) => (
              <path key={`area-${id}`} d={area} fill={color} fillOpacity={0.12} />
            ))}
            {paths.map(({ id, color, line }) => (
              <path
                key={`line-${id}`}
                d={line}
                fill="none"
                stroke={color}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {hoverIndex === null ? null : (
              <line
                x1={hoverIndex * stepX}
                x2={hoverIndex * stepX}
                y1={PLOT_TOP}
                y2={VIEW_HEIGHT}
                stroke="currentColor"
                strokeWidth={1}
                className="text-muted-foreground"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {hoveredPeriod === undefined ? null : (
            <div
              ref={tooltipRef}
              className="surface-glass pointer-events-none absolute z-10 min-w-36 max-w-full rounded-xl border border-border/50 px-2.5 py-2 text-xs shadow-lg"
              style={{
                left: "var(--usage-tooltip-left, 0px)",
                top: "var(--usage-tooltip-top, 0px)",
              }}
            >
              <div className="mb-1 text-muted-foreground">{tooltipPeriod(hoveredPeriod)}</div>
              {series.map((entry) => {
                const Mark = entry.mark;
                return (
                  <div key={entry.id} className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                      {Mark ? (
                        <Mark className="size-3 shrink-0" aria-hidden />
                      ) : (
                        <SeriesDot color={entry.color} className="size-3 shrink-0" aria-hidden />
                      )}
                      <span className="truncate">{entry.label}</span>
                    </span>
                    <span className="shrink-0 text-foreground tabular-nums">
                      {formatValue(
                        hoveredColumn?.bands.find((band) => band.id === entry.id)?.value ?? 0,
                      )}
                    </span>
                  </div>
                );
              })}
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-1">
                <span className="text-muted-foreground">Total</span>
                <span className="text-foreground tabular-nums">
                  {formatValue(hoveredColumn?.total ?? 0)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between pl-16 text-[10px] text-muted-foreground uppercase">
        <span>{periods[0] === undefined ? "" : formatPeriod(periods[0])}</span>
        <span>
          {periods[Math.floor(periods.length / 2)] === undefined
            ? ""
            : formatPeriod(periods[Math.floor(periods.length / 2)] ?? "")}
        </span>
        <span>
          {periods[periods.length - 1] === undefined
            ? ""
            : formatPeriod(periods[periods.length - 1] ?? "")}
        </span>
      </div>
    </div>
  );
}
