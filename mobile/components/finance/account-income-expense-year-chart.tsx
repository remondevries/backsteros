import {
  LinearGradient,
  matchFont,
  vec,
} from "@shopify/react-native-skia";
import { useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Area, CartesianChart, Line } from "victory-native";

import {
  formatIncomeExpenseAxisEuros,
  incomeExpenseYearHasActivity,
  type IncomeExpenseYearPoint,
} from "../../lib/finance-chart-series";
import { colors as theme } from "../../lib/theme";

const INCOME_COLOR = "#22c55e";
const EXPENSE_COLOR = "#ef4444";

const axisFont = matchFont({
  fontFamily: Platform.select({ ios: "Helvetica", default: "sans-serif" }),
  fontSize: 10,
});

type Props = {
  points: IncomeExpenseYearPoint[];
  loading?: boolean;
  height?: number;
};

/**
 * Monthly income + expense line chart for an account
 * (desktop AccountIncomeExpenseChart with cashflow months).
 */
export function AccountIncomeExpenseYearChart({
  points,
  loading = false,
  height = 200,
}: Props) {
  const hasActivity = incomeExpenseYearHasActivity(points);

  const yDomain = useMemo(() => {
    let max = 0;
    for (const point of points) {
      max = Math.max(max, point.income, point.expense);
    }
    // Nice headroom so peaks are not clipped by the chart frame.
    return { min: 0, max: max <= 0 ? 1 : max * 1.12 } as const;
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
          No income or expense this year yet.
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
          domain={{ y: [yDomain.min, yDomain.max] }}
          domainPadding={{ left: 12, right: 12, top: 8, bottom: 4 }}
          axisOptions={{
            font: axisFont,
            labelColor: theme.muted,
            lineColor: "rgba(255, 255, 255, 0.08)",
            tickCount: {
              x: Math.min(points.length, 6),
              y: 4,
            },
            formatXLabel: (value) =>
              points[Math.round(Number(value))]?.label ?? "",
            formatYLabel: (value) => formatIncomeExpenseAxisEuros(Number(value)),
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
