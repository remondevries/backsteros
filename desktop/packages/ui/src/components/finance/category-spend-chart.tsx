"use client";

import type {
  FinancialCategory,
  FinancialTransaction,
} from "@backsteros/contracts";
import {
  ResponsiveBar,
  type BarCustomLayerProps,
  type BarDatum,
  type BarTooltipProps,
  type ComputedDatum,
} from "@nivo/bar";
import { animated, useSpring } from "@react-spring/web";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  buildCategorySpendBarSeries,
  CATEGORY_SPEND_DIRECT_KEY,
  categorySpendChartHasData,
  type CategorySpendBarSeries,
  type CategorySpendMonthInput,
} from "../../finance/category-spend-chart-series.js";
import {
  DEFAULT_ENTITY_ICON_COLOR,
  getEntityIconColor,
} from "../../entity/entity-icon.js";
import {
  FinanceChartEmpty,
  FinanceChartFadeIn,
  FinanceChartLoading,
} from "./finance-chart-status.js";
import { FinanceChartTooltip } from "./finance-chart-tooltip.js";

export type CategorySpendChartProps = {
  categoryId: string;
  categoryName: string;
  accent: string;
  months: CategorySpendMonthInput[];
  transactions: FinancialTransaction[];
  /** Direct child categories — when present, bars are stacked by subcategory. */
  childCategories: FinancialCategory[];
  /**
   * Parent / leaf monthly budget in cents. Shown as a gray dashed line.
   * When a subcategory segment is hovered, this line dims and the child's
   * budget line is shown instead (if that child has a budget).
   */
  budgetCents?: number | null;
  loading?: boolean;
};

const CHART_MOTION = {
  mass: 1,
  tension: 170,
  friction: 26,
  clamp: false,
} as const;

const CHART_MARGIN = { top: 12, right: 16, bottom: 28, left: 56 } as const;

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

/** Absolute currency amount without a sign (sign is applied by the caller). */
function formatEuroAbsolute(value: number): string {
  return formatEuro(Math.abs(value));
}

function formatTooltipAmount(value: number): string {
  const absolute = formatEuroAbsolute(value);
  return value < 0 ? `-${absolute}` : absolute;
}

function CategoryBarTooltip({
  keys,
  labels,
  colors,
  signedByKey,
  indexValue,
  data,
}: {
  keys: string[];
  labels: Record<string, string>;
  colors: Record<string, string>;
  signedByKey: Record<string, number>;
} & Pick<BarTooltipProps<BarDatum>, "indexValue" | "data">) {
  const monthLabel =
    typeof data.monthLabel === "string"
      ? data.monthLabel
      : String(indexValue);
  const rows = keys
    .map((key) => {
      const debit = Number(data[key] ?? 0);
      const signed = signedByKey[key] ?? debit;
      return {
        key,
        label: labels[key] ?? key,
        color: colors[key] ?? "#9CA3AF",
        signed,
      };
    })
    .filter((row) => row.signed !== 0 || Number(data[row.key] ?? 0) > 0);
  const total = rows.reduce((sum, row) => sum + row.signed, 0);

  return (
    <FinanceChartTooltip className="finance-categories-view__chart-tooltip">
      <div className="finance-categories-view__chart-tooltip-title">
        {monthLabel}
      </div>
      {rows.map((row) => (
        <div
          key={row.key}
          className="finance-categories-view__chart-tooltip-row"
        >
          <span
            className="finance-categories-view__chart-tooltip-swatch"
            style={{ background: row.color }}
          />
          <span>{row.label}</span>
          <strong
            className={
              row.signed < 0
                ? "finance-categories-view__chart-tooltip-amount is-negative"
                : "finance-categories-view__chart-tooltip-amount is-positive"
            }
          >
            {formatTooltipAmount(row.signed)}
          </strong>
        </div>
      ))}
      {rows.length > 1 ? (
        <div className="finance-categories-view__chart-tooltip-row finance-categories-view__chart-tooltip-row--total">
          <span />
          <span>Total</span>
          <strong
            className={
              total < 0
                ? "finance-categories-view__chart-tooltip-amount is-negative"
                : "finance-categories-view__chart-tooltip-amount is-positive"
            }
          >
            {formatTooltipAmount(total)}
          </strong>
        </div>
      ) : null}
    </FinanceChartTooltip>
  );
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

function readCssColor(variable: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  return value || fallback;
}

function colorForCategory(category: FinancialCategory): string {
  return getEntityIconColor(category.icon) ?? DEFAULT_ENTITY_ICON_COLOR;
}

function seriesMaxStackedValue(series: CategorySpendBarSeries): number {
  let peak = 0;
  for (const row of series.data) {
    let total = 0;
    for (const key of series.keys) {
      total += Number(row[key] ?? 0);
    }
    peak = Math.max(peak, total);
  }
  return peak;
}

const BUDGET_LINE_MOTION = {
  mass: 1,
  tension: 210,
  friction: 28,
  clamp: true,
} as const;

type ChildBudgetLineState = {
  euros: number;
  color: string;
  label: string;
};

function AnimatedBudgetMarkers({
  yScale,
  innerWidth,
  muted,
  parentBudgetEuros,
  highlightingSubcategory,
  childBudget,
}: {
  yScale: (value: number) => number;
  innerWidth: number;
  muted: string;
  parentBudgetEuros: number | null;
  highlightingSubcategory: boolean;
  childBudget: ChildBudgetLineState | null;
}) {
  const parentSpring = useSpring({
    lineOpacity:
      parentBudgetEuros == null
        ? 0
        : highlightingSubcategory
          ? 0.28
          : 0.85,
    labelOpacity:
      parentBudgetEuros == null
        ? 0
        : highlightingSubcategory
          ? 0
          : 1,
    config: BUDGET_LINE_MOTION,
  });

  const showChild = childBudget != null && highlightingSubcategory;
  const childY =
    childBudget != null ? yScale(childBudget.euros) : yScale(0);
  const childSpring = useSpring({
    opacity: showChild ? 0.95 : 0,
    labelOpacity: showChild ? 1 : 0,
    y: childY,
    config: BUDGET_LINE_MOTION,
  });

  const parentY =
    parentBudgetEuros != null ? yScale(parentBudgetEuros) : null;

  return (
    <g pointerEvents="none" aria-hidden="true">
      {parentY != null ? (
        <g>
          <animated.line
            x1={0}
            x2={innerWidth}
            y1={parentY}
            y2={parentY}
            stroke={muted}
            strokeWidth={1.5}
            strokeDasharray="5 4"
            strokeOpacity={parentSpring.lineOpacity}
          />
          <animated.text
            x={4}
            y={parentY - 6}
            fill={muted}
            fontSize={11}
            fontWeight={550}
            fillOpacity={parentSpring.labelOpacity}
          >
            Budget
          </animated.text>
        </g>
      ) : null}
      {childBudget != null ? (
        <g>
          <animated.line
            x1={0}
            x2={innerWidth}
            y1={childSpring.y}
            y2={childSpring.y}
            stroke={childBudget.color}
            strokeWidth={1.75}
            strokeDasharray="5 4"
            strokeOpacity={childSpring.opacity}
          />
          <animated.text
            x={4}
            y={childSpring.y.to((value) => value - 6)}
            fill={childBudget.color}
            fontSize={11}
            fontWeight={550}
            fillOpacity={childSpring.labelOpacity}
          >
            {childBudget.label}
          </animated.text>
        </g>
      ) : null}
    </g>
  );
}

export function CategorySpendChart({
  categoryId,
  categoryName,
  accent,
  months,
  transactions,
  childCategories,
  budgetCents = null,
  loading = false,
}: CategorySpendChartProps) {
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const lastChildBudgetRef = useRef<ChildBudgetLineState | null>(null);

  const series = useMemo(
    () =>
      buildCategorySpendBarSeries({
        categoryId,
        categoryName,
        accent,
        months,
        transactions,
        children: childCategories,
        colorForCategory,
      }),
    [accent, categoryId, categoryName, childCategories, months, transactions],
  );

  const childBudgetById = useMemo(() => {
    const map = new Map<string, number>();
    for (const child of childCategories) {
      if (child.budgetCents != null && child.budgetCents > 0) {
        map.set(child.id, child.budgetCents);
      }
    }
    return map;
  }, [childCategories]);

  const paints = useMemo(() => {
    const muted = readCssColor("--muted", "#888");
    const foreground = readCssColor("--foreground", "#111");
    const background = readCssColor("--background", "#fff");
    return { muted, foreground, background };
  }, []);

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
      tooltip: {
        container: {
          background: "transparent",
          boxShadow: "none",
          padding: 0,
        },
      },
    }),
    [paints],
  );

  const hasData = categorySpendChartHasData(series);
  const parentBudgetEuros =
    budgetCents != null && budgetCents > 0 ? budgetCents / 100 : null;

  const highlightedChildBudgetEuros = useMemo(() => {
    if (!highlightedKey || highlightedKey === CATEGORY_SPEND_DIRECT_KEY) {
      return null;
    }
    if (highlightedKey === categoryId) return null;
    const cents = childBudgetById.get(highlightedKey);
    return cents != null && cents > 0 ? cents / 100 : null;
  }, [categoryId, childBudgetById, highlightedKey]);

  const highlightingSubcategory = highlightedChildBudgetEuros != null;

  if (
    highlightingSubcategory &&
    highlightedKey != null &&
    highlightedChildBudgetEuros != null
  ) {
    const nextChild: ChildBudgetLineState = {
      euros: highlightedChildBudgetEuros,
      color: series.colors[highlightedKey] ?? paints.muted,
      label: series.labels[highlightedKey] ?? "Budget",
    };
    const prevChild = lastChildBudgetRef.current;
    if (
      !prevChild ||
      prevChild.euros !== nextChild.euros ||
      prevChild.color !== nextChild.color ||
      prevChild.label !== nextChild.label
    ) {
      lastChildBudgetRef.current = nextChild;
    }
  }

  const childBudgetLine = lastChildBudgetRef.current;

  const yMax = useMemo(() => {
    const dataMax = seriesMaxStackedValue(series);
    const budgetPeak = Math.max(
      parentBudgetEuros ?? 0,
      highlightedChildBudgetEuros ?? 0,
      ...[...childBudgetById.values()].map((cents) => cents / 100),
    );
    if (dataMax <= 0 && budgetPeak <= 0) return undefined;
    return Math.max(dataMax, budgetPeak) * 1.05;
  }, [
    childBudgetById,
    highlightedChildBudgetEuros,
    parentBudgetEuros,
    series,
  ]);

  const BudgetLinesLayer = useCallback(
    (layerProps: BarCustomLayerProps<BarDatum>) => {
      const scale = layerProps.yScale as (value: number) => number | undefined;
      const yScale = (value: number) => {
        const mapped = scale(value);
        return typeof mapped === "number" && Number.isFinite(mapped)
          ? mapped
          : 0;
      };
      return (
        <AnimatedBudgetMarkers
          yScale={yScale}
          innerWidth={layerProps.innerWidth}
          muted={paints.muted}
          parentBudgetEuros={parentBudgetEuros}
          highlightingSubcategory={highlightingSubcategory}
          childBudget={childBudgetLine}
        />
      );
    },
    [
      childBudgetLine,
      highlightingSubcategory,
      paints.muted,
      parentBudgetEuros,
    ],
  );

  const colorById = (datum: { id: string | number }) =>
    series.colors[String(datum.id)] ?? DEFAULT_ENTITY_ICON_COLOR;

  const tickValues =
    series.data.length > 8
      ? series.data
          .filter((_, index, all) => {
            const step = Math.ceil(all.length / 6);
            return index % step === 0 || index === all.length - 1;
          })
          .map((row) => row.month)
      : undefined;

  const stacked = series.keys.length > 1;

  return (
    <section
      className="finance-categories-view__chart"
      aria-label="Total spend per month"
    >
      <div className="finance-categories-view__chart-plot">
        {loading ? (
          <FinanceChartLoading />
        ) : hasData ? (
          <FinanceChartFadeIn>
            <ResponsiveBar
              data={series.data}
              keys={series.keys}
              indexBy="month"
              margin={CHART_MARGIN}
              padding={0.28}
              innerPadding={stacked ? 1.5 : 0}
              groupMode="stacked"
              valueScale={{
                type: "linear",
                nice: true,
                min: 0,
                max: yMax ?? "auto",
              }}
              indexScale={{ type: "band", round: true }}
              colorBy="id"
              colors={colorById}
              borderRadius={stacked ? 2 : 3}
              borderWidth={stacked ? 1 : 0}
              borderColor={paints.background}
              enableLabel={false}
              enableGridX={false}
              enableGridY
              axisTop={null}
              axisRight={null}
              axisBottom={{
                tickSize: 0,
                tickPadding: 10,
                tickValues,
                format: (value) => {
                  const row = series.data.find((entry) => entry.month === value);
                  return row?.monthLabel ?? String(value);
                },
              }}
              axisLeft={{
                tickSize: 0,
                tickPadding: 8,
                tickValues: 4,
                format: (value) => formatEuroAxis(Number(value)),
              }}
              layers={[
                "grid",
                "axes",
                "bars",
                BudgetLinesLayer,
                "legends",
                "annotations",
              ]}
              animate
              motionConfig={CHART_MOTION}
              theme={theme}
              onMouseEnter={(datum: ComputedDatum<BarDatum>) => {
                setHighlightedKey(String(datum.id));
              }}
              onMouseLeave={() => {
                setHighlightedKey(null);
              }}
              tooltip={(props) => {
                const month = String(props.data.month ?? props.indexValue);
                return (
                  <CategoryBarTooltip
                    keys={series.keys}
                    labels={series.labels}
                    colors={series.colors}
                    signedByKey={series.signedByMonth[month] ?? {}}
                    indexValue={props.indexValue}
                    data={props.data}
                  />
                );
              }}
            />
          </FinanceChartFadeIn>
        ) : (
          <FinanceChartEmpty>No spending recorded yet.</FinanceChartEmpty>
        )}
      </div>
    </section>
  );
}
