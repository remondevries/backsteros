"use client";

import type {
  FinanceAssetsDebt,
  FinanceAssetsDebtRange,
} from "@backsteros/contracts";
import { useAnimatedPath } from "@nivo/core";
import {
  ResponsiveLine,
  type DefaultSeries,
  type LineCustomSvgLayerProps,
} from "@nivo/line";
import { animated, useSpring } from "@react-spring/web";
import { TriangleDownIcon, TriangleUpIcon } from "@primer/octicons-react";
import { useId, useMemo } from "react";

import { netIncomeChangePercent } from "../net-income-year-chart-series.js";
import {
  FinanceChartEmpty,
  FinanceChartFadeIn,
  FinanceChartLoading,
} from "./finance-chart-status.js";
import { FinanceChartTooltip } from "./finance-chart-tooltip.js";

export type AssetsDebtChartProps = {
  data: FinanceAssetsDebt | null;
  loading?: boolean;
  range: FinanceAssetsDebtRange;
  onRangeChange: (range: FinanceAssetsDebtRange) => void;
  className?: string;
};

const ASSET_COLOR = "#5B9FD8";
const DEBT_COLOR = "#F97316";
const RANGES: FinanceAssetsDebtRange[] = ["1W", "1M", "3M", "YTD", "1Y", "ALL"];

const CHART_MOTION = {
  mass: 1,
  tension: 170,
  friction: 26,
  clamp: false,
} as const;

function formatMoney(cents: number): string {
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

function formatPercent(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${value.toFixed(digits)}%`;
}

function formatTooltipDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y || 1970, (m || 1) - 1, d || 1);
  try {
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function readCssColor(variable: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  return value || fallback;
}

function ChangeBadge({
  currentCents,
  startCents,
  sense,
}: {
  currentCents: number;
  startCents: number;
  sense: "assets" | "debt";
}) {
  const change = netIncomeChangePercent(currentCents, startCents);
  if (change == null || (change === 0 && currentCents === startCents)) {
    return null;
  }
  const up = change >= 0;
  // Assets up = good (green). Debt up = bad (red).
  const positiveTone = sense === "assets" ? up : !up;
  return (
    <span
      className={[
        "finance-assets-debt-chart__delta",
        positiveTone
          ? "finance-assets-debt-chart__delta--positive"
          : "finance-assets-debt-chart__delta--negative",
      ].join(" ")}
    >
      {up ? <TriangleUpIcon size={12} /> : <TriangleDownIcon size={12} />}
      {formatPercent(Math.abs(change))}
    </span>
  );
}

function AssetsAreaLayer({
  series,
  areaGenerator,
  gradientId,
}: LineCustomSvgLayerProps<DefaultSeries> & { gradientId: string }) {
  const assets = series.find((serie) => String(serie.id) === "Assets");
  const path = assets
    ? areaGenerator(
        assets.data.map((point) => ({
          x: point.position.x,
          y: point.position.y,
        })),
      )
    : null;
  const animatedPath = useAnimatedPath(path ?? "");
  if (!path) return null;
  return (
    <g>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ASSET_COLOR} stopOpacity={0.22} />
          <stop offset="60%" stopColor={ASSET_COLOR} stopOpacity={0.05} />
          <stop offset="100%" stopColor={ASSET_COLOR} stopOpacity={0} />
        </linearGradient>
      </defs>
      <animated.path
        d={animatedPath as unknown as string}
        fill={`url(#${gradientId})`}
        stroke="none"
      />
    </g>
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

function LinesLayer({
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
          <AnimatedLine
            key={String(serie.id)}
            path={path}
            color={serie.color ?? "#888"}
          />
        );
      })}
    </g>
  );
}

function EndPointsLayer({ series }: LineCustomSvgLayerProps<DefaultSeries>) {
  return (
    <g>
      {series.map((serie) => {
        const last = serie.data[serie.data.length - 1];
        if (!last) return null;
        const color = serie.color ?? "#888";
        return (
          <EndPoint
            key={String(serie.id)}
            x={last.position.x}
            y={last.position.y}
            color={color}
          />
        );
      })}
    </g>
  );
}

function EndPoint({
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

export function AssetsDebtChart({
  data,
  loading = false,
  range,
  onRangeChange,
  className,
}: AssetsDebtChartProps) {
  const gradientId = useId().replace(/:/g, "");

  const nivoData: DefaultSeries[] = useMemo(() => {
    if (!data?.points.length) return [];
    return [
      {
        id: "Assets",
        data: data.points.map((point) => ({
          x: point.date,
          y: point.assetsCents / 100,
        })),
      },
      {
        id: "Debt",
        data: data.points.map((point) => ({
          x: point.date,
          y: point.debtCents / 100,
        })),
      },
    ];
  }, [data]);

  const paints = useMemo(() => {
    const muted = readCssColor("--muted", "#888");
    return { muted };
  }, []);

  const theme = useMemo(
    () => ({
      background: "transparent",
      text: { fill: paints.muted, fontSize: 11 },
      crosshair: {
        line: {
          stroke: paints.muted,
          strokeWidth: 1,
          strokeOpacity: 0.35,
          strokeDasharray: "3 4",
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

  const hasData = Boolean(data && data.points.length > 0);
  const sectionClass = ["finance-assets-debt-chart", className]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={sectionClass} aria-label="Amount of assets">
      <header className="finance-assets-debt-chart__header">
        <div className="finance-assets-debt-chart__metrics">
          <div className="finance-assets-debt-chart__metric">
            <div className="finance-assets-debt-chart__metric-label">
              <span
                className="finance-assets-debt-chart__swatch"
                style={{ background: ASSET_COLOR }}
              />
              Assets
            </div>
            <div className="finance-assets-debt-chart__metric-value">
              {loading && !data ? "…" : formatMoney(data?.assetsCents ?? 0)}
            </div>
            {data ? (
              <ChangeBadge
                currentCents={data.assetsCents}
                startCents={data.startAssetsCents}
                sense="assets"
              />
            ) : null}
          </div>
          <div className="finance-assets-debt-chart__metric">
            <div className="finance-assets-debt-chart__metric-label">
              <span
                className="finance-assets-debt-chart__swatch"
                style={{ background: DEBT_COLOR }}
              />
              Debt
            </div>
            <div className="finance-assets-debt-chart__metric-value">
              {loading && !data ? "…" : formatMoney(data?.debtCents ?? 0)}
            </div>
            {data ? (
              <ChangeBadge
                currentCents={data.debtCents}
                startCents={data.startDebtCents}
                sense="debt"
              />
            ) : null}
          </div>
        </div>
      </header>

      <div className="finance-assets-debt-chart__plot">
        {loading && !hasData ? (
          <FinanceChartLoading />
        ) : !hasData ? (
          <FinanceChartEmpty>No account balances yet.</FinanceChartEmpty>
        ) : (
          <FinanceChartFadeIn>
          <ResponsiveLine
            data={nivoData}
            margin={{ top: 12, right: 12, bottom: 8, left: 12 }}
            xScale={{ type: "point" }}
            yScale={{
              type: "linear",
              min: 0,
              max: "auto",
              nice: true,
            }}
            colors={[ASSET_COLOR, DEBT_COLOR]}
            enableGridX={false}
            enableGridY={false}
            axisTop={null}
            axisRight={null}
            axisBottom={null}
            axisLeft={null}
            enablePoints={false}
            enableArea={false}
            useMesh
            enableSlices="x"
            crosshairType="x"
            theme={theme}
            layers={[
              (props) => (
                <AssetsAreaLayer {...props} gradientId={gradientId} />
              ),
              LinesLayer,
              EndPointsLayer,
              "slices",
              "mesh",
            ]}
            sliceTooltip={({ slice }) => {
              const x = String(slice.points[0]?.data.x ?? "");
              return (
                <FinanceChartTooltip className="finance-accounts-view__chart-tooltip">
                  <div className="finance-accounts-view__chart-tooltip-title">
                    {formatTooltipDate(x)}
                  </div>
                  {slice.points.map((point) => (
                    <div
                      key={point.id}
                      className="finance-accounts-view__chart-tooltip-row"
                    >
                      <span
                        className="finance-accounts-view__chart-tooltip-swatch"
                        style={{ background: point.seriesColor }}
                      />
                      <span>{point.seriesId}</span>
                      <strong>
                        {formatMoney(Math.round(Number(point.data.y) * 100))}
                      </strong>
                    </div>
                  ))}
                </FinanceChartTooltip>
              );
            }}
            role="application"
            ariaLabel="Assets and debt over time"
          />
          </FinanceChartFadeIn>
        )}
      </div>

      <div className="finance-assets-debt-chart__ranges" role="tablist" aria-label="Range">
        {RANGES.map((entry) => {
          const active = entry === range;
          return (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={active}
              className={[
                "finance-assets-debt-chart__range",
                active ? "is-active" : null,
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onRangeChange(entry)}
            >
              {entry}
            </button>
          );
        })}
      </div>
    </section>
  );
}
