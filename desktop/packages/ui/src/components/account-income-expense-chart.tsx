"use client";

import type {
  BankAccountCashflowMonth,
  FinancialTransaction,
} from "@backsteros/contracts";
import { useAnimatedPath } from "@nivo/core";
import {
  ResponsiveLine,
  type DefaultSeries,
  type LineCustomSvgLayerProps,
} from "@nivo/line";
import { animated, useSpring } from "@react-spring/web";
import { useId, useMemo } from "react";

import {
  accountChartHasYearActivity,
  buildAccountIncomeExpenseChartSeries,
  buildAccountIncomeExpenseChartSeriesFromCashflow,
  buildMonthIncomeExpenseDailyChartSeries,
} from "../finance/account-income-expense-chart-series.js";
import { FinanceChartTooltip } from "./finance-chart-tooltip.js";
import {
  FinanceChartEmpty,
  FinanceChartFadeIn,
  FinanceChartLoading,
} from "./finance-chart-status.js";

export type AccountIncomeExpenseChartProps = {
  /** Preferred: server cashflow aggregate for the chart year. */
  cashflowMonths?: BankAccountCashflowMonth[] | null;
  cashflowYear?: number | null;
  /** Fallback when cashflow is unavailable (client-side bucket from rows). */
  transactions?: FinancialTransaction[];
  /**
   * `year` (default): monthly totals for the calendar year.
   * `month`: daily totals for the calendar month of `asOf` (uses `transactions`).
   */
  scope?: "year" | "month";
  /** Drives which year/month (and last day) to include. Defaults to today. */
  asOf?: Date;
  loading?: boolean;
  /** Optional class on the outer section (e.g. dashboard compact layout). */
  className?: string;
  /** Override income line/area color (default green). */
  incomeColor?: string;
  /** Override expense line/area color (default red). */
  expenseColor?: string;
  /** When false, only the income series is drawn (e.g. Moneybird billed revenue). */
  showExpense?: boolean;
  /** Series label in the tooltip for income (default "Income"). */
  incomeSeriesLabel?: string;
  /** Series label in the tooltip for expense (default "Expense"). */
  expenseSeriesLabel?: string;
  /** Empty-state copy. */
  emptyMessage?: string;
  /** Accessible name for the chart region. */
  ariaLabel?: string;
  /**
   * When true with year cashflow data, keep all 12 month ticks on the axis.
   * Line values after the current month are omitted (null) so the series ends
   * instead of dropping to 0 for months with no data yet.
   */
  fullYear?: boolean;
  /** Category ids with kind transfer or listing excluded (raw tx charts only). */
  nonCashflowCategoryIds?: ReadonlySet<string>;
};

const INCOME_ID = "Income";
const EXPENSE_ID = "Expense";

const INCOME_COLOR = "#22c55e";
const EXPENSE_COLOR = "#ef4444";

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

/** Compact axis ticks so left labels are less likely to clip. */
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

const CHART_MARGIN = { top: 12, right: 16, bottom: 28, left: 56 } as const;

function readCssColor(variable: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  return value || fallback;
}

function isIncomeSeries(id: string | number): boolean {
  return String(id).toLowerCase() === "income";
}

function AccountChartAnimatedArea({
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

function AccountChartAnimatedLine({
  path,
  color,
}: {
  path: string;
  color: string;
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
    />
  );
}

/** Expense under income so overlapping fills/lines stay readable. */
function orderSeriesExpenseUnderIncome<T extends { id: string | number }>(
  series: readonly T[],
): T[] {
  return [...series].sort((a, b) => {
    const aIncome = isIncomeSeries(a.id) ? 1 : 0;
    const bIncome = isIncomeSeries(b.id) ? 1 : 0;
    return aIncome - bIncome;
  });
}

function AccountChartAreas({
  series,
  areaGenerator,
  incomeGradientId,
  expenseGradientId,
  incomeColor = INCOME_COLOR,
  expenseColor = EXPENSE_COLOR,
}: LineCustomSvgLayerProps<DefaultSeries> & {
  incomeGradientId: string;
  expenseGradientId: string;
  incomeColor?: string;
  expenseColor?: string;
}) {
  const ordered = orderSeriesExpenseUnderIncome(series);
  return (
    <g>
      {ordered.map((serie) => {
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
        const income = isIncomeSeries(serie.id);
        const color = serie.color ?? (income ? incomeColor : expenseColor);
        const gradientId = income ? incomeGradientId : expenseGradientId;
        return (
          <g key={`area-${String(serie.id)}`}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                <stop offset="60%" stopColor={color} stopOpacity={0.05} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <AccountChartAnimatedArea path={path} gradientId={gradientId} />
          </g>
        );
      })}
    </g>
  );
}

function AccountChartLines({
  series,
  lineGenerator,
}: LineCustomSvgLayerProps<DefaultSeries>) {
  const ordered = orderSeriesExpenseUnderIncome(series);

  return (
    <g>
      {ordered.map((serie) => {
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
          <AccountChartAnimatedLine
            key={String(serie.id)}
            path={path}
            color={serie.color ?? "#888"}
          />
        );
      })}
    </g>
  );
}

function AccountChartPoint({
  x,
  y,
  color,
  outerRadius = 5,
  innerRadius = 2,
}: {
  x: number;
  y: number;
  color: string;
  outerRadius?: number;
  innerRadius?: number;
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
        r={outerRadius}
        fill={background}
        stroke={color}
        strokeWidth={2}
      />
      <animated.circle
        cx={style.cx}
        cy={style.cy}
        r={innerRadius}
        fill={color}
      />
    </g>
  );
}

function AccountChartEndPoints({
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
          <AccountChartPoint
            key={String(serie.id)}
            x={last.position.x}
            y={last.position.y}
            color={serie.color ?? "#888"}
          />
        );
      })}
    </g>
  );
}

/** Month markers along the line (used when plotting a full calendar year). */
function AccountChartMonthPoints({
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
            <AccountChartPoint
              key={`${String(serie.id)}-${index}`}
              x={point.position.x}
              y={point.position.y}
              color={serie.color ?? "#888"}
              outerRadius={4}
              innerRadius={1.75}
            />
          );
        }),
      )}
    </g>
  );
}

export function AccountIncomeExpenseChart({
  cashflowMonths = null,
  cashflowYear = null,
  transactions = [],
  scope = "year",
  asOf,
  loading = false,
  className,
  incomeColor = INCOME_COLOR,
  expenseColor = EXPENSE_COLOR,
  showExpense = true,
  incomeSeriesLabel = INCOME_ID,
  expenseSeriesLabel = EXPENSE_ID,
  emptyMessage,
  ariaLabel = "Income and expense chart",
  fullYear = false,
  nonCashflowCategoryIds,
}: AccountIncomeExpenseChartProps) {
  const idBase = useId().replace(/:/g, "");
  const incomeGradientId = `account-income-area-${idBase}`;
  const expenseGradientId = `account-expense-area-${idBase}`;
  const sectionClass = ["finance-accounts-view__chart", className]
    .filter(Boolean)
    .join(" ");
  const series = useMemo(() => {
    const excludeIds = nonCashflowCategoryIds ?? new Set<string>();
    const built =
      scope === "month"
        ? buildMonthIncomeExpenseDailyChartSeries({
            transactions,
            asOf,
            nonCashflowCategoryIds: excludeIds,
          })
        : cashflowMonths && cashflowYear != null
          ? buildAccountIncomeExpenseChartSeriesFromCashflow({
              year: cashflowYear,
              months: cashflowMonths,
              asOf,
              fullYear,
            })
          : buildAccountIncomeExpenseChartSeries({
              transactions,
              asOf,
              nonCashflowCategoryIds: excludeIds,
            });
    return showExpense
      ? built
      : built.filter((line) => line.id === "income");
  }, [
    asOf,
    cashflowMonths,
    cashflowYear,
    fullYear,
    nonCashflowCategoryIds,
    scope,
    showExpense,
    transactions,
  ]);
  const hasActivity = accountChartHasYearActivity(series);

  const paints = useMemo(() => {
    const muted = readCssColor("--muted", "#888");
    const foreground = readCssColor("--foreground", "#111");
    const background = readCssColor("--background", "#fff");
    return {
      muted,
      foreground,
      background,
      income: incomeColor,
      expense: expenseColor,
    };
  }, [expenseColor, incomeColor]);

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

  const hasCashflow =
    scope === "year" && Boolean(cashflowMonths && cashflowYear != null);
  const waitingForData =
    loading && !hasCashflow && transactions.length === 0;
  const branch = waitingForData
    ? "loading"
    : !hasActivity
      ? "empty"
      : "chart";

  const resolvedEmptyMessage =
    emptyMessage ??
    (scope === "month"
      ? "No income or expense this month yet."
      : "No income or expense this year yet.");

  if (branch === "loading") {
    return (
      <section className={sectionClass} aria-label={ariaLabel}>
        <FinanceChartLoading />
      </section>
    );
  }

  if (branch === "empty") {
    return (
      <section className={sectionClass} aria-label={ariaLabel}>
        <FinanceChartEmpty>{resolvedEmptyMessage}</FinanceChartEmpty>
      </section>
    );
  }

  const labelByX = new Map<string, string>();
  const tooltipLabelByX = new Map<string, string>();
  for (const line of series) {
    for (const point of line.data) {
      labelByX.set(point.x, point.label);
      tooltipLabelByX.set(point.x, point.tooltipLabel ?? point.label);
    }
  }

  const incomeLine = series.find((line) => line.id === "income");
  const expenseLine = showExpense
    ? series.find((line) => line.id === "expense")
    : undefined;
  const nivoData: DefaultSeries[] = [];
  if (incomeLine) {
    nivoData.push({
      id: INCOME_ID,
      data: incomeLine.data.map((point) => ({ x: point.x, y: point.y })),
    });
  }
  if (expenseLine) {
    nivoData.push({
      id: EXPENSE_ID,
      data: expenseLine.data.map((point) => ({ x: point.x, y: point.y })),
    });
  }

  const axisSeries = incomeLine ?? expenseLine;
  // Full-year charts (e.g. invoices) always label every month; other charts
  // thin ticks when denser than ~8 points so the axis stays readable.
  const tickValues = fullYear
    ? axisSeries?.data
        .map((point) => point.x)
        .filter((value): value is string => value != null)
    : axisSeries && axisSeries.data.length > 8
      ? axisSeries.data
          .filter((_, index, all) => {
            const step = Math.ceil(all.length / 6);
            return index % step === 0 || index === all.length - 1;
          })
          .map((point) => point.x)
          .filter((value): value is string => value != null)
      : undefined;

  const seriesColors = showExpense
    ? [paints.income, paints.expense]
    : [paints.income];

  const chartMargin = fullYear
    ? { ...CHART_MARGIN, bottom: 32 }
    : CHART_MARGIN;

  return (
    <section className={sectionClass} aria-label={ariaLabel}>
      <FinanceChartFadeIn className="finance-accounts-view__chart-plot">
        <ResponsiveLine
          data={nivoData}
          margin={chartMargin}
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
              <AccountChartAreas
                {...props}
                incomeGradientId={incomeGradientId}
                expenseGradientId={expenseGradientId}
                incomeColor={paints.income}
                expenseColor={paints.expense}
              />
            ),
            AccountChartLines,
            fullYear ? AccountChartMonthPoints : AccountChartEndPoints,
            "slices",
            "mesh",
          ]}
          theme={theme}
          sliceTooltip={({ slice }) => (
            <FinanceChartTooltip className="finance-accounts-view__chart-tooltip">
              <div className="finance-accounts-view__chart-tooltip-title">
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
                  className="finance-accounts-view__chart-tooltip-row"
                >
                  <span
                    className="finance-accounts-view__chart-tooltip-swatch"
                    style={{
                      background: point.seriesColor,
                      borderColor: point.seriesColor,
                    }}
                  />
                  <span>
                    {String(point.seriesId) === INCOME_ID
                      ? incomeSeriesLabel
                      : String(point.seriesId) === EXPENSE_ID
                        ? expenseSeriesLabel
                        : point.seriesId}
                  </span>
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
