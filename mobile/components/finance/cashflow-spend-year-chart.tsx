import { matchFont } from "@shopify/react-native-skia";
import { useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { CartesianChart, StackedBar } from "victory-native";

import { CashflowChartSummary } from "./cashflow-chart-summary";
import {
  buildCashflowSpendYearSeries,
  cashflowSpendYearChartHasData,
  type CashflowCategoryMonthSpend,
} from "../../lib/cashflow-charts";
import type { FinanceCategoryRow } from "../../lib/finance-categories";
import { colors as theme } from "../../lib/theme";

const axisFont = matchFont({
  fontFamily: Platform.select({ ios: "Helvetica", default: "sans-serif" }),
  fontSize: 10,
});

type Props = {
  year: number;
  asOf: string;
  categoryMonths: readonly CashflowCategoryMonthSpend[];
  categories: readonly FinanceCategoryRow[];
  ytdExpenseCents: number;
  priorYtdExpenseCents: number;
  loading?: boolean;
  height?: number;
};

/** Stacked monthly spend by root category (desktop CashflowSpendYearChart). */
export function CashflowSpendYearChart({
  year,
  asOf,
  categoryMonths,
  categories,
  ytdExpenseCents,
  priorYtdExpenseCents,
  loading = false,
  height = 200,
}: Props) {
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

  const yKeys = useMemo(
    () => series.keys.map((_, index) => `s${index}`),
    [series.keys],
  );

  const chartData = useMemo(
    () =>
      series.rows.map((row, rowIndex) => {
        const record: Record<string, number> = { x: rowIndex };
        row.values.forEach((euros, index) => {
          record[`s${index}`] = euros;
        });
        return record;
      }),
    [series.rows],
  );

  const stackColors = useMemo(
    () => series.keys.map((key) => series.colors[key] ?? theme.muted),
    [series.colors, series.keys],
  );

  const hasData = cashflowSpendYearChartHasData(series);

  return (
    <View>
      <CashflowChartSummary
        year={year}
        asOf={asOf}
        ytdCents={ytdExpenseCents}
        priorYtdCents={priorYtdExpenseCents}
        loading={loading}
        sense="spend"
      />
      {loading && !hasData ? (
        <View style={[styles.placeholder, { height }]}>
          <Text style={styles.placeholderText}>Loading…</Text>
        </View>
      ) : !hasData ? (
        <View style={[styles.placeholder, { height }]}>
          <Text style={styles.placeholderText}>No spending this year yet.</Text>
        </View>
      ) : (
        <>
          <View style={{ height }}>
            <CartesianChart
              data={chartData}
              xKey="x"
              // Dynamic stack keys — Victory's generics expect a fixed tuple.
              yKeys={yKeys as never}
              domainPadding={{ left: 8, right: 8, top: 16 }}
              axisOptions={{
                font: axisFont,
                labelColor: theme.muted,
                lineColor: "rgba(255, 255, 255, 0.08)",
                tickCount: { x: 6, y: 4 },
                formatXLabel: (value) =>
                  series.rows[Math.round(Number(value))]?.monthLabel ?? "",
                formatYLabel: (value) => {
                  const n = Number(value);
                  if (!Number.isFinite(n)) return "";
                  if (Math.abs(n) >= 1000) {
                    return `${(n / 1000).toFixed(0)}k`;
                  }
                  return `${Math.round(n)}`;
                },
              }}
            >
              {({ points, chartBounds }) => {
                const pointMap = points as Record<
                  string,
                  (typeof points)[keyof typeof points]
                >;
                return (
                  <StackedBar
                    chartBounds={chartBounds}
                    points={yKeys.map((key) => pointMap[key]!)}
                    colors={stackColors}
                    innerPadding={0.32}
                    barOptions={({ isTop }) => ({
                      roundedCorners: isTop
                        ? { topLeft: 3, topRight: 3 }
                        : undefined,
                    })}
                  />
                );
              }}
            </CartesianChart>
          </View>
          <View style={styles.legend}>
            {series.keys.map((key) => (
              <View key={key} style={styles.legendItem}>
                <View
                  style={[
                    styles.legendSwatch,
                    { backgroundColor: series.colors[key] ?? theme.muted },
                  ]}
                />
                <Text style={styles.legendLabel} numberOfLines={1}>
                  {series.labels[key] ?? key}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    color: theme.muted,
    fontSize: 13,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: "48%",
  },
  legendSwatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  legendLabel: {
    color: theme.muted,
    fontSize: 11,
    flexShrink: 1,
  },
});
