"use client";

import type {
  BankAccountCashflowMonth,
  FinancialCategory,
  WorkspaceCashflow,
} from "@backsteros/contracts";
import {
  ResponsiveBar,
  type BarDatum,
  type BarTooltipProps,
} from "@nivo/bar";
import { useMemo } from "react";

import {
  buildCashflowSpendYearSeries,
  cashflowSpendYearChartHasData,
} from "../finance/cashflow-spend-year-chart-series.js";
import {
  handleCashflowBarMonthClick,
  CashflowSelectedMonthBand,
  SelectableCashflowBar,
} from "./cashflow-chart-bars.js";
import { CashflowChartSummary } from "./cashflow-chart-summary.js";
import { FinanceChartTooltip } from "./finance-chart-tooltip.js";
import {
  FinanceChartEmpty,
  FinanceChartFadeIn,
  FinanceChartLoading,
} from "./finance-chart-status.js";

export type CashflowSpendYearChartProps = {
  year: number;
  asOf: string;
  categoryMonths: WorkspaceCashflow["categoryMonths"];
  categories: FinancialCategory[];
  ytdExpenseCents: number;
  priorYtdExpenseCents: number;
  loading?: boolean;
  className?: string;
  /** Called when the user clicks a past/present month bar. */
  onMonthSelect?: (month: string) => void;
};

const CHART_MARGIN = { top: 28, right: 12, bottom: 28, left: 48 } as const;
const INCOME_BAR_COLOR = "#5B9FD8";

function formatEuro(value: number, fractionDigits = 0): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: fractionDigits,
    }).format(value);
  } catch {
    return `€${value.toFixed(fractionDigits)}`;
  }
}

function formatEuroAxis(value: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "EUR",
      notation: Math.abs(value) >= 1000 ? "compact" : "standard",
      maximumFractionDigits: 0,
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

function SpendTooltip({
  keys,
  labels,
  colors,
  indexValue,
  data,
}: {
  keys: string[];
  labels: Record<string, string>;
  colors: Record<string, string>;
} & Pick<BarTooltipProps<BarDatum>, "indexValue" | "data">) {
  const title =
    typeof data.tooltipLabel === "string"
      ? data.tooltipLabel
      : String(indexValue);
  const rows = keys
    .map((key) => ({
      key,
      label: labels[key] ?? key,
      color: colors[key] ?? "#9CA3AF",
      value: Number(data[key] ?? 0),
    }))
    .filter((row) => row.value > 0);
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  return (
    <FinanceChartTooltip className="finance-accounts-view__chart-tooltip">
      <div className="finance-accounts-view__chart-tooltip-title">{title}</div>
      {rows.map((row) => (
        <div
          key={row.key}
          className="finance-accounts-view__chart-tooltip-row"
        >
          <span
            className="finance-accounts-view__chart-tooltip-swatch"
            style={{ background: row.color }}
          />
          <span>{row.label}</span>
          <strong>{formatEuro(row.value, 2)}</strong>
        </div>
      ))}
      {rows.length > 1 ? (
        <div className="finance-accounts-view__chart-tooltip-row">
          <span />
          <span>Total</span>
          <strong>{formatEuro(total, 2)}</strong>
        </div>
      ) : null}
    </FinanceChartTooltip>
  );
}

export function CashflowSpendYearChart({
  year,
  asOf,
  categoryMonths,
  categories,
  ytdExpenseCents,
  priorYtdExpenseCents,
  loading = false,
  className,
  onMonthSelect,
}: CashflowSpendYearChartProps) {
  const series = useMemo(
    () =>
      buildCashflowSpendYearSeries({
        year,
        asOf,
        categoryMonths,
        categories,
        ytdExpenseCents,
        priorYtdExpenseCents,
      }),
    [
      asOf,
      categories,
      categoryMonths,
      priorYtdExpenseCents,
      year,
      ytdExpenseCents,
    ],
  );

  const paints = useMemo(() => {
    const muted = readCssColor("--muted", "#888");
    const background = readCssColor("--background", "#fff");
    return { muted, background };
  }, []);

  const theme = useMemo(
    () => ({
      background: "transparent",
      text: { fill: paints.muted, fontSize: 11 },
      axis: {
        ticks: { text: { fill: paints.muted, fontSize: 11 } },
        domain: { line: { stroke: "transparent" } },
      },
      grid: {
        line: {
          stroke: paints.muted,
          strokeOpacity: 0.22,
          strokeWidth: 1,
          strokeDasharray: "4 4",
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

  const hasData = cashflowSpendYearChartHasData(series);
  const stacked = series.keys.length > 1;
  const sectionClass = ["finance-net-income-chart", className]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={sectionClass} aria-label="Spending">
      <CashflowChartSummary
        year={year}
        asOf={asOf}
        ytdCents={ytdExpenseCents}
        priorYtdCents={priorYtdExpenseCents}
        loading={loading}
        sense="spend"
      />
      <div className="finance-net-income-chart__plot">
        {loading ? (
          <FinanceChartLoading />
        ) : !hasData ? (
          <FinanceChartEmpty>No spending this year yet.</FinanceChartEmpty>
        ) : (
          <FinanceChartFadeIn>
          <ResponsiveBar
            data={series.data as unknown as BarDatum[]}
            keys={series.keys}
            indexBy="month"
            margin={CHART_MARGIN}
            padding={0.32}
            innerPadding={stacked ? 1 : 0}
            groupMode="stacked"
            valueScale={{ type: "linear", nice: true, min: 0, max: "auto" }}
            indexScale={{ type: "band", round: true }}
            colors={(bar) => series.colors[String(bar.id)] ?? INCOME_BAR_COLOR}
            borderRadius={stacked ? 2 : 4}
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
            theme={theme}
            barComponent={SelectableCashflowBar}
            onClick={(datum, event) =>
              handleCashflowBarMonthClick(datum, event, onMonthSelect)
            }
            layers={[
              "grid",
              CashflowSelectedMonthBand,
              "axes",
              "bars",
              "markers",
              "legends",
              "annotations",
            ]}
            tooltip={(props) => (
              <SpendTooltip
                {...props}
                keys={series.keys}
                labels={series.labels}
                colors={series.colors}
              />
            )}
            role="application"
            ariaLabel="Monthly spending by category"
          />
          </FinanceChartFadeIn>
        )}
      </div>
    </section>
  );
}

export type CashflowIncomeYearChartProps = {
  year: number;
  asOf: string;
  months: BankAccountCashflowMonth[];
  ytdIncomeCents: number;
  priorYtdIncomeCents: number;
  loading?: boolean;
  className?: string;
  /** Called when the user clicks a past/present month bar. */
  onMonthSelect?: (month: string) => void;
};

function buildIncomeBarData(
  year: number,
  asOf: string,
  months: BankAccountCashflowMonth[],
  now = new Date(),
): BarDatum[] {
  const [asOfYear, asOfMonth] = asOf.split("-").map(Number);
  let visibleThrough =
    asOfYear === year ? asOfMonth || 1 : (asOfYear || 0) < year ? 0 : 12;
  if (now.getFullYear() > year) {
    visibleThrough = 12;
  } else if (now.getFullYear() === year) {
    visibleThrough = Math.max(visibleThrough, now.getMonth() + 1);
  }
  const byMonth = new Map(months.map((row) => [row.month, row]));
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    const isFutureMonth = index + 1 > visibleThrough;
    const isCurrentMonth = asOfYear === year && index + 1 === asOfMonth;
    const income = isFutureMonth
      ? 0
      : (byMonth.get(month)?.incomeCents ?? 0) / 100;
    const date = new Date(year, index, 1);
    const monthShort = date.toLocaleDateString(undefined, { month: "short" });
    return {
      month,
      income,
      monthLabel: index === 0 ? `${monthShort} ${year}` : monthShort,
      tooltipLabel: date.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      }),
      isCurrentMonth: isCurrentMonth ? 1 : 0,
      isFutureMonth: isFutureMonth ? 1 : 0,
    };
  });
}

function IncomeTooltip({
  indexValue,
  data,
}: Pick<BarTooltipProps<BarDatum>, "indexValue" | "data">) {
  const title =
    typeof data.tooltipLabel === "string"
      ? data.tooltipLabel
      : String(indexValue);
  const income = Number(data.income ?? 0);
  return (
    <FinanceChartTooltip className="finance-accounts-view__chart-tooltip">
      <div className="finance-accounts-view__chart-tooltip-title">{title}</div>
      <div className="finance-accounts-view__chart-tooltip-row">
        <span
          className="finance-accounts-view__chart-tooltip-swatch"
          style={{ background: INCOME_BAR_COLOR }}
        />
        <span>Income</span>
        <strong>{formatEuro(income, 2)}</strong>
      </div>
    </FinanceChartTooltip>
  );
}

export function CashflowIncomeYearChart({
  year,
  asOf,
  months,
  ytdIncomeCents,
  priorYtdIncomeCents,
  loading = false,
  className,
  onMonthSelect,
}: CashflowIncomeYearChartProps) {
  const data = useMemo(
    () => buildIncomeBarData(year, asOf, months),
    [asOf, months, year],
  );

  const paints = useMemo(() => {
    const muted = readCssColor("--muted", "#888");
    return { muted };
  }, []);

  const theme = useMemo(
    () => ({
      background: "transparent",
      text: { fill: paints.muted, fontSize: 11 },
      axis: {
        ticks: { text: { fill: paints.muted, fontSize: 11 } },
        domain: { line: { stroke: "transparent" } },
      },
      grid: {
        line: {
          stroke: paints.muted,
          strokeOpacity: 0.22,
          strokeWidth: 1,
          strokeDasharray: "4 4",
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

  const hasData = data.some((row) => Number(row.income) > 0);
  const sectionClass = ["finance-net-income-chart", className]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={sectionClass} aria-label="Income">
      <CashflowChartSummary
        year={year}
        asOf={asOf}
        ytdCents={ytdIncomeCents}
        priorYtdCents={priorYtdIncomeCents}
        loading={loading}
        sense="income"
      />
      <div className="finance-net-income-chart__plot">
        {loading ? (
          <FinanceChartLoading />
        ) : !hasData ? (
          <FinanceChartEmpty>No income this year yet.</FinanceChartEmpty>
        ) : (
          <FinanceChartFadeIn>
          <ResponsiveBar
            data={data}
            keys={["income"]}
            indexBy="month"
            margin={CHART_MARGIN}
            padding={0.32}
            valueScale={{ type: "linear", nice: true, min: 0, max: "auto" }}
            indexScale={{ type: "band", round: true }}
            colors={INCOME_BAR_COLOR}
            borderRadius={4}
            enableLabel={false}
            enableGridX={false}
            enableGridY
            axisTop={null}
            axisRight={null}
            axisBottom={{
              tickSize: 0,
              tickPadding: 10,
              format: (value) => {
                const row = data.find((entry) => entry.month === value);
                return String(row?.monthLabel ?? value);
              },
            }}
            axisLeft={{
              tickSize: 0,
              tickPadding: 8,
              tickValues: 4,
              format: (value) => formatEuroAxis(Number(value)),
            }}
            theme={theme}
            barComponent={SelectableCashflowBar}
            onClick={(datum, event) =>
              handleCashflowBarMonthClick(datum, event, onMonthSelect)
            }
            layers={[
              "grid",
              CashflowSelectedMonthBand,
              "axes",
              "bars",
              "markers",
              "legends",
              "annotations",
            ]}
            tooltip={(props) => <IncomeTooltip {...props} />}
            role="application"
            ariaLabel="Monthly income"
          />
          </FinanceChartFadeIn>
        )}
      </div>
    </section>
  );
}
