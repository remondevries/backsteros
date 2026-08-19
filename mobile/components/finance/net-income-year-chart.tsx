import { DashPathEffect, matchFont } from "@shopify/react-native-skia";
import { useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Bar, CartesianChart, Line } from "victory-native";

import { CashflowChartSummary } from "./cashflow-chart-summary";
import {
  buildNetIncomeYearChartSeries,
  netIncomeYearChartHasData,
  type NetIncomeYearChartSeries,
} from "../../lib/cashflow-charts";
import type { BankAccountCashflowMonth } from "@backsteros/contracts";
import { colors as theme } from "../../lib/theme";

const POSITIVE_COLOR = "#22c55e";
const NEGATIVE_COLOR = "#ef4444";
const CUMULATIVE_COLOR = "rgba(255, 255, 255, 0.35)";

const axisFont = matchFont({
  fontFamily: Platform.select({ ios: "Helvetica", default: "sans-serif" }),
  fontSize: 10,
});

type Props = {
  year: number;
  asOf: string;
  months: readonly BankAccountCashflowMonth[];
  ytdNetCents: number;
  priorYtdNetCents: number;
  loading?: boolean;
  height?: number;
};

type ChartRow = {
  index: number;
  monthLabel: string;
  positive: number;
  negative: number;
  cumulative: number;
};

/** Bipolar monthly net bars + cumulative dashed line (desktop NetIncomeYearChart). */
export function NetIncomeYearChart({
  year,
  asOf,
  months,
  ytdNetCents,
  priorYtdNetCents,
  loading = false,
  height = 220,
}: Props) {
  const series: NetIncomeYearChartSeries = useMemo(
    () =>
      buildNetIncomeYearChartSeries({
        year,
        asOf,
        months,
        ytdNetCents,
        priorYtdNetCents,
      }),
    [asOf, months, priorYtdNetCents, year, ytdNetCents],
  );

  const chartData = useMemo<ChartRow[]>(
    () =>
      series.points.map((point, index) => ({
        index,
        monthLabel: point.monthLabel,
        positive: point.net > 0 ? point.net : 0,
        negative: point.net < 0 ? point.net : 0,
        cumulative: point.isFutureMonth ? Number.NaN : point.cumulative,
      })),
    [series.points],
  );

  const hasData = netIncomeYearChartHasData(series);

  return (
    <View>
      <CashflowChartSummary
        year={year}
        asOf={asOf}
        ytdCents={ytdNetCents}
        priorYtdCents={priorYtdNetCents}
        loading={loading}
        sense="net"
      />
      {loading && !hasData ? (
        <View style={[styles.placeholder, { height }]}>
          <Text style={styles.placeholderText}>Loading…</Text>
        </View>
      ) : !hasData ? (
        <View style={[styles.placeholder, { height }]}>
          <Text style={styles.placeholderText}>No net income this year yet.</Text>
        </View>
      ) : (
        <View style={{ height }}>
          <CartesianChart
            data={chartData}
            xKey="index"
            yKeys={["positive", "negative", "cumulative"]}
            domainPadding={{ left: 8, right: 8, top: 16, bottom: 8 }}
            axisOptions={{
              font: axisFont,
              labelColor: theme.muted,
              lineColor: "rgba(255, 255, 255, 0.08)",
              tickCount: { x: 6, y: 4 },
              formatXLabel: (value) =>
                chartData[Math.round(Number(value))]?.monthLabel ?? "",
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
            {({ points, chartBounds }) => (
              <>
                <Bar
                  points={points.positive!}
                  chartBounds={chartBounds}
                  color={POSITIVE_COLOR}
                  innerPadding={0.32}
                  roundedCorners={{
                    topLeft: 3,
                    topRight: 3,
                    bottomLeft: 3,
                    bottomRight: 3,
                  }}
                />
                <Bar
                  points={points.negative!}
                  chartBounds={chartBounds}
                  color={NEGATIVE_COLOR}
                  innerPadding={0.32}
                  roundedCorners={{
                    topLeft: 3,
                    topRight: 3,
                    bottomLeft: 3,
                    bottomRight: 3,
                  }}
                />
                <Line
                  points={points.cumulative!}
                  color={CUMULATIVE_COLOR}
                  strokeWidth={1.25}
                  curveType="linear"
                >
                  <DashPathEffect intervals={[3, 4]} />
                </Line>
              </>
            )}
          </CartesianChart>
        </View>
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
});
