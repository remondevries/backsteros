import { matchFont } from "@shopify/react-native-skia";
import { useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Bar, CartesianChart } from "victory-native";

import { CashflowChartSummary } from "./cashflow-chart-summary";
import { buildCashflowIncomeYearPoints } from "../../lib/cashflow-charts";
import type { BankAccountCashflowMonth } from "@backsteros/contracts";
import { colors as theme } from "../../lib/theme";

const INCOME_BAR_COLOR = "#5B9FD8";

const axisFont = matchFont({
  fontFamily: Platform.select({ ios: "Helvetica", default: "sans-serif" }),
  fontSize: 10,
});

type Props = {
  year: number;
  asOf: string;
  months: readonly BankAccountCashflowMonth[];
  ytdIncomeCents: number;
  priorYtdIncomeCents: number;
  loading?: boolean;
  height?: number;
};

/** Monthly income bars for the cashflow year (desktop CashflowIncomeYearChart). */
export function CashflowIncomeYearChart({
  year,
  asOf,
  months,
  ytdIncomeCents,
  priorYtdIncomeCents,
  loading = false,
  height = 200,
}: Props) {
  const points = useMemo(
    () => buildCashflowIncomeYearPoints({ year, asOf, months }),
    [asOf, months, year],
  );

  const chartData = useMemo(
    () =>
      points.map((point, index) => ({
        index,
        monthLabel: point.monthLabel,
        income: point.income,
      })),
    [points],
  );

  const hasData = points.some((point) => point.income > 0);

  return (
    <View>
      <CashflowChartSummary
        year={year}
        asOf={asOf}
        ytdCents={ytdIncomeCents}
        priorYtdCents={priorYtdIncomeCents}
        loading={loading}
        sense="income"
      />
      {loading && !hasData ? (
        <View style={[styles.placeholder, { height }]}>
          <Text style={styles.placeholderText}>Loading…</Text>
        </View>
      ) : !hasData ? (
        <View style={[styles.placeholder, { height }]}>
          <Text style={styles.placeholderText}>No income this year yet.</Text>
        </View>
      ) : (
        <View style={{ height }}>
          <CartesianChart
            data={chartData}
            xKey="index"
            yKeys={["income"]}
            domainPadding={{ left: 8, right: 8, top: 16 }}
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
            {({ points: chartPoints, chartBounds }) => (
              <Bar
                points={chartPoints.income!}
                chartBounds={chartBounds}
                color={INCOME_BAR_COLOR}
                innerPadding={0.32}
                roundedCorners={{
                  topLeft: 4,
                  topRight: 4,
                }}
              />
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
