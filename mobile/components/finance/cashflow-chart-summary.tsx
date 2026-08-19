import { StyleSheet, Text, View } from "react-native";

import {
  cashflowChangePercent,
  formatCashflowChangePercent,
  formatCashflowRangeLabel,
} from "../../lib/cashflow-charts";
import { formatCents } from "../../lib/finance-format";
import { colors } from "../../lib/theme";

type Sense = "income" | "spend" | "net";

type Props = {
  year: number;
  asOf: string;
  ytdCents: number;
  priorYtdCents: number;
  loading?: boolean;
  sense?: Sense;
};

function parseAsOfDate(asOf: string): Date {
  const [y, m, d] = asOf.split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

/** YTD total + prior-year compare header (desktop CashflowChartSummary). */
export function CashflowChartSummary({
  year,
  asOf,
  ytdCents,
  priorYtdCents,
  loading = false,
  sense = "net",
}: Props) {
  const asOfDate = parseAsOfDate(asOf);
  const rangeLabel = formatCashflowRangeLabel(
    new Date(year, 0, 1),
    asOfDate,
  );
  const priorRangeLabel = formatCashflowRangeLabel(
    new Date(year - 1, 0, 1),
    new Date(year - 1, asOfDate.getMonth(), asOfDate.getDate()),
  );

  const change = cashflowChangePercent(ytdCents, priorYtdCents);
  const changeUp = change == null ? ytdCents >= 0 : change >= 0;

  let totalTone: "positive" | "negative" | "neutral" = "neutral";
  if (sense === "income") totalTone = "positive";
  else if (sense === "spend") totalTone = "neutral";
  else totalTone = ytdCents >= 0 ? "positive" : "negative";

  let deltaTone: "positive" | "negative" = changeUp ? "positive" : "negative";
  if (sense === "spend") {
    deltaTone = changeUp ? "negative" : "positive";
  }

  return (
    <View style={styles.summary}>
      <Text style={styles.range}>{rangeLabel}</Text>
      <Text
        style={[
          styles.total,
          totalTone === "positive" ? styles.totalPositive : null,
          totalTone === "negative" ? styles.totalNegative : null,
        ]}
      >
        {loading ? "…" : formatCents(ytdCents)}
      </Text>
      <View style={styles.compare}>
        {change != null ? (
          <Text
            style={[
              styles.delta,
              deltaTone === "positive"
                ? styles.deltaPositive
                : styles.deltaNegative,
            ]}
          >
            {changeUp ? "▲" : "▼"}
            {formatCashflowChangePercent(Math.abs(change))}
          </Text>
        ) : ytdCents !== 0 ? (
          <Text
            style={[
              styles.delta,
              sense === "spend" ? styles.deltaNegative : styles.deltaPositive,
            ]}
          >
            New
          </Text>
        ) : null}
        <Text style={styles.compareText} numberOfLines={2}>
          vs {formatCents(priorYtdCents)} in {priorRangeLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    gap: 4,
    marginBottom: 8,
  },
  range: {
    color: colors.muted,
    fontSize: 12,
  },
  total: {
    color: colors.foreground,
    fontSize: 26,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  totalPositive: {
    color: "#22c55e",
  },
  totalNegative: {
    color: "#ef4444",
  },
  compare: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  delta: {
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  deltaPositive: {
    color: "#22c55e",
  },
  deltaNegative: {
    color: "#ef4444",
  },
  compareText: {
    flexShrink: 1,
    color: colors.muted,
    fontSize: 12,
  },
});
