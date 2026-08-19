import {
  LinearGradient,
  matchFont,
  vec,
} from "@shopify/react-native-skia";
import { useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Area, CartesianChart, Line } from "victory-native";

import type { AssetsDebtChartPoint } from "../../lib/finance-chart-series";
import { colors as theme } from "../../lib/theme";

const ASSETS_COLOR = "#7fc8a9";
const DEBT_COLOR = "#f27d9d";

const axisFont = matchFont({
  fontFamily: Platform.select({ ios: "Helvetica", default: "sans-serif" }),
  fontSize: 10,
});

type Props = {
  points: AssetsDebtChartPoint[];
  height?: number;
};

/** Assets vs debt line chart (dashboard widget). */
export function AssetsDebtChart({ points, height = 160 }: Props) {
  const hasDebt = useMemo(
    () => points.some((point) => point.debt > 0),
    [points],
  );

  if (points.length < 2) {
    return (
      <View style={[styles.placeholder, { height }]}>
        <Text style={styles.placeholderText}>Not enough history yet.</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={{ height }}>
        <CartesianChart
          data={points}
          xKey="index"
          yKeys={["assets", "debt"]}
          domainPadding={{ top: 16, bottom: 8 }}
          axisOptions={{
            font: axisFont,
            labelColor: theme.muted,
            lineColor: "rgba(255, 255, 255, 0.08)",
            tickCount: { x: 4, y: 4 },
            formatXLabel: (value) => {
              const point = points[Math.round(Number(value))];
              // "MM-DD" keeps the axis compact; year shifts are visible in data.
              return point ? point.date.slice(5) : "";
            },
            formatYLabel: (value) => `${Math.round(Number(value) / 1000)}k`,
          }}
        >
          {({ points: chartPoints, chartBounds }) => (
            <>
              <Area
                points={chartPoints.assets}
                y0={chartBounds.bottom}
                curveType="monotoneX"
              >
                <LinearGradient
                  start={vec(0, chartBounds.top)}
                  end={vec(0, chartBounds.bottom)}
                  colors={["rgba(127, 200, 169, 0.28)", "rgba(127, 200, 169, 0)"]}
                />
              </Area>
              <Line
                points={chartPoints.assets}
                color={ASSETS_COLOR}
                strokeWidth={2}
                curveType="monotoneX"
              />
              {hasDebt ? (
                <Line
                  points={chartPoints.debt}
                  color={DEBT_COLOR}
                  strokeWidth={1.5}
                  curveType="monotoneX"
                />
              ) : null}
            </>
          )}
        </CartesianChart>
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: ASSETS_COLOR }]} />
          <Text style={styles.legendLabel}>Assets</Text>
        </View>
        {hasDebt ? (
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: DEBT_COLOR }]} />
            <Text style={styles.legendLabel}>Debt</Text>
          </View>
        ) : null}
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
