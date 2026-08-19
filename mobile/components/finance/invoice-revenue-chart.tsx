import {
  Circle,
  LinearGradient,
  matchFont,
  vec,
} from "@shopify/react-native-skia";
import { useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Area, CartesianChart, Line, type PointsArray } from "victory-native";

import type { InvoiceRevenueChartPoint } from "../../lib/finance-chart-series";
import { formatMonthShort } from "../../lib/finance-format";
import { colors as theme } from "../../lib/theme";

/** Matches desktop Moneybird invoiced series (`#3171de`). */
const INVOICED_COLOR = "#3171de";
const EXPENSES_COLOR = "#c45b5b";
/** Dot fill matches the chart card / pure-black canvas (desktop `--background`). */
const DOT_FILL = theme.background;

const axisFont = matchFont({
  fontFamily: Platform.select({ ios: "Helvetica", default: "sans-serif" }),
  fontSize: 9,
});

type Props = {
  points: InvoiceRevenueChartPoint[];
  year: number;
  height?: number;
};

/** Desktop-style month markers: stroked ring + inner fill. */
function MonthDots({
  points,
  color,
}: {
  points: PointsArray;
  color: string;
}) {
  return (
    <>
      {points.map((point, index) => {
        if (typeof point.y !== "number") return null;
        return (
          <Circle
            key={`dot-outer-${index}`}
            cx={point.x}
            cy={point.y}
            r={4}
            color={DOT_FILL}
          />
        );
      })}
      {points.map((point, index) => {
        if (typeof point.y !== "number") return null;
        return (
          <Circle
            key={`dot-ring-${index}`}
            cx={point.x}
            cy={point.y}
            r={4}
            color={color}
            style="stroke"
            strokeWidth={2}
          />
        );
      })}
      {points.map((point, index) => {
        if (typeof point.y !== "number") return null;
        return (
          <Circle
            key={`dot-inner-${index}`}
            cx={point.x}
            cy={point.y}
            r={1.75}
            color={color}
          />
        );
      })}
    </>
  );
}

/** Dual-line chart: Moneybird invoiced vs account expenses (desktop visual parity). */
export function InvoiceRevenueChart({ points, year, height = 180 }: Props) {
  const hasData = useMemo(
    () =>
      points.some(
        (point) =>
          (point.invoiced != null && point.invoiced !== 0) ||
          (point.expenses != null && point.expenses !== 0),
      ),
    [points],
  );

  if (!hasData) {
    return (
      <View style={[styles.placeholder, { height }]}>
        <Text style={styles.placeholderText}>
          No invoiced revenue or account expenses in {year} yet.
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
          yKeys={["invoiced", "expenses"]}
          domainPadding={{ left: 8, right: 8, top: 16 }}
          axisOptions={{
            font: axisFont,
            labelColor: theme.muted,
            lineColor: "rgba(255, 255, 255, 0.08)",
            tickCount: { x: 12, y: 4 },
            formatXLabel: (value) => {
              const point = points[Math.round(Number(value))];
              return point ? formatMonthShort(point.month) : "";
            },
            formatYLabel: (value) => {
              const n = Math.abs(Number(value));
              if (n >= 1000) return `${Math.round(Number(value) / 1000)}k`;
              return `${Math.round(Number(value))}`;
            },
          }}
        >
          {({ points: chartPoints, chartBounds }) => (
            <>
              <Area
                points={chartPoints.expenses}
                y0={chartBounds.bottom}
                curveType="monotoneX"
              >
                <LinearGradient
                  start={vec(0, chartBounds.top)}
                  end={vec(0, chartBounds.bottom)}
                  colors={[
                    "rgba(196, 91, 91, 0.22)",
                    "rgba(196, 91, 91, 0.05)",
                    "rgba(196, 91, 91, 0)",
                  ]}
                />
              </Area>
              <Area
                points={chartPoints.invoiced}
                y0={chartBounds.bottom}
                curveType="monotoneX"
              >
                <LinearGradient
                  start={vec(0, chartBounds.top)}
                  end={vec(0, chartBounds.bottom)}
                  colors={[
                    "rgba(49, 113, 222, 0.22)",
                    "rgba(49, 113, 222, 0.05)",
                    "rgba(49, 113, 222, 0)",
                  ]}
                />
              </Area>
              <Line
                points={chartPoints.expenses}
                color={EXPENSES_COLOR}
                strokeWidth={2.25}
                curveType="monotoneX"
                animate={{ type: "timing", duration: 300 }}
              />
              <Line
                points={chartPoints.invoiced}
                color={INVOICED_COLOR}
                strokeWidth={2.25}
                curveType="monotoneX"
                animate={{ type: "timing", duration: 300 }}
              />
              <MonthDots points={chartPoints.expenses} color={EXPENSES_COLOR} />
              <MonthDots points={chartPoints.invoiced} color={INVOICED_COLOR} />
            </>
          )}
        </CartesianChart>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  placeholderText: {
    color: theme.muted,
    fontSize: 13,
    textAlign: "center",
  },
});
