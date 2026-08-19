import {
  LinearGradient,
  matchFont,
  vec,
} from "@shopify/react-native-skia";
import { useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Area, CartesianChart, Line } from "victory-native";

import {
  incomeExpenseDailyHasActivity,
  type IncomeExpenseDailyPoint,
} from "../../lib/finance-chart-series";
import { colors as theme } from "../../lib/theme";

/** Desktop AccountIncomeExpenseChart palette. */
const INCOME_COLOR = "#22c55e";
const EXPENSE_COLOR = "#ef4444";

const axisFont = matchFont({
  fontFamily: Platform.select({ ios: "Helvetica", default: "sans-serif" }),
  fontSize: 10,
});

type Props = {
  points: IncomeExpenseDailyPoint[];
  loading?: boolean;
  height?: number;
};

/**
 * Daily income + expense line chart for the selected dashboard month
 * (desktop `AccountIncomeExpenseChart` with `scope="month"`).
 */
export function IncomeExpenseDailyChart({
  points,
  loading = false,
  height = 180,
}: Props) {
  const hasActivity = incomeExpenseDailyHasActivity(points);

  const xTickIndices = useMemo(() => {
    if (points.length <= 8) {
      return new Set(points.map((_, index) => index));
    }
    const step = Math.ceil(points.length / 6);
    const ticks = new Set<number>();
    for (let index = 0; index < points.length; index += step) {
      ticks.add(index);
    }
    ticks.add(points.length - 1);
    return ticks;
  }, [points]);

  if (loading && points.length === 0) {
    return (
      <View style={[styles.placeholder, { height }]}>
        <Text style={styles.placeholderText}>Loading…</Text>
      </View>
    );
  }

  if (!hasActivity) {
    return (
      <View style={[styles.placeholder, { height }]}>
        <Text style={styles.placeholderText}>
          No income or expense this month yet.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <View style={{ height }}>
        <CartesianChart
          data={points}
          xKey="index"
          yKeys={["income", "expense"]}
          domainPadding={{ left: 8, right: 8, top: 16 }}
          axisOptions={{
            font: axisFont,
            labelColor: theme.muted,
            lineColor: "rgba(255, 255, 255, 0.08)",
            tickCount: {
              x: Math.min(points.length, 6),
              y: 4,
            },
            formatXLabel: (value) => {
              const index = Math.round(Number(value));
              if (!xTickIndices.has(index)) return "";
              return points[index]?.label ?? "";
            },
            formatYLabel: (value) => {
              const n = Number(value);
              if (!Number.isFinite(n)) return "";
              if (Math.abs(n) >= 1000) {
                return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
              }
              return `${Math.round(n)}`;
            },
          }}
        >
          {({ points: chartPoints, chartBounds }) => (
            <>
              <Area
                points={chartPoints.expense}
                y0={chartBounds.bottom}
                curveType="monotoneX"
              >
                <LinearGradient
                  start={vec(0, chartBounds.top)}
                  end={vec(0, chartBounds.bottom)}
                  colors={[
                    "rgba(239, 68, 68, 0.22)",
                    "rgba(239, 68, 68, 0)",
                  ]}
                />
              </Area>
              <Area
                points={chartPoints.income}
                y0={chartBounds.bottom}
                curveType="monotoneX"
              >
                <LinearGradient
                  start={vec(0, chartBounds.top)}
                  end={vec(0, chartBounds.bottom)}
                  colors={[
                    "rgba(34, 197, 94, 0.22)",
                    "rgba(34, 197, 94, 0)",
                  ]}
                />
              </Area>
              <Line
                points={chartPoints.expense}
                color={EXPENSE_COLOR}
                strokeWidth={2.25}
                curveType="monotoneX"
              />
              <Line
                points={chartPoints.income}
                color={INCOME_COLOR}
                strokeWidth={2.25}
                curveType="monotoneX"
              />
            </>
          )}
        </CartesianChart>
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View
            style={[styles.legendSwatch, { backgroundColor: INCOME_COLOR }]}
          />
          <Text style={styles.legendLabel}>Income</Text>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[styles.legendSwatch, { backgroundColor: EXPENSE_COLOR }]}
          />
          <Text style={styles.legendLabel}>Expense</Text>
        </View>
      </View>
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
    gap: 12,
    marginTop: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendSwatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  legendLabel: {
    color: theme.muted,
    fontSize: 11,
  },
});
